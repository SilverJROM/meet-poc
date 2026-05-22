import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IceConfigService } from './ice-config.service';
import { ViewportService } from './viewport.service';
import { applyPresenceUpdate, applyRosterSnapshot, removeFromRoster } from './sfu-roster-utils.js';
import { reconcileSubscribedMids } from './sfu-mid-reconcile.js';
import type { SfuDiagnosticsSnapshot, SfuOutboundTrackStats, SfuInboundTrackStats, SfuSubscribeLatency, DiagnosticsCandidatePair } from './meeting-sessions.service';
export type { RemotePublisher } from './sfu-roster-utils.js';

export interface SfuTrackModel {
  trackName: string;
  kind: string;
  mid: string;
  status: 'live' | 'closed';
}

export interface LocalPublishState {
  cfSessionId: string;
  status: 'publishing' | 'published' | 'error';
  tracks: SfuTrackModel[];
  error?: string;
}

export interface SubscribedTrackEntry {
  publisherClientId: string;
  trackName: string;
  kind: string;
  mid: string;
}

const VIDEO_SIMULCAST_ENCODINGS: RTCRtpEncodingParameters[] = [
  { rid: 'h', scaleResolutionDownBy: 1, maxBitrate: 1_200_000 },
  { rid: 'm', scaleResolutionDownBy: 2, maxBitrate: 400_000 },
  { rid: 'l', scaleResolutionDownBy: 4, maxBitrate: 120_000 },
];

@Injectable({ providedIn: 'root' })
export class SfuClientService {
  private readonly http = inject(HttpClient);
  private readonly iceConfigService = inject(IceConfigService);
  private readonly viewport = inject(ViewportService);

  readonly localPublishState = signal<LocalPublishState | null>(null);
  readonly remotePublishers = signal<Map<string, import('./sfu-roster-utils.js').RemotePublisher>>(new Map());
  readonly remoteStreams = signal<Map<string, MediaStream>>(new Map());
  readonly remoteScreenStreams = signal<Map<string, MediaStream>>(new Map());
  readonly subscribedTracks = signal<Map<string, SubscribedTrackEntry>>(new Map());
  // Bumped on doSubscribe failure so the subscription effect re-fires for a retry
  readonly subscribeRetryVersion = signal(0);

  private pc: RTCPeerConnection | null = null;
  private audioSender: RTCRtpSender | null = null;
  private videoSender: RTCRtpSender | null = null;
  private screenSender: RTCRtpSender | null = null;
  // Single serialized queue — all PC-mutating ops run through enqueue() (publish/subscribe/close/renegotiate)
  private opQueue: Promise<void> = Promise.resolve();

  private callerCreds: { clientKey: string; participantId: string; sessionId: string } | null = null;
  private subscribedClientIds = new Set<string>();
  private midToEntry = new Map<string, SubscribedTrackEntry>();
  private subscribeRetryAttempts = new Map<string, number>();
  private readonly SUBSCRIBE_RETRY_CAP = 7;
  // Subscribe-latency: time from subscribe issued → first ontrack arrival per publisher
  private subscribeInitiatedAt = new Map<string, number>();
  private subscribeFirstFrameAt = new Map<string, number>();

  enqueue<T>(op: () => Promise<T>): Promise<T> {
    const result = this.opQueue.then(() => op());
    this.opQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  publish(params: { clientKey: string; participantId: string; sessionId: string; localStream: MediaStream | null }): Promise<void> {
    return this.enqueue(() => this.doPublish(params));
  }

  subscribeIfNeeded(publisher: import('./sfu-roster-utils.js').RemotePublisher): void {
    // Skip self
    if (publisher.cfSessionId === this.localPublishState()?.cfSessionId) return;
    // Skip already-subscribed
    if (this.subscribedClientIds.has(publisher.clientId)) return;
    // Skip if no tracks to subscribe to
    if (!publisher.tracks.length) return;
    // Mark before enqueue to prevent double-subscribe
    this.subscribedClientIds.add(publisher.clientId);
    void this.enqueue(() => this.doSubscribe(publisher)).catch(() => {
      const attempts = (this.subscribeRetryAttempts.get(publisher.clientId) ?? 0) + 1;
      this.subscribeRetryAttempts.set(publisher.clientId, attempts);
      if (attempts > this.SUBSCRIBE_RETRY_CAP) {
        console.warn(`[SFU] subscribe permanently stopped for ${publisher.clientId} after ${attempts} attempts — guard stays set until cfSessionId changes`);
        return; // guard stays set, no more retries
      }
      const backoffMs = Math.min(250 * Math.pow(2, attempts - 1), 4000);
      this.subscribedClientIds.delete(publisher.clientId);
      setTimeout(() => this.subscribeRetryVersion.update((v) => v + 1), backoffMs);
    });
  }

  replaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    return this.enqueue(() => this.doReplaceVideoTrack(track));
  }

