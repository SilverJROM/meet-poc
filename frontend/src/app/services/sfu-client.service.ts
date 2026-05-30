import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IceConfigService } from './ice-config.service';
import { ViewportService } from './viewport.service';
import { applyPresenceUpdate, applyRosterSnapshot, removeFromRoster } from './sfu-roster-utils.js';
import { reconcileSubscribedMids } from './sfu-mid-reconcile.js';
import type { SfuDiagnosticsSnapshot, SfuPublishPhase, SfuOutboundTrackStats, SfuInboundTrackStats, SfuSubscribeLatency, DiagnosticsCandidatePair, SfuConnectionQuality } from './meeting-sessions.service';
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

type SfuDiagnosticsWithPublishDebug = SfuDiagnosticsSnapshot & {
  publishPhase: SfuPublishPhase;
  publishPhaseAtMs: number | null;
  hasPc: boolean;
  publishStatus: LocalPublishState['status'] | null;
  publishError: string | null;
};

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
const SFU_HTTP_TIMEOUT_MS = 6000;
const CONNECTION_QUALITY_THRESHOLDS: SfuConnectionQuality['thresholds'] = {
  goodRttMs: 150,
  fairRttMs: 300,
  goodPacketLossPct: 2,
  fairPacketLossPct: 5,
  goodJitterMs: 30,
  fairJitterMs: 60,
};
type SfuCameraRid = 'h' | 'm' | 'l';
type AdaptiveCameraRidCap = SfuCameraRid | null;
const ADAPTIVE_CAMERA_RID_HYSTERESIS_SAMPLES = 3;
const CAMERA_RID_RANK: Record<SfuCameraRid, number> = { l: 0, m: 1, h: 2 };

@Injectable({ providedIn: 'root' })
export class SfuClientService {
  private readonly http = inject(HttpClient);
  private readonly iceConfigService = inject(IceConfigService);
  private readonly viewport = inject(ViewportService);

  readonly localPublishState = signal<LocalPublishState | null>(null);
  readonly localPublishPhase = signal<{ phase: SfuPublishPhase; atMs: number | null }>({ phase: null, atMs: null });
  readonly remotePublishers = signal<Map<string, import('./sfu-roster-utils.js').RemotePublisher>>(new Map());
  readonly remoteStreams = signal<Map<string, MediaStream>>(new Map());
  readonly remoteScreenStreams = signal<Map<string, MediaStream>>(new Map());
  readonly subscribedTracks = signal<Map<string, SubscribedTrackEntry>>(new Map());
  readonly connectionQuality = signal<SfuConnectionQuality | null>(null);
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
  private pendingOntrack = new Map<string, RTCTrackEvent>();
  private subscribeRetryAttempts = new Map<string, number>();
  private readonly SUBSCRIBE_RETRY_CAP = 7;
  // Subscribe-latency: time from subscribe issued → first ontrack arrival per publisher
  private subscribeInitiatedAt = new Map<string, number>();
  private subscribeFirstFrameAt = new Map<string, number>();
  private subscribeStuckTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly SUBSCRIBE_STUCK_THRESHOLD_MS = 10_000;
  private previousConnectionQualityPackets: { packetsReceived: number; packetsLost: number } | null = null;
  private adaptiveCameraRidCandidate: AdaptiveCameraRidCap = null;
  private adaptiveCameraRidCandidateSamples = 0;
  private adaptiveCameraRidCap: AdaptiveCameraRidCap = null;

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
    this.armSubscribeStuckWatchdog(publisher.clientId);
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

  private armSubscribeStuckWatchdog(publisherClientId: string): void {
    if (this.subscribeStuckTimers.has(publisherClientId)) return;
    const initiatedAt = this.subscribeInitiatedAt.get(publisherClientId) ?? Date.now();
    const timer = setTimeout(() => {
      this.subscribeStuckTimers.delete(publisherClientId);
      if (this.subscribeFirstFrameAt.has(publisherClientId)) return;
      console.warn('[sfu] subscribe stuck >10s — no ontrack from publisher', {
        publisherClientId,
        initiatedAtMs: initiatedAt,
        elapsedMs: Date.now() - initiatedAt,
        subscribedClientIds: [...this.subscribedClientIds],
        pcConnectionState: this.pc?.connectionState ?? null,
        pcIceConnectionState: this.pc?.iceConnectionState ?? null,
        retryAttempts: this.subscribeRetryAttempts.get(publisherClientId) ?? 0,
      });
    }, this.SUBSCRIBE_STUCK_THRESHOLD_MS);
    this.subscribeStuckTimers.set(publisherClientId, timer);
  }