  replaceAudioTrack(track: MediaStreamTrack | null): Promise<void> {
    return this.enqueue(() => this.doReplaceAudioTrack(track));
  }

  publishScreen(displayTrack: MediaStreamTrack): Promise<void> {
    return this.enqueue(() => this.doPublishScreen(displayTrack));
  }

  stopScreen(): Promise<void> {
    return this.enqueue(() => this.doStopScreen());
  }

  getStats(): Promise<RTCStatsReport | null> {
    return this.pc ? this.pc.getStats() : Promise.resolve(null);
  }

  async collectDiagnostics(): Promise<SfuDiagnosticsSnapshot | null> {
    const pc = this.pc;
    const publishState = this.localPublishState();
    if (!pc || !publishState) return null;

    let stats: RTCStatsReport;
    try {
      stats = await pc.getStats();
    } catch {
      return null;
    }

    // --- Candidate pair / transport ---
    let rttMs: number | null = null;
    let localCandidateType: string | null = null;
    let remoteCandidateType: string | null = null;
    let selectedCandidatePair: DiagnosticsCandidatePair | null = null;

    for (const stat of stats.values()) {
      if (stat.type === 'candidate-pair' && (stat.nominated === true || stat.state === 'succeeded')) {
        rttMs = typeof stat.currentRoundTripTime === 'number' ? Math.round(stat.currentRoundTripTime * 1000) : null;
        const localCand = stat.localCandidateId ? stats.get(stat.localCandidateId) : null;
        const remoteCand = stat.remoteCandidateId ? stats.get(stat.remoteCandidateId) : null;
        localCandidateType = localCand?.candidateType ?? null;
        remoteCandidateType = remoteCand?.candidateType ?? null;
        selectedCandidatePair = {
          id: stat.id ?? null,
          state: stat.state ?? null,
          selected: true,
          nominated: stat.nominated ?? false,
          local: localCand
            ? { id: localCand.id ?? null, candidateType: localCand.candidateType ?? null, protocol: localCand.protocol ?? null, address: localCand.address ?? null, port: localCand.port ?? null }
            : null,
          remote: remoteCand
            ? { id: remoteCand.id ?? null, candidateType: remoteCand.candidateType ?? null, protocol: remoteCand.protocol ?? null, address: remoteCand.address ?? null, port: remoteCand.port ?? null }
            : null,
        };
        break;
      }
    }

    // --- Outbound (publish) per track ---
    const outboundTracks: SfuOutboundTrackStats[] = [];
    const localTracksByMid = new Map(publishState.tracks.map((t) => [t.mid, t]));

    for (const stat of stats.values()) {
      if (stat.type !== 'outbound-rtp') continue;
      const publishTrack = stat.mid ? localTracksByMid.get(stat.mid) : null;
      outboundTracks.push({
        trackName: publishTrack?.trackName ?? `${stat.kind ?? 'unknown'}:${stat.rid ?? stat.ssrc ?? '?'}`,
        kind: publishTrack?.kind ?? stat.kind ?? 'unknown',
        rid: stat.rid ?? null,
        bytesSent: stat.bytesSent ?? null,
        packetsSent: stat.packetsSent ?? null,
        framesEncoded: stat.framesEncoded ?? null,
        framesSent: stat.framesSent ?? null,
        qualityLimitationReason: stat.qualityLimitationReason ?? null,
      });
    }

    // --- Inbound (subscribe) per remote track ---
    const inboundTracks: SfuInboundTrackStats[] = [];
    for (const stat of stats.values()) {
      if (stat.type !== 'inbound-rtp') continue;
      const mid = stat.mid;
      if (!mid) continue;
      const entry = this.midToEntry.get(mid);
      if (!entry) continue;
      inboundTracks.push({
        publisherClientId: entry.publisherClientId,
        trackName: entry.trackName,
        kind: entry.kind,
        rid: stat.rid ?? null,
        bytesReceived: stat.bytesReceived ?? null,
        packetsReceived: stat.packetsReceived ?? null,
        packetsLost: stat.packetsLost ?? null,
        framesDecoded: stat.framesDecoded ?? null,
        framesReceived: stat.framesReceived ?? null,
        jitterBufferDelay: stat.jitterBufferDelay ?? null,
        jitterBufferEmittedCount: stat.jitterBufferEmittedCount ?? null,
        concealedSamples: stat.concealedSamples ?? null,
      });
    }

    // --- Subscribe latencies ---
    const subscribeLatencies: SfuSubscribeLatency[] = [];
    for (const [publisherClientId, initiatedAtMs] of this.subscribeInitiatedAt) {
      const firstFrameAtMs = this.subscribeFirstFrameAt.get(publisherClientId) ?? null;
      subscribeLatencies.push({
        publisherClientId,
        initiatedAtMs,
        firstFrameAtMs,
        latencyMs: firstFrameAtMs !== null ? firstFrameAtMs - initiatedAtMs : null,
      });
    }

    return {
      cfSessionId: publishState.cfSessionId,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      rttMs,
      localCandidateType,
      remoteCandidateType,
      selectedCandidatePair,
      outboundTracks,
      inboundTracks,
      subscribeLatencies,
    };
  }