  private disarmSubscribeStuckWatchdog(publisherClientId: string): void {
    const timer = this.subscribeStuckTimers.get(publisherClientId);
    if (timer) {
      clearTimeout(timer);
      this.subscribeStuckTimers.delete(publisherClientId);
    }
  }

  private clearAllSubscribeStuckWatchdogs(): void {
    for (const timer of this.subscribeStuckTimers.values()) clearTimeout(timer);
    this.subscribeStuckTimers.clear();
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

  async collectConnectionQuality(): Promise<SfuConnectionQuality | null> {
    const pc = this.pc;
    if (!pc) {
      this.resetConnectionQuality();
      return null;
    }

    let stats: RTCStatsReport;
    try {
      stats = await pc.getStats();
    } catch {
      return this.connectionQuality();
    }

    const transport = this.extractSelectedTransport(stats);
    const relayUsed = transport.localCandidateType === 'relay' || transport.remoteCandidateType === 'relay';
    const route: SfuConnectionQuality['route'] = relayUsed
      ? 'relayed'
      : transport.localCandidateType || transport.remoteCandidateType
        ? 'direct'
        : 'unknown';

    let packetsReceived = 0;
    let packetsLost = 0;
    let jitterMs: number | null = null;
    let fallbackJitterMs: number | null = null;

    for (const stat of stats.values()) {
      if (stat.type !== 'inbound-rtp') continue;
      packetsReceived += typeof stat.packetsReceived === 'number' ? stat.packetsReceived : 0;
      packetsLost += typeof stat.packetsLost === 'number' ? stat.packetsLost : 0;
      const rtpJitterMs = typeof stat.jitter === 'number' ? stat.jitter * 1000 : null;
      if (rtpJitterMs !== null) jitterMs = jitterMs === null ? rtpJitterMs : Math.max(jitterMs, rtpJitterMs);
      if (typeof stat.jitterBufferDelay === 'number' && typeof stat.jitterBufferEmittedCount === 'number' && stat.jitterBufferEmittedCount > 0) {
        const averageBufferDelayMs = (stat.jitterBufferDelay / stat.jitterBufferEmittedCount) * 1000;
        fallbackJitterMs = fallbackJitterMs === null ? averageBufferDelayMs : Math.max(fallbackJitterMs, averageBufferDelayMs);
      }
    }

    if (jitterMs === null) jitterMs = fallbackJitterMs;

    const previous = this.previousConnectionQualityPackets;
    let lossReceived = packetsReceived;
    let lossLost = packetsLost;
    if (previous) {
      const receivedDelta = packetsReceived - previous.packetsReceived;
      const lostDelta = packetsLost - previous.packetsLost;
      if (receivedDelta >= 0 && lostDelta >= 0 && receivedDelta + lostDelta > 0) {
        lossReceived = receivedDelta;
        lossLost = lostDelta;
      }
    }
    this.previousConnectionQualityPackets = { packetsReceived, packetsLost };

    const packetLossPct = lossReceived + lossLost > 0 ? Number(((lossLost / (lossReceived + lossLost)) * 100).toFixed(1)) : null;
    const roundedJitterMs = jitterMs !== null ? Math.round(jitterMs) : null;
    const band = classifyConnectionQuality(transport.rttMs, packetLossPct, roundedJitterMs, route);
    const quality: SfuConnectionQuality = {
      route,
      band,
      relayUsed,
      rttMs: transport.rttMs,
      packetLossPct,
      jitterMs: roundedJitterMs,
      localCandidateType: transport.localCandidateType,
      remoteCandidateType: transport.remoteCandidateType,
      sampledAt: Date.now(),
      thresholds: CONNECTION_QUALITY_THRESHOLDS,
    };
    this.connectionQuality.set(quality);
    this.updateAdaptiveCameraRidCap(quality);
    return quality;
  }

  resetConnectionQuality(): void {
    this.previousConnectionQualityPackets = null;
    this.resetAdaptiveCameraRidCap();
    this.connectionQuality.set(null);
  }

  private extractSelectedTransport(stats: RTCStatsReport): {
    rttMs: number | null;
    localCandidateType: string | null;
    remoteCandidateType: string | null;
  } {
    for (const stat of stats.values()) {
      if (stat.type !== 'candidate-pair') continue;
      if (stat.selected !== true && stat.nominated !== true && stat.state !== 'succeeded') continue;
      const localCand = stat.localCandidateId ? stats.get(stat.localCandidateId) : null;
      const remoteCand = stat.remoteCandidateId ? stats.get(stat.remoteCandidateId) : null;
      return {
        rttMs: typeof stat.currentRoundTripTime === 'number' ? Math.round(stat.currentRoundTripTime * 1000) : null,
        localCandidateType: localCand?.candidateType ?? null,
        remoteCandidateType: remoteCand?.candidateType ?? null,
      };
    }
    return { rttMs: null, localCandidateType: null, remoteCandidateType: null };
  }

  async collectDiagnostics(): Promise<SfuDiagnosticsSnapshot | null> {
    const pc = this.pc;
    const publishState = this.localPublishState();
    const partial = this.publishDiagnosticsDebug(pc, publishState);
    if (!pc || !publishState) {
      return {
        cfSessionId: publishState?.cfSessionId ?? '',
        connectionState: null,
        iceConnectionState: null,
        rttMs: null,
        localCandidateType: null,
        remoteCandidateType: null,
        selectedCandidatePair: null,
        outboundTracks: [],
        inboundTracks: [],
        subscribeLatencies: [],
        outboundAudioSource: null,
        connectionQuality: this.connectionQuality(),
        ...partial,
      } as SfuDiagnosticsWithPublishDebug;
    }

    let stats: RTCStatsReport;
    try {
      stats = await pc.getStats();
    } catch {
      return {
        cfSessionId: publishState.cfSessionId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        rttMs: null,
        localCandidateType: null,
        remoteCandidateType: null,
        selectedCandidatePair: null,
        outboundTracks: [],
        inboundTracks: [],
        subscribeLatencies: [],
        outboundAudioSource: null,
        connectionQuality: this.connectionQuality(),
        ...partial,
      } as SfuDiagnosticsWithPublishDebug;
    }

    // --- Candidate pair / transport ---
    let rttMs: number | null = null;
    let localCandidateType: string | null = null;
    let remoteCandidateType: string | null = null;
    let selectedCandidatePair: DiagnosticsCandidatePair | null = null;
    // --- Local mic-energy source (RTCAudioSourceStats) ---
    let outboundAudioSource: { audioLevel: number | null; totalAudioEnergy: number | null } | null = null;

    // Local mic-energy source lives in its own dedicated loop: the candidate-pair
    // loop below `break`s on the first nominated/succeeded pair, and RTCStatsReport
    // iteration order is NOT spec-guaranteed — folding the media-source capture into
    // that loop would silently skip it when the candidate-pair is iterated first.
    for (const stat of stats.values()) {
      if (stat.type === 'media-source' && (stat as any).kind === 'audio') {
        const s = stat as any;
        outboundAudioSource = {
          audioLevel: typeof s.audioLevel === 'number' ? s.audioLevel : null,
          totalAudioEnergy: typeof s.totalAudioEnergy === 'number' ? s.totalAudioEnergy : null,
        };
        break; // first audio media-source is the local mic source; fine to stop here
      }
    }

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
      outboundAudioSource,
      connectionQuality: this.connectionQuality(),
      ...partial,
    } as SfuDiagnosticsWithPublishDebug;
  }

  private setPublishPhase(phase: SfuPublishPhase): void {
    this.localPublishPhase.set({ phase, atMs: phase ? Date.now() : null });
  }

  private publishDiagnosticsDebug(
    pc: RTCPeerConnection | null,
    publishState: LocalPublishState | null,
  ): Pick<SfuDiagnosticsWithPublishDebug, 'publishPhase' | 'publishPhaseAtMs' | 'hasPc' | 'publishStatus' | 'publishError'> {
    const phase = this.localPublishPhase();
    return {
      publishPhase: phase.phase,
      publishPhaseAtMs: phase.atMs,
      hasPc: !!pc,
      publishStatus: publishState?.status ?? null,
      publishError: publishState?.error ?? null,
    };
  }

  private processOntrack(event: RTCTrackEvent, entry: SubscribedTrackEntry): void {
    if (!this.subscribeFirstFrameAt.has(entry.publisherClientId)) {
      this.subscribeFirstFrameAt.set(entry.publisherClientId, Date.now());
      this.disarmSubscribeStuckWatchdog(entry.publisherClientId);
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
  }

  private flushPendingOntrack(): void {
    for (const [mid, event] of [...this.pendingOntrack]) {
      const entry = this.midToEntry.get(mid);
      if (!entry) continue;
      this.pendingOntrack.delete(mid);
      this.processOntrack(event, entry);
    }
  }

  getVideoEncodings(): RTCRtpEncodingParameters[] {
    return this.videoSender?.getParameters().encodings ?? [];
  }

  updateCameraLayer(): Promise<void> {
    return this.enqueue(() => this.doUpdateCameraLayer());
  }

  private preferredCameraRid(): SfuCameraRid {
    return this.viewport.isMobile() ? 'l' : 'h';
  }

  private isAnyScreenActive(): boolean {
    if (this.remoteScreenStreams().size > 0) return true;
    return this.localPublishState()?.tracks.some((t) => t.kind === 'screen' && t.status === 'live') ?? false;
  }

  private baseCameraRidNow(): SfuCameraRid {
    if (this.isAnyScreenActive() || this.viewport.isMobile()) return 'l';
    const subscribedVideoPeers = new Set<string>();
    for (const entry of this.midToEntry.values()) {
      if (entry.kind === 'video') subscribedVideoPeers.add(entry.publisherClientId);
    }
    if (subscribedVideoPeers.size >= 5) return 'l';
    if (subscribedVideoPeers.size >= 3) return 'm';
    return 'h';
  }

  private cameraRidNow(): SfuCameraRid {
    return applyAdaptiveCameraRidCap(this.baseCameraRidNow(), this.adaptiveCameraRidCap);
  }

  private updateAdaptiveCameraRidCap(quality: SfuConnectionQuality): void {
    const previousRid = this.cameraRidNow();
    const nextCandidate = adaptiveCameraRidCapForQuality(quality);
    if (this.adaptiveCameraRidCandidate === nextCandidate) {
      this.adaptiveCameraRidCandidateSamples += 1;
    } else {
      this.adaptiveCameraRidCandidate = nextCandidate;
      this.adaptiveCameraRidCandidateSamples = 1;
    }

    if (this.adaptiveCameraRidCandidateSamples < ADAPTIVE_CAMERA_RID_HYSTERESIS_SAMPLES || this.adaptiveCameraRidCap === nextCandidate) return;

    this.adaptiveCameraRidCap = nextCandidate;
    if (this.cameraRidNow() !== previousRid) {
      void this.updateCameraLayer().catch(() => undefined);
    }
  }

  private resetAdaptiveCameraRidCap(): void {
    this.adaptiveCameraRidCandidate = null;
    this.adaptiveCameraRidCandidateSamples = 0;
    this.adaptiveCameraRidCap = null;
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

    await withTimeout(
      firstValueFrom(
        this.http.put('/api/sfu/tracks/update', {
          ...creds,
          cfSessionId: publishState.cfSessionId,
          tracks: cameraMids.map((mid) => ({ mid, preferredRid: rid, priorityOrdering, ridNotAvailable: 'degrade' })),
        }),
      ),
      SFU_HTTP_TIMEOUT_MS,
      'PUT /api/sfu/tracks/update',
    );
  }

  handleSfuPresence(msg: { clientId: string; participantId: string; cfSessionId: string; tracks: { trackName: string; kind: string }[]; revision: number }): void {
    const prev = this.remotePublishers().get(msg.clientId);
    // New cfSessionId = publisher reconnected — reset retry state so fresh subscribe can happen
    if (prev && prev.cfSessionId !== msg.cfSessionId) {
      this.subscribeRetryAttempts.delete(msg.clientId);
      this.subscribedClientIds.delete(msg.clientId);
      this.disarmSubscribeStuckWatchdog(msg.clientId);
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
        this.pendingOntrack.delete(mid);
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
    this.disarmSubscribeStuckWatchdog(clientId);

    if (mids.length > 0) {
      const creds = this.callerCreds;
      const cfSessionId = this.localPublishState()?.cfSessionId ?? '';
      if (creds && cfSessionId) {
        void this.enqueue(() => this.doClose(mids, creds, cfSessionId));
      }
    }
    void this.updateCameraLayer().catch(() => undefined);
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
      resp = await withTimeout(
        firstValueFrom(this.http.put<CloseResp>('/api/sfu/tracks/close', { ...creds, cfSessionId, tracks: mids.map((mid) => ({ mid })) })),
        SFU_HTTP_TIMEOUT_MS,
        'PUT /api/sfu/tracks/close',
      );
    } catch {
      // CF may reject close of remote-subscriber tracks — safe to ignore, CF auto-cleans on session GC
    }
    if (resp?.requiresImmediateRenegotiation && resp.sessionDescription && this.pc) {
      try {
        await this.pc.setRemoteDescription(resp.sessionDescription);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await withTimeout(
          firstValueFrom(
            this.http.put('/api/sfu/renegotiate', {
              ...creds,
              cfSessionId,
              sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
            }),
          ),
          SFU_HTTP_TIMEOUT_MS,
          'PUT /api/sfu/renegotiate',
        );
      } catch {
        // Renegotiation on close failed — PC may be in a partially stale state; next subscribe
        // will re-sync via its own renegotiation cycle
      }
    }
  }

  private async doReplaceAudioTrack(track: MediaStreamTrack | null): Promise<void> {
    if (!this.audioSender) return;
    await this.audioSender.replaceTrack(track);
  }

  private async doReplaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    if (!this.videoSender) return;
    await this.videoSender.replaceTrack(track);
  }