  getVideoEncodings(): RTCRtpEncodingParameters[] {
    return this.videoSender?.getParameters().encodings ?? [];
  }

  updateCameraLayer(): Promise<void> {
    return this.enqueue(() => this.doUpdateCameraLayer());
  }

  private preferredCameraRid(): 'h' | 'm' | 'l' {
    return this.viewport.isMobile() ? 'l' : 'h';
  }

  private isAnyScreenActive(): boolean {
    if (this.remoteScreenStreams().size > 0) return true;
    return this.localPublishState()?.tracks.some((t) => t.kind === 'screen' && t.status === 'live') ?? false;
  }

  private cameraRidNow(): 'h' | 'm' | 'l' {
    return this.isAnyScreenActive() ? 'l' : this.preferredCameraRid();
  }

  private async doUpdateCameraLayer(): Promise<void> {
    const creds = this.callerCreds;
    const publishState = this.localPublishState();
    if (!creds || !publishState || publishState.status !== 'published') return;

    const cameraMids: string[] = [];
    for (const [mid, entry] of this.midToEntry) {
      if (entry.kind === 'video') cameraMids.push(mid);
    }
    if (!cameraMids.length) return;

    const rid = this.cameraRidNow();
    const priorityOrdering = rid === 'l' ? ['l', 'm', 'h'] : ['h', 'm', 'l'];

    await firstValueFrom(
      this.http.put('/api/sfu/tracks/update', {
        ...creds,
        cfSessionId: publishState.cfSessionId,
        tracks: cameraMids.map((mid) => ({ mid, preferredRid: rid, priorityOrdering, ridNotAvailable: 'degrade' })),
      }),
    );
  }

  handleSfuPresence(msg: { clientId: string; participantId: string; cfSessionId: string; tracks: { trackName: string; kind: string }[]; revision: number }): void {
    const prev = this.remotePublishers().get(msg.clientId);
    // New cfSessionId = publisher reconnected — reset retry state so fresh subscribe can happen
    if (prev && prev.cfSessionId !== msg.cfSessionId) {
      this.subscribeRetryAttempts.delete(msg.clientId);
      this.subscribedClientIds.delete(msg.clientId);
    }
    const prevHadScreen = prev?.tracks.some((t) => t.kind === 'screen') ?? false;
    const next = applyPresenceUpdate(this.remotePublishers(), msg);
    if (next !== this.remotePublishers()) this.remotePublishers.set(next);
    const nowPublisher = next.get(msg.clientId);
    const nowHasScreen = nowPublisher?.tracks.some((t) => t.kind === 'screen') ?? false;
    if (prevHadScreen && !nowHasScreen) {
      this.tearDownScreenSubscription(msg.clientId);
    } else if (!prevHadScreen && nowHasScreen && nowPublisher) {
      // Screen track added mid-call — subscribe to just the new screen track.
      // subscribeIfNeeded is guarded by subscribedClientIds (publisher already subscribed for camera/audio),
      // so we need a separate partial-subscribe path for the screen track.
      this.subscribeNewScreenTrack(nowPublisher);
    }
  }

  handleSfuRoster(publishers: { clientId: string; participantId: string; cfSessionId: string; tracks: { trackName: string; kind: string }[]; revision: number }[]): void {
    this.remotePublishers.set(applyRosterSnapshot(publishers));
  }

  removePeer(clientId: string): void {
    this.tearDownPeerSubscription(clientId);
    const next = removeFromRoster(this.remotePublishers(), clientId);
    if (next !== this.remotePublishers()) this.remotePublishers.set(next);
  }

  private tearDownPeerSubscription(clientId: string): void {
    if (!this.subscribedClientIds.has(clientId)) return;

    const mids: string[] = [];
    const nextSubscribed = new Map(this.subscribedTracks());
    for (const [mid, entry] of nextSubscribed) {
      if (entry.publisherClientId === clientId) {
        mids.push(mid);
        nextSubscribed.delete(mid);
        this.midToEntry.delete(mid);
      }
    }
    this.subscribedTracks.set(nextSubscribed);

    const nextStreams = new Map(this.remoteStreams());
    nextStreams.delete(clientId);
    this.remoteStreams.set(nextStreams);

    const nextScreenStreams = new Map(this.remoteScreenStreams());
    if (nextScreenStreams.has(clientId)) {
      nextScreenStreams.delete(clientId);
      this.remoteScreenStreams.set(nextScreenStreams);
    }

    this.subscribedClientIds.delete(clientId);
    this.subscribeRetryAttempts.delete(clientId);
    this.subscribeInitiatedAt.delete(clientId);
    this.subscribeFirstFrameAt.delete(clientId);

    if (mids.length > 0) {
      const creds = this.callerCreds;
      const cfSessionId = this.localPublishState()?.cfSessionId ?? '';
      if (creds && cfSessionId) {
        void this.enqueue(() => this.doClose(mids, creds, cfSessionId));
      }
    }
  }

  private subscribeNewScreenTrack(publisher: import('./sfu-roster-utils.js').RemotePublisher): void {
    const screenTracks = publisher.tracks.filter((t) => t.kind === 'screen');
    if (!screenTracks.length) return;
    // Skip any screen tracks already in our midToEntry (avoid double-subscribe on rapid presence updates)
    const alreadySubscribed = new Set([...this.midToEntry.values()].map((e) => e.trackName));
    const newTracks = screenTracks.filter((t) => !alreadySubscribed.has(t.trackName));
    if (!newTracks.length) return;
    void this.enqueue(() => this.doSubscribeTracks(publisher, newTracks));
  }

  private tearDownScreenSubscription(clientId: string): void {
    const nextScreenStreams = new Map(this.remoteScreenStreams());
    if (!nextScreenStreams.has(clientId)) return;
    nextScreenStreams.delete(clientId);
    this.remoteScreenStreams.set(nextScreenStreams);

    const mids: string[] = [];
    const nextSubscribed = new Map(this.subscribedTracks());
    for (const [mid, entry] of nextSubscribed) {
      if (entry.publisherClientId === clientId && entry.kind === 'screen') {
        mids.push(mid);
        nextSubscribed.delete(mid);
        this.midToEntry.delete(mid);
      }
    }
    if (mids.length > 0) {
      this.subscribedTracks.set(nextSubscribed);
      const creds = this.callerCreds;
      const cfSessionId = this.localPublishState()?.cfSessionId ?? '';
      if (creds && cfSessionId) {
        void this.enqueue(() => this.doClose(mids, creds, cfSessionId));
      }
    }
  }