  private async doPublishScreen(displayTrack: MediaStreamTrack): Promise<void> {
    const publishState = this.localPublishState();
    const creds = this.callerCreds;
    if (!publishState || publishState.status !== 'published' || !this.pc || !creds) return;

    const { clientKey, participantId, sessionId } = creds;
    const cfSessionId = publishState.cfSessionId;
    const trackName = `${participantId}:${Date.now()}:screen:${crypto.randomUUID()}`;

    // Add screen as a NEW transceiver — requires renegotiation (publish-style, not replaceTrack)
    const transceiver = this.pc.addTransceiver(displayTrack, { direction: 'sendonly' });
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    const mid = transceiver.mid!;

    const tracksRes = await withTimeout(
      firstValueFrom(
        this.http.post<{ sessionDescription: RTCSessionDescriptionInit }>('/api/sfu/tracks', {
          clientKey,
          participantId,
          sessionId,
          cfSessionId,
          sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
          tracks: [{ location: 'local', mid, trackName }],
        }),
      ),
      SFU_HTTP_TIMEOUT_MS,
      'POST /api/sfu/tracks',
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
      closeRes = await withTimeout(
        firstValueFrom(
          this.http.put<CloseResponse>('/api/sfu/tracks/close', {
            ...creds,
            cfSessionId: publishState.cfSessionId,
            tracks: [{ mid: screenTrack.mid }],
          }),
        ),
        SFU_HTTP_TIMEOUT_MS,
        'PUT /api/sfu/tracks/close',
      );
    } catch (err) {
      console.warn('[sfu] tracks/close for screen failed (track may already be gone):', err);
    }

    // Handle renegotiation that CF may require on close
    if (closeRes?.requiresImmediateRenegotiation && closeRes.sessionDescription && this.pc) {
      await this.pc.setRemoteDescription(closeRes.sessionDescription);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await withTimeout(
        firstValueFrom(
          this.http.put('/api/sfu/renegotiate', {
            ...creds,
            cfSessionId: publishState.cfSessionId,
            sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
          }),
        ),
        SFU_HTTP_TIMEOUT_MS,
        'PUT /api/sfu/renegotiate',
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
    this.pendingOntrack.clear();
    this.subscribeRetryAttempts.clear();
    this.subscribeInitiatedAt.clear();
    this.subscribeFirstFrameAt.clear();
    this.clearAllSubscribeStuckWatchdogs();
    this.resetConnectionQuality();
    this.opQueue = Promise.resolve();
    this.localPublishState.set(null);
    this.setPublishPhase(null);
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
    this.setPublishPhase(null);
    this.opQueue = Promise.resolve();
    this.pendingOntrack.clear();
    this.clearAllSubscribeStuckWatchdogs();
    this.resetConnectionQuality();
    this.subscribedClientIds.clear();
    this.midToEntry.clear();
    this.subscribeRetryAttempts.clear();
    this.subscribeInitiatedAt.clear();
    this.subscribeFirstFrameAt.clear();
    this.remotePublishers.set(new Map());
    this.remoteStreams.set(new Map());
    this.remoteScreenStreams.set(new Map());
    this.subscribedTracks.set(new Map());
    this.audioSender = null;
    this.videoSender = null;
    this.screenSender = null;

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
    this.pendingOntrack.clear();
    this.subscribeRetryAttempts.clear();
    this.subscribeInitiatedAt.clear();
    this.subscribeFirstFrameAt.clear();
    this.clearAllSubscribeStuckWatchdogs();
    this.resetConnectionQuality();
    this.localPublishState.set(null);
    this.setPublishPhase(null);
    this.opQueue = Promise.resolve();
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
      this.setPublishPhase('ice-config');
      const turnServers = await this.iceConfigService.getIceServers();
      const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }, ...turnServers];
      this.setPublishPhase('pc-create');
      this.pc = new RTCPeerConnection({ iceServers });

      // Set ontrack BEFORE any subscribe requests so no track event is missed
      this.pc.ontrack = (event) => {
        const mid = event.transceiver.mid;
        if (!mid) return;
        const entry = this.midToEntry.get(mid);
        if (!entry) {
          console.warn(`[sfu] ontrack arrived early for mid=${mid}, buffering for replay`);
          this.pendingOntrack.set(mid, event);
          return;
        }
        this.processOntrack(event, entry);
      };

      // Add local tracks with pre-negotiated video transceiver (DR-55/F2: always negotiate video up-front)
      const audioTrack = localStream?.getAudioTracks()[0];
      const audioTransceiver = audioTrack
        ? this.pc.addTransceiver(audioTrack, { direction: 'sendonly' })
        : this.pc.addTransceiver('audio', { direction: 'sendonly' });
      this.audioSender = audioTransceiver.sender;

      const videoTrack = localStream?.getVideoTracks()[0];
      const videoTransceiver = videoTrack
        ? this.pc.addTransceiver(videoTrack, { direction: 'sendonly', sendEncodings: VIDEO_SIMULCAST_ENCODINGS })
        : this.pc.addTransceiver('video', { direction: 'sendonly', sendEncodings: VIDEO_SIMULCAST_ENCODINGS }); // Camera off: pre-negotiate so replaceTrack works later without renegotiation; sendEncodings persists through replaceTrack
      this.videoSender = videoTransceiver.sender;

      // createOffer → setLocalDescription (mids assigned after SLD)
      this.setPublishPhase('offer');
      const offer = await this.pc.createOffer();
      this.setPublishPhase('offer');
      await this.pc.setLocalDescription(offer);

      // POST /api/sfu/session → cfSessionId
      this.setPublishPhase('cf-session');
      const sessionRes = await withTimeout(
        firstValueFrom(this.http.post<{ sessionId: string }>('/api/sfu/session', { clientKey, participantId, sessionId })),
        SFU_HTTP_TIMEOUT_MS,
        'POST /api/sfu/session',
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
      this.setPublishPhase('cf-tracks');
      const tracksRes = await withTimeout(
        firstValueFrom(
          this.http.post<{ sessionDescription: RTCSessionDescriptionInit }>('/api/sfu/tracks', {
            clientKey,
            participantId,
            sessionId,
            cfSessionId,
            sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
            tracks: trackParams.map(({ location, mid, trackName }) => ({ location, mid, trackName })),
          }),
        ),
        SFU_HTTP_TIMEOUT_MS,
        'POST /api/sfu/tracks',
      );

      // setRemoteDescription with CF answer
      this.setPublishPhase('set-remote');
      await this.pc.setRemoteDescription(tracksRes.sessionDescription);

      // Persist mid model for close/update in later batches
      const tracks: SfuTrackModel[] = trackParams.map(({ trackName, kind, mid }) => ({
        trackName,
        kind,
        mid,
        status: 'live',
      }));
      this.localPublishState.set({ cfSessionId, status: 'published', tracks });
      this.setPublishPhase('done');
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

    const res = await withTimeout(
      firstValueFrom(
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
      ),
      SFU_HTTP_TIMEOUT_MS,
      'POST /api/sfu/tracks',
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

      // Populate before the next event-loop yield; ontrack from SRD can fire before createAnswer resolves.
      const transceivers = this.pc.getTransceivers();
      const newTransceiverMids = transceivers
        .map((t) => t.mid)
        .filter((m): m is string => !!m && !existingMids.has(m));

      const reconciled = reconcileSubscribedMids(responseTracks, newTransceiverMids, transceivers, kindMap, publisher.clientId);
      for (const r of reconciled) {
        const entry: SubscribedTrackEntry = { publisherClientId: r.publisherClientId, trackName: r.trackName, kind: r.kind, mid: r.realMid };
        this.midToEntry.set(r.realMid, entry);
        nextSubscribed.set(r.realMid, entry);
      }
      this.flushPendingOntrack();

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      await withTimeout(
        firstValueFrom(
          this.http.put('/api/sfu/renegotiate', {
            ...creds,
            cfSessionId,
            sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
          }),
        ),
        SFU_HTTP_TIMEOUT_MS,
        'PUT /api/sfu/renegotiate',
      );
    } else {
      // No renegotiation — CF mids should be valid (non-empty) in this path
      for (const rt of responseTracks) {
        if (!rt.mid) continue;
        const entry: SubscribedTrackEntry = { publisherClientId: publisher.clientId, trackName: rt.trackName, kind: kindMap.get(rt.trackName) ?? 'unknown', mid: rt.mid };
        this.midToEntry.set(rt.mid, entry);
        nextSubscribed.set(rt.mid, entry);
      }
      this.flushPendingOntrack();
    }

    // Set signal after mids are reconciled (not before — subscribedTracks must reflect real mids)
    this.subscribedTracks.set(nextSubscribed);
    void this.updateCameraLayer().catch(() => undefined);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function applyAdaptiveCameraRidCap(baseRid: SfuCameraRid, cap: AdaptiveCameraRidCap): SfuCameraRid {
  if (!cap) return baseRid;
  return CAMERA_RID_RANK[baseRid] <= CAMERA_RID_RANK[cap] ? baseRid : cap;
}

function adaptiveCameraRidCapForQuality(quality: SfuConnectionQuality): AdaptiveCameraRidCap {
  if (quality.band === 'poor') return 'l';
  if (quality.route === 'relayed' && quality.band === 'fair') return 'l';
  if (quality.band === 'fair') return 'm';
  return null;
}

function classifyConnectionQuality(
  rttMs: number | null,
  packetLossPct: number | null,
  jitterMs: number | null,
  route: SfuConnectionQuality['route'],
): SfuConnectionQuality['band'] {
  if (route === 'unknown' && rttMs === null && packetLossPct === null && jitterMs === null) return 'unknown';
  if (
    (rttMs !== null && rttMs > CONNECTION_QUALITY_THRESHOLDS.fairRttMs) ||
    (packetLossPct !== null && packetLossPct > CONNECTION_QUALITY_THRESHOLDS.fairPacketLossPct) ||
    (jitterMs !== null && jitterMs > CONNECTION_QUALITY_THRESHOLDS.fairJitterMs)
  ) {
    return 'poor';
  }
  if (
    (rttMs !== null && rttMs > CONNECTION_QUALITY_THRESHOLDS.goodRttMs) ||
    (packetLossPct !== null && packetLossPct > CONNECTION_QUALITY_THRESHOLDS.goodPacketLossPct) ||
    (jitterMs !== null && jitterMs > CONNECTION_QUALITY_THRESHOLDS.goodJitterMs)
  ) {
    return 'fair';
  }
  return 'good';
}