  private async doClose(mids: string[], creds: { clientKey: string; participantId: string; sessionId: string }, cfSessionId: string): Promise<void> {
    type CloseResp = { requiresImmediateRenegotiation?: boolean; sessionDescription?: RTCSessionDescriptionInit };
    let resp: CloseResp | null = null;
    try {
      resp = await firstValueFrom(this.http.put<CloseResp>('/api/sfu/tracks/close', { ...creds, cfSessionId, tracks: mids.map((mid) => ({ mid })) }));
    } catch {
      // CF may reject close of remote-subscriber tracks — safe to ignore, CF auto-cleans on session GC
    }
    if (resp?.requiresImmediateRenegotiation && resp.sessionDescription && this.pc) {
      try {
        await this.pc.setRemoteDescription(resp.sessionDescription);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await firstValueFrom(
          this.http.put('/api/sfu/renegotiate', {
            ...creds,
            cfSessionId,
            sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
          }),
        );
      } catch {
        // Renegotiation on close failed — PC may be in a partially stale state; next subscribe
        // will re-sync via its own renegotiation cycle
      }
    }
  }

  private async doReplaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    if (!this.videoSender) return;
    await this.videoSender.replaceTrack(track);
  }

  private async doReplaceAudioTrack(track: MediaStreamTrack | null): Promise<void> {
    if (!this.audioSender) return;
    await this.audioSender.replaceTrack(track);
  }

  private async doPublishScreen(displayTrack: MediaStreamTrack): Promise<void> {
    const publishState = this.localPublishState();
    const creds = this.callerCreds;
    if (!publishState || publishState.status !== 'published' || !this.pc || !creds) return;

    const { clientKey, participantId, sessionId } = creds;
    const cfSessionId = publishState.cfSessionId;
    const trackName = `${participantId}:${Date.now()}:screen:${crypto.randomUUID()}`;

    // Add screen as a NEW transceiver — requires renegotiation (publish-style, not replaceTrack)
    const transceiver = this.pc.addTransceiver(displayTrack, { direction: 'sendrecv' });
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    const mid = transceiver.mid!;

    const tracksRes = await firstValueFrom(
      this.http.post<{ sessionDescription: RTCSessionDescriptionInit }>('/api/sfu/tracks', {
        clientKey,
        participantId,
        sessionId,
        cfSessionId,
        sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
        tracks: [{ location: 'local', mid, trackName }],
      }),
    );

    await this.pc.setRemoteDescription(tracksRes.sessionDescription);
    this.screenSender = transceiver.sender;

    this.localPublishState.set({
      ...publishState,
      tracks: [...publishState.tracks, { trackName, kind: 'screen', mid, status: 'live' }],
    });
  }

  private async doStopScreen(): Promise<void> {
    const publishState = this.localPublishState();
    const creds = this.callerCreds;
    if (!publishState || !creds) return;

    const screenTrack = publishState.tracks.find((t) => t.kind === 'screen' && t.status === 'live');
    if (!screenTrack) return;

    type CloseResponse = { requiresImmediateRenegotiation?: boolean; sessionDescription?: RTCSessionDescriptionInit };
    let closeRes: CloseResponse | null = null;
    try {
      closeRes = await firstValueFrom(
        this.http.put<CloseResponse>('/api/sfu/tracks/close', {
          ...creds,
          cfSessionId: publishState.cfSessionId,
          tracks: [{ mid: screenTrack.mid }],
        }),
      );
    } catch (err) {
      console.warn('[sfu] tracks/close for screen failed (track may already be gone):', err);
    }

    // Handle renegotiation that CF may require on close
    if (closeRes?.requiresImmediateRenegotiation && closeRes.sessionDescription && this.pc) {
      await this.pc.setRemoteDescription(closeRes.sessionDescription);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await firstValueFrom(
        this.http.put('/api/sfu/renegotiate', {
          ...creds,
          cfSessionId: publishState.cfSessionId,
          sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
        }),
      );
    }

    this.screenSender = null;
    this.localPublishState.set({
      ...publishState,
      tracks: publishState.tracks.map((t) => (t.mid === screenTrack.mid ? { ...t, status: 'closed' as const } : t)),
    });
  }

  // Called when a drop-reconnect is detected (admitted with wasInCall=true, SFU mode).
  // The old CF session is dead — no API calls needed. Clears all state so re-publish + re-subscribe start clean.
  resetForReconnect(): void {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.audioSender = null;
    this.videoSender = null;
    this.screenSender = null;
    this.callerCreds = null;
    this.subscribedClientIds.clear();
    this.midToEntry.clear();
    this.subscribeRetryAttempts.clear();
    this.subscribeInitiatedAt.clear();
    this.subscribeFirstFrameAt.clear();
    this.opQueue = Promise.resolve();
    this.localPublishState.set(null);
    this.remotePublishers.set(new Map());
    this.remoteStreams.set(new Map());
    this.remoteScreenStreams.set(new Map());
    this.subscribedTracks.set(new Map());
  }

  // Exit teardown: close the SFU PC immediately (stops media), then fire-and-forget the CF
  // track-close PUT. State is cleared immediately so double-calls (deliberate-exit cleanupCall
  // followed by ngOnDestroy cleanupCall) are no-ops. CF 30s GC is the fallback.
  closeLiveTracksForExit(): void {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
      this.audioSender = null;
      this.videoSender = null;
      this.screenSender = null;
    }

    // Snapshot and clear immediately — makes this call idempotent (second call returns early)
    const publishState = this.localPublishState();
    const creds = this.callerCreds;
    this.callerCreds = null;
    this.localPublishState.set(null);

    if (!publishState || !creds || publishState.status !== 'published') return;
    const liveMids = publishState.tracks.filter((t) => t.status === 'live').map((t) => t.mid);
    if (!liveMids.length) return;
    this.http
      .put('/api/sfu/tracks/close', {
        ...creds,
        cfSessionId: publishState.cfSessionId,
        tracks: liveMids.map((mid) => ({ mid })),
      })
      .subscribe({ error: () => {} });
  }

  destroy(): void {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.audioSender = null;
    this.videoSender = null;
    this.screenSender = null;
    this.callerCreds = null;
    this.subscribedClientIds.clear();
    this.midToEntry.clear();
    this.subscribeRetryAttempts.clear();
    this.subscribeInitiatedAt.clear();
    this.subscribeFirstFrameAt.clear();
    this.localPublishState.set(null);
    this.remotePublishers.set(new Map());
    this.remoteStreams.set(new Map());
    this.remoteScreenStreams.set(new Map());
    this.subscribedTracks.set(new Map());
  }

  private async doPublish(params: { clientKey: string; participantId: string; sessionId: string; localStream: MediaStream | null }): Promise<void> {
    const { clientKey, participantId, sessionId, localStream } = params;
    const epoch = Date.now();

    this.callerCreds = { clientKey, participantId, sessionId };
    this.localPublishState.set({ cfSessionId: '', status: 'publishing', tracks: [] });

    try {
      // ICE: CF STUN first + existing TURN creds as fallback
      const turnServers = await this.iceConfigService.getIceServers();
      const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }, ...turnServers];
      this.pc = new RTCPeerConnection({ iceServers });

      // Set ontrack BEFORE any subscribe requests so no track event is missed
      this.pc.ontrack = (event) => {
        const mid = event.transceiver.mid;
        if (!mid) return;
        const entry = this.midToEntry.get(mid);
        if (!entry) return;
        if (!this.subscribeFirstFrameAt.has(entry.publisherClientId)) {
          this.subscribeFirstFrameAt.set(entry.publisherClientId, Date.now());
        }
        if (entry.kind === 'screen') {
          const next = new Map(this.remoteScreenStreams());
          let stream = next.get(entry.publisherClientId);
          if (!stream) {
            stream = new MediaStream();
            next.set(entry.publisherClientId, stream);
          }
          stream.addTrack(event.track);
          this.remoteScreenStreams.set(next);
        } else {
          const next = new Map(this.remoteStreams());
          let stream = next.get(entry.publisherClientId);
          if (!stream) {
            stream = new MediaStream();
            next.set(entry.publisherClientId, stream);
          }
          stream.addTrack(event.track);
          this.remoteStreams.set(next);
        }
      };

      // Add local tracks with pre-negotiated video transceiver (DR-55/F2: always negotiate video up-front)
      const audioTrack = localStream?.getAudioTracks()[0];
      const audioTransceiver = audioTrack
        ? this.pc.addTransceiver(audioTrack, { direction: 'sendrecv' })
        : this.pc.addTransceiver('audio', { direction: 'sendrecv' });
      this.audioSender = audioTransceiver.sender;

      const videoTrack = localStream?.getVideoTracks()[0];
      const videoTransceiver = videoTrack
        ? this.pc.addTransceiver(videoTrack, { direction: 'sendrecv', sendEncodings: VIDEO_SIMULCAST_ENCODINGS })
        : this.pc.addTransceiver('video', { direction: 'sendrecv', sendEncodings: VIDEO_SIMULCAST_ENCODINGS }); // Camera off: pre-negotiate so replaceTrack works later without renegotiation; sendEncodings persists through replaceTrack
      this.videoSender = videoTransceiver.sender;

      // createOffer → setLocalDescription (mids assigned after SLD)
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // POST /api/sfu/session → cfSessionId
      const sessionRes = await firstValueFrom(
        this.http.post<{ sessionId: string }>('/api/sfu/session', { clientKey, participantId, sessionId }),
      );
      const cfSessionId = sessionRes.sessionId;

      // Build track params for transceivers that have a live sender track
      const trackParams = this.pc
        .getTransceivers()
        .filter((t) => t.mid !== null && t.sender.track !== null)
        .map((t) => {
          const kind = t.sender.track!.kind;
          const trackName = `${participantId}:${epoch}:${kind}:${crypto.randomUUID()}`;
          return { location: 'local' as const, mid: t.mid!, trackName, kind };
        });

      // POST /api/sfu/tracks → answer SDP (must include the offer SDP for CF to produce an answer)
      const tracksRes = await firstValueFrom(
        this.http.post<{ sessionDescription: RTCSessionDescriptionInit }>('/api/sfu/tracks', {
          clientKey,
          participantId,
          sessionId,
          cfSessionId,
          sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
          tracks: trackParams.map(({ location, mid, trackName }) => ({ location, mid, trackName })),
        }),
      );

      // setRemoteDescription with CF answer
      await this.pc.setRemoteDescription(tracksRes.sessionDescription);

      // Persist mid model for close/update in later batches
      const tracks: SfuTrackModel[] = trackParams.map(({ trackName, kind, mid }) => ({
        trackName,
        kind,
        mid,
        status: 'live',
      }));
      this.localPublishState.set({ cfSessionId, status: 'published', tracks });
    } catch (err) {
      this.localPublishState.set({ cfSessionId: '', status: 'error', tracks: [], error: String(err) });
      throw err;
    }
  }

  private async doSubscribe(publisher: import('./sfu-roster-utils.js').RemotePublisher): Promise<void> {
    await this.doSubscribeTracks(publisher, publisher.tracks);
    this.subscribeRetryAttempts.delete(publisher.clientId);
  }

  private async doSubscribeTracks(
    publisher: import('./sfu-roster-utils.js').RemotePublisher,
    tracks: { trackName: string; kind: string }[],
  ): Promise<void> {
    const creds = this.callerCreds;
    const publishState = this.localPublishState();
    if (!creds || !publishState || publishState.status !== 'published' || !this.pc) {
      throw new Error('[sfu] doSubscribeTracks: not ready (no creds/publish/pc)');
    }
    if (!tracks.length) return;
    if (!this.subscribeInitiatedAt.has(publisher.clientId)) {
      this.subscribeInitiatedAt.set(publisher.clientId, Date.now());
    }

    const cfSessionId = publishState.cfSessionId;

    type CfTracksResponse = {
      requiresImmediateRenegotiation?: boolean;
      sessionDescription?: RTCSessionDescriptionInit;
      tracks?: { trackName: string; mid: string }[];
    };

    const rid = this.cameraRidNow();
    const priorityOrdering = rid === 'l' ? ['l', 'm', 'h'] : ['h', 'm', 'l'];

    // kind lookup used by reconcileSubscribedMids below
    const kindMap = new Map(tracks.map((t) => [t.trackName, t.kind]));

    // Snapshot existing transceiver mids before POST — new ones added by CF renegotiation
    const existingMids = new Set(this.pc.getTransceivers().map((t) => t.mid).filter((m): m is string => !!m));

    const res = await firstValueFrom(
      this.http.post<CfTracksResponse>('/api/sfu/tracks', {
        ...creds,
        cfSessionId,
        tracks: tracks.map((t) => {
          const base = { location: 'remote' as const, sessionId: publisher.cfSessionId, trackName: t.trackName };
          if (t.kind === 'video') {
            return { ...base, preferredRid: rid, priorityOrdering, ridNotAvailable: 'degrade' };
          }
          return base;
        }),
      }),
    );

    // CF returns mid:"" for ALL remote-subscribe tracks. With audio+video together that means
    // multiple tracks share the same empty key — seeding midToEntry by rt.mid would collide.
    // Never seed under rt.mid. Populate ONLY after reconciliation with real transceiver mids.
    const responseTracks = res.tracks ?? [];

    // CF may return errorCode (e.g. not_found_track_error) when a reconnecting peer's tracks
    // haven't fully propagated in CF yet — the subscribe fires within ms of the publish completing.
    // Throw so subscribeIfNeeded.catch() clears the guard and retries; subsequent retry wins.
    const errorTrack = (responseTracks as Array<{ trackName: string; mid: string; errorCode?: string }>).find((t) => t.errorCode);
    if (errorTrack) {
      throw new Error(`[sfu] CF subscribe not ready: ${errorTrack.errorCode}`);
    }

    const nextSubscribed = new Map(this.subscribedTracks());

    // Full renegotiation inside this enqueue op — must not interleave with other ops
    if (res.requiresImmediateRenegotiation && res.sessionDescription) {
      await this.pc.setRemoteDescription(res.sessionDescription);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // Real mids are now assigned in the negotiated SDP. Match positionally:
      // responseTracks[i] ↔ newTransceiverMids[i] (CF preserves request order).
      const newTransceiverMids = this.pc
        .getTransceivers()
        .map((t) => t.mid)
        .filter((m): m is string => !!m && !existingMids.has(m));

      const reconciled = reconcileSubscribedMids(responseTracks, newTransceiverMids, kindMap, publisher.clientId);
      for (const r of reconciled) {
        const entry: SubscribedTrackEntry = { publisherClientId: r.publisherClientId, trackName: r.trackName, kind: r.kind, mid: r.realMid };
        this.midToEntry.set(r.realMid, entry);
        nextSubscribed.set(r.realMid, entry);
      }

      await firstValueFrom(
        this.http.put('/api/sfu/renegotiate', {
          ...creds,
          cfSessionId,
          sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
        }),
      );
    } else {
      // No renegotiation — CF mids should be valid (non-empty) in this path
      for (const rt of responseTracks) {
        if (!rt.mid) continue;
        const entry: SubscribedTrackEntry = { publisherClientId: publisher.clientId, trackName: rt.trackName, kind: kindMap.get(rt.trackName) ?? 'unknown', mid: rt.mid };
        this.midToEntry.set(rt.mid, entry);
        nextSubscribed.set(rt.mid, entry);
      }
    }

    // Set signal after mids are reconciled (not before — subscribedTracks must reflect real mids)
    this.subscribedTracks.set(nextSubscribed);
    // Subscribe-latency: mark when this subscribe fully resolved (mids reconciled = tracks established)
    if (!this.subscribeFirstFrameAt.has(publisher.clientId)) {
      this.subscribeFirstFrameAt.set(publisher.clientId, Date.now());
    }
  }
}
