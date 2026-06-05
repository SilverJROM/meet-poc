import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IceConfigService } from './ice-config.service';
import { ViewportService } from './viewport.service';
import {
  applyPresenceUpdate,
  applyRosterSnapshot,
  planSfuTransportRecovery,
  planSubscribeRetry,
  removeFromRoster,
  selectNewRemoteTracks,
  shouldRegisterFirstAddedLocalTrack,
} from './sfu-roster-utils.js';
import { reconcileSubscribedMids } from './sfu-mid-reconcile.js';
import { extractOutboundAudioSource, type OutboundAudioSourceStat } from './mic-energy';
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
const SFU_TRANSPORT_DISCONNECTED_GRACE_MS = 8000;
const SFU_TRANSPORT_RECOVERY_CAP = 3;
const SFU_TRANSPORT_RECOVERY_BASE_BACKOFF_MS = 500;
const SFU_TRANSPORT_RECOVERY_MAX_BACKOFF_MS = 2000;
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
  private readonly SUBSCRIBE_RETRY_BASE_BACKOFF_MS = 250;
  private readonly SUBSCRIBE_RETRY_MAX_BACKOFF_MS = 4000;
  // Subscribe-latency: time from subscribe issued → first ontrack arrival per publisher
  private subscribeInitiatedAt = new Map<string, number>();
  private subscribeFirstFrameAt = new Map<string, number>();
  private subscribeStuckTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private subscribeBackoffTimers = new Set<ReturnType<typeof setTimeout>>();
  private midCallSubscribeRetryAttempts = new Map<string, number>();
  private midCallSubscribeRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly SUBSCRIBE_STUCK_THRESHOLD_MS = 10_000;
  private previousConnectionQualityPackets: { packetsReceived: number; packetsLost: number } | null = null;
  private adaptiveCameraRidCandidate: AdaptiveCameraRidCap = null;
  private adaptiveCameraRidCandidateSamples = 0;
  private adaptiveCameraRidCap: AdaptiveCameraRidCap = null;
  private transportRecoveryHandler: (() => Promise<void>) | null = null;
  private transportDisconnectedSinceMs: number | null = null;
  private transportDisconnectedTimer: ReturnType<typeof setTimeout> | null = null;
  private transportRecoveryAttempts = 0;
  private transportRecoveryScheduled = false;
  private transportRecoveryInFlight = false;
  private currentIceTransportPolicy: RTCIceTransportPolicy = 'all';
  private recoveryPublishIceServers: RTCIceServer[] | null = null;

  enqueue<T>(op: () => Promise<T>): Promise<T> {
    const result = this.opQueue.then(() => op());
    this.opQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  isLocalPublishHealthy(): boolean {
    const publishState = this.localPublishState();
    const pc = this.pc;
    if (publishState?.status !== 'published' || !pc) return false;
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') return false;
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') return false;
    return true;
  }

  publish(params: { clientKey: string; participantId: string; sessionId: string; localStream: MediaStream | null }): Promise<void> {
    return this.enqueue(() => this.doPublish(params));
  }

  setTransportRecoveryHandler(handler: (() => Promise<void>) | null): void {
    this.transportRecoveryHandler = handler;
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
      const retry = this.nextSubscribeRetry(publisher.clientId, false);
      if (!retry.shouldRetry) return;
      this.subscribedClientIds.delete(publisher.clientId);
      this.scheduleSubscribeRetryBackoff(retry.backoffMs);
    });
  }

  private armSubscribeStuckWatchdog(publisherClientId: string): void {
    if (this.subscribeStuckTimers.has(publisherClientId)) return;
    const initiatedAt = this.subscribeInitiatedAt.get(publisherClientId) ?? Date.now();
    const timer = setTimeout(() => {
      this.subscribeStuckTimers.delete(publisherClientId);
      const retry = this.nextSubscribeRetry(publisherClientId, this.subscribeFirstFrameAt.has(publisherClientId));
      if (!retry.shouldRetry) return;
      console.warn('[sfu] subscribe stuck >10s — no ontrack from publisher', {
        publisherClientId,
        initiatedAtMs: initiatedAt,
        elapsedMs: Date.now() - initiatedAt,
        subscribedClientIds: [...this.subscribedClientIds],
        pcConnectionState: this.pc?.connectionState ?? null,
        pcIceConnectionState: this.pc?.iceConnectionState ?? null,
        retryAttempts: retry.nextAttempts,
        retryBackoffMs: retry.backoffMs,
      });
      this.clearPublisherSubscriptionStateForRetry(publisherClientId);
      this.scheduleSubscribeRetryBackoff(retry.backoffMs);
    }, this.SUBSCRIBE_STUCK_THRESHOLD_MS);
    this.subscribeStuckTimers.set(publisherClientId, timer);
  }

  private scheduleSubscribeRetryBackoff(backoffMs: number): void {
    const timer = setTimeout(() => {
      this.subscribeBackoffTimers.delete(timer);
      this.subscribeRetryVersion.update((v) => v + 1);
    }, backoffMs);
    this.subscribeBackoffTimers.add(timer);
  }

  private nextSubscribeRetry(
    publisherClientId: string,
    hasFirstFrame: boolean,
  ): { shouldRetry: boolean; nextAttempts: number; backoffMs: number; capped: boolean } {
    const retry = planSubscribeRetry({
      currentAttempts: this.subscribeRetryAttempts.get(publisherClientId) ?? 0,
      cap: this.SUBSCRIBE_RETRY_CAP,
      hasFirstFrame,
      baseBackoffMs: this.SUBSCRIBE_RETRY_BASE_BACKOFF_MS,
      maxBackoffMs: this.SUBSCRIBE_RETRY_MAX_BACKOFF_MS,
    });

    if (retry.reason === 'healthy') {
      return { shouldRetry: false, nextAttempts: retry.nextAttempts, backoffMs: 0, capped: false };
    }

    this.subscribeRetryAttempts.set(publisherClientId, retry.nextAttempts);
    if (retry.capped) {
      console.warn(`[SFU] subscribe permanently stopped for ${publisherClientId} after ${retry.nextAttempts} attempts — guard stays set until cfSessionId changes`);
      return { shouldRetry: false, nextAttempts: retry.nextAttempts, backoffMs: 0, capped: true };
    }

    return { shouldRetry: true, nextAttempts: retry.nextAttempts, backoffMs: retry.backoffMs ?? 0, capped: false };
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

  private clearAllSubscribeBackoffTimers(): void {
    for (const timer of this.subscribeBackoffTimers) clearTimeout(timer);
    this.subscribeBackoffTimers.clear();
  }

  private midCallSubscribeRetryKey(clientId: string, cfSessionId: string, trackName: string): string {
    return `${clientId}\u0000${cfSessionId}\u0000${trackName}`;
  }

  private midCallSubscribeRetryKeyPrefix(clientId: string, cfSessionId?: string): string {
    return cfSessionId === undefined ? `${clientId}\u0000` : `${clientId}\u0000${cfSessionId}\u0000`;
  }

  private clearMidCallSubscribeRetryKey(key: string): void {
    const timer = this.midCallSubscribeRetryTimers.get(key);
    if (timer) clearTimeout(timer);
    this.midCallSubscribeRetryTimers.delete(key);
    this.midCallSubscribeRetryAttempts.delete(key);
  }

  private clearMidCallSubscribeRetryState(clientId: string, cfSessionId?: string): void {
    const prefix = this.midCallSubscribeRetryKeyPrefix(clientId, cfSessionId);
    const keys = new Set([...this.midCallSubscribeRetryAttempts.keys(), ...this.midCallSubscribeRetryTimers.keys()]);
    for (const key of keys) {
      if (key.startsWith(prefix)) this.clearMidCallSubscribeRetryKey(key);
    }
  }

  private clearAllMidCallSubscribeRetryState(): void {
    for (const timer of this.midCallSubscribeRetryTimers.values()) clearTimeout(timer);
    this.midCallSubscribeRetryTimers.clear();
    this.midCallSubscribeRetryAttempts.clear();
  }

  replaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    return this.enqueue(() => this.doReplaceVideoTrack(track));
  }

  replaceAudioTrack(track: MediaStreamTrack | null): Promise<void> {
    return this.enqueue(() => this.doReplaceAudioTrack(track));
  }

  replaceVideoTrackAndPublishIfNeeded(track: MediaStreamTrack | null): Promise<boolean> {
    return this.enqueue(() => this.doReplaceLocalTrackAndPublishIfNeeded('video', this.videoSender, track));
  }

  replaceAudioTrackAndPublishIfNeeded(track: MediaStreamTrack | null): Promise<boolean> {
    return this.enqueue(() => this.doReplaceLocalTrackAndPublishIfNeeded('audio', this.audioSender, track));
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

  /**
   * Public reader for the post-publish energy gate (B2a). Fetches one getStats()
   * pass and runs the SAME shared extractor collectDiagnostics() uses, so the gate
   * and diagnostics read one source of truth. Returns null when there is no
   * peer-connection or no audio media-source stat.
   */
  async getOutboundAudioSource(): Promise<OutboundAudioSourceStat | null> {
    const pc = this.pc;
    if (!pc) return null;
    let stats: RTCStatsReport;
    try {
      stats = await pc.getStats();
    } catch {
      return null;
    }
    return extractOutboundAudioSource(stats);
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

  private clearTransportRecoveryTimer(): void {
    if (this.transportDisconnectedTimer) clearTimeout(this.transportDisconnectedTimer);
    this.transportDisconnectedTimer = null;
  }

  private resetTransportRecoveryState(resetAttempts: boolean): void {
    this.clearTransportRecoveryTimer();
    this.transportDisconnectedSinceMs = null;
    if (resetAttempts) this.transportRecoveryAttempts = 0;
  }

  private closePeerConnectionForRecovery(): void {
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    this.audioSender = null;
    this.videoSender = null;
    this.screenSender = null;
  }

  private clearLocalTransportSessionState(): void {
    this.closePeerConnectionForRecovery();
    this.subscribedClientIds.clear();
    this.midToEntry.clear();
    this.pendingOntrack.clear();
    this.subscribeRetryAttempts.clear();
    this.subscribeInitiatedAt.clear();
    this.subscribeFirstFrameAt.clear();
    this.clearAllSubscribeStuckWatchdogs();
    this.clearAllSubscribeBackoffTimers();
    this.clearAllMidCallSubscribeRetryState();
    this.resetConnectionQuality();
    this.opQueue = Promise.resolve();
    this.localPublishState.set(null);
    this.setPublishPhase(null);
    this.remoteStreams.set(new Map());
    this.remoteScreenStreams.set(new Map());
    this.subscribedTracks.set(new Map());
    this.subscribeRetryVersion.update((v) => v + 1);
  }

  resetForTransportRecovery(): void {
    this.clearLocalTransportSessionState();
    this.resetTransportRecoveryState(false);
  }

  private installTransportStateHandlers(pc: RTCPeerConnection): void {
    const handleStateChange = () => {
      if (this.pc !== pc) return;
      this.handleTransportStateChange();
    };
    pc.oniceconnectionstatechange = handleStateChange;
    pc.onconnectionstatechange = handleStateChange;
  }

  private handleTransportStateChange(): void {
    const pc = this.pc;
    if (!pc) return;
    if (pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected') {
      this.transportDisconnectedSinceMs ??= Date.now();
    }
    const disconnectedElapsedMs = this.transportDisconnectedSinceMs === null ? null : Date.now() - this.transportDisconnectedSinceMs;
    const decision = planSfuTransportRecovery({
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      disconnectedElapsedMs,
      disconnectedGraceMs: SFU_TRANSPORT_DISCONNECTED_GRACE_MS,
      currentAttempts: this.transportRecoveryAttempts,
      cap: SFU_TRANSPORT_RECOVERY_CAP,
      baseBackoffMs: SFU_TRANSPORT_RECOVERY_BASE_BACKOFF_MS,
      maxBackoffMs: SFU_TRANSPORT_RECOVERY_MAX_BACKOFF_MS,
    });

    if (decision.action === 'reset') {
      this.resetTransportRecoveryState(true);
      return;
    }
    if (decision.action === 'wait') {
      this.armTransportDisconnectedGraceTimer(disconnectedElapsedMs ?? 0);
      return;
    }
    this.clearTransportRecoveryTimer();
    if (decision.action === 'recover') {
      this.startTransportRecovery(decision);
    } else if (decision.action === 'capped') {
      this.transportRecoveryAttempts = decision.nextAttempts;
      console.error('[sfu] transport recovery capped; leaving retry/rejoin UI to publish recovery path', {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        attempts: decision.nextAttempts,
      });
    }
  }

  private armTransportDisconnectedGraceTimer(disconnectedElapsedMs: number): void {
    if (this.transportDisconnectedTimer) return;
    const remainingMs = Math.max(0, SFU_TRANSPORT_DISCONNECTED_GRACE_MS - disconnectedElapsedMs);
    this.transportDisconnectedTimer = setTimeout(() => {
      this.transportDisconnectedTimer = null;
      this.handleTransportStateChange();
    }, remainingMs);
  }

  private startTransportRecovery(decision: ReturnType<typeof planSfuTransportRecovery>): void {
    if (this.transportRecoveryScheduled || this.transportRecoveryInFlight) return;
    this.transportRecoveryAttempts = decision.nextAttempts;
    this.transportRecoveryScheduled = true;
    void (async () => {
      try {
        if (decision.backoffMs) await sleep(decision.backoffMs);
        const pc = this.pc;
        if (pc && (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed')) {
          this.resetTransportRecoveryState(true);
          return;
        }
        this.transportRecoveryInFlight = true;
        await this.recoverTransport(decision.reason);
        this.resetTransportRecoveryState(true);
      } catch (err) {
        console.error('[sfu] transport recovery failed', err);
      } finally {
        this.transportRecoveryInFlight = false;
        this.transportRecoveryScheduled = false;
      }
    })();
  }

  private async recoverTransport(reason: string): Promise<void> {
    try {
      await this.enqueue(() => this.doRestartIceRenegotiate(reason));
      console.info('[sfu] transport recovered with ICE restart', { reason });
      return;
    } catch (err) {
      console.warn('[sfu] ICE restart recovery failed; resetting SFU transport for full republish', err);
    }

    if (this.iceConfigService.relayUnavailable()) {
      this.recoveryPublishIceServers = await this.iceConfigService.forceRefresh();
    }
    this.resetForTransportRecovery();
    const handler = this.transportRecoveryHandler;
    if (!handler) throw new Error('[sfu] no full-republish handler registered for transport recovery');
    await handler();
    console.info('[sfu] transport recovered with full republish', { reason });
  }

  private async doRestartIceRenegotiate(reason: string): Promise<void> {
    const pc = this.pc;
    const creds = this.callerCreds;
    const publishState = this.localPublishState();
    if (!pc || !creds || !publishState || publishState.status !== 'published') {
      throw new Error('[sfu] ICE restart skipped: SFU publish state is not ready');
    }
    if (typeof pc.restartIce !== 'function') {
      throw new Error('[sfu] ICE restart unsupported by this browser');
    }
    if (pc.signalingState !== 'stable') {
      throw new Error(`[sfu] ICE restart skipped: signalingState=${pc.signalingState}`);
    }

    pc.restartIce();
    const offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);
    const res = await withTimeout(
      firstValueFrom(
        this.http.put<{ sessionDescription?: RTCSessionDescriptionInit }>('/api/sfu/renegotiate', {
          ...creds,
          cfSessionId: publishState.cfSessionId,
          sessionDescription: { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp },
          recoveryReason: reason,
        }),
      ),
      SFU_HTTP_TIMEOUT_MS,
      'PUT /api/sfu/renegotiate',
    );
    if (!res.sessionDescription) {
      throw new Error('[sfu] ICE restart renegotiate did not return a remote description');
    }
    await pc.setRemoteDescription(res.sessionDescription);
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
        requestedIceTransportPolicy: this.currentIceTransportPolicy,
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
        requestedIceTransportPolicy: this.currentIceTransportPolicy,
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
    // ONE source of truth: the SAME shared extractor the post-publish energy gate
    // reads (getOutboundAudioSource). Runs over this single already-fetched stats
    // report — no second getStats(), no duplicate media-source loop.
    const outboundAudioSource: OutboundAudioSourceStat | null = extractOutboundAudioSource(stats);

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
          availableOutgoingBitrate: numberOrNull(stat.availableOutgoingBitrate),
          availableIncomingBitrate: numberOrNull(stat.availableIncomingBitrate),
          currentRoundTripTime: numberOrNull(stat.currentRoundTripTime),
          totalRoundTripTime: numberOrNull(stat.totalRoundTripTime),
          bytesSent: numberOrNull(stat.bytesSent),
          bytesReceived: numberOrNull(stat.bytesReceived),
        };
        break;
      }
    }

    // --- Outbound (publish) per track ---
    const outboundTracks: SfuOutboundTrackStats[] = [];
    const localTracksByMid = new Map(publishState.tracks.map((t) => [t.mid, t]));
    const outboundTrackIndexById = new Map<string, number>();
    const outboundTrackIndexBySsrcKind = new Map<string, number>();

    for (const stat of stats.values()) {
      if (stat.type !== 'outbound-rtp') continue;
      const publishTrack = stat.mid ? localTracksByMid.get(stat.mid) : null;
      const track: SfuOutboundTrackStats = {
        trackName: publishTrack?.trackName ?? `${stat.kind ?? 'unknown'}:${stat.rid ?? stat.ssrc ?? '?'}`,
        kind: publishTrack?.kind ?? stat.kind ?? 'unknown',
        rid: stat.rid ?? null,
        bytesSent: numberOrNull(stat.bytesSent),
        packetsSent: numberOrNull(stat.packetsSent),
        framesEncoded: numberOrNull(stat.framesEncoded),
        framesSent: numberOrNull(stat.framesSent),
        qualityLimitationReason: stat.qualityLimitationReason ?? null,
        remoteRoundTripTimeMs: null,
        remoteFractionLost: null,
        remoteJitterMs: null,
      };
      const index = outboundTracks.push(track) - 1;
      if (typeof stat.id === 'string') outboundTrackIndexById.set(stat.id, index);
      const ssrcKey = ssrcKindKey(stat.ssrc, stat.kind);
      if (ssrcKey) outboundTrackIndexBySsrcKind.set(ssrcKey, index);
    }

    for (const stat of stats.values()) {
      if (stat.type !== 'remote-inbound-rtp') continue;
      const localIdIndex = typeof stat.localId === 'string' ? outboundTrackIndexById.get(stat.localId) : undefined;
      const ssrcIndex = outboundTrackIndexBySsrcKind.get(ssrcKindKey(stat.ssrc, stat.kind) ?? '');
      const index = localIdIndex ?? ssrcIndex;
      if (index === undefined) continue;
      outboundTracks[index] = {
        ...outboundTracks[index],
        remoteRoundTripTimeMs: secondsToMsOrNull(stat.roundTripTime),
        remoteFractionLost: numberOrNull(stat.fractionLost),
        remoteJitterMs: secondsToMsOrNull(stat.jitter),
      };
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
        bytesReceived: numberOrNull(stat.bytesReceived),
        packetsReceived: numberOrNull(stat.packetsReceived),
        packetsLost: numberOrNull(stat.packetsLost),
        framesDecoded: numberOrNull(stat.framesDecoded),
        framesReceived: numberOrNull(stat.framesReceived),
        jitterBufferDelay: numberOrNull(stat.jitterBufferDelay),
        jitterBufferEmittedCount: numberOrNull(stat.jitterBufferEmittedCount),
        concealedSamples: numberOrNull(stat.concealedSamples),
        audioLevel: numberOrNull(stat.audioLevel),
        jitter: numberOrNull(stat.jitter),
        nackCount: numberOrNull(stat.nackCount),
        pliCount: numberOrNull(stat.pliCount),
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
      requestedIceTransportPolicy: this.currentIceTransportPolicy,
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
      this.subscribeRetryAttempts.delete(entry.publisherClientId);
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

  resetFailedPublishAttempt(): void {
    if (this.localPublishState()?.status === 'published') return;
    this.closePeerConnectionForRecovery();
    this.callerCreds = null;
    this.localPublishState.set(null);
    this.setPublishPhase(null);
    this.resetTransportRecoveryState(false);
    this.opQueue = Promise.resolve();
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
      this.clearPublisherSubscriptionStateForRetry(msg.clientId);
      this.subscribeRetryAttempts.delete(msg.clientId);
      this.clearMidCallSubscribeRetryState(msg.clientId);
    }
    const samePublisherSession = !!prev && prev.cfSessionId === msg.cfSessionId;
    const prevHadScreen = prev?.tracks.some((t) => t.kind === 'screen') ?? false;
    const next = applyPresenceUpdate(this.remotePublishers(), msg);
    if (next !== this.remotePublishers()) this.remotePublishers.set(next);
    const nowPublisher = next.get(msg.clientId);
    const nowHasScreen = nowPublisher?.tracks.some((t) => t.kind === 'screen') ?? false;
    if (samePublisherSession && prevHadScreen && !nowHasScreen) {
      this.tearDownScreenSubscription(msg.clientId);
    }
    if (samePublisherSession && nowPublisher) {
      this.subscribeNewRemoteTracks(nowPublisher, prev.tracks);
    }
  }

  handleSfuRoster(publishers: { clientId: string; participantId: string; cfSessionId: string; tracks: { trackName: string; kind: string }[]; revision: number }[]): void {
    const previous = this.remotePublishers();
    for (const publisher of publishers) {
      const prev = previous.get(publisher.clientId);
      if (prev && prev.cfSessionId !== publisher.cfSessionId) {
        this.clearPublisherSubscriptionStateForRetry(publisher.clientId);
        this.subscribeRetryAttempts.delete(publisher.clientId);
        this.clearMidCallSubscribeRetryState(publisher.clientId);
      }
    }
    this.remotePublishers.set(applyRosterSnapshot(publishers));
  }

  removePeer(clientId: string): void {
    this.tearDownPeerSubscription(clientId);
    const next = removeFromRoster(this.remotePublishers(), clientId);
    if (next !== this.remotePublishers()) this.remotePublishers.set(next);
  }

  private tearDownPeerSubscription(clientId: string): void {
    this.clearMidCallSubscribeRetryState(clientId);
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

  private clearPublisherSubscriptionStateForRetry(clientId: string): void {
    const mids = new Set<string>();
    for (const [mid, entry] of this.midToEntry) {
      if (entry.publisherClientId === clientId) mids.add(mid);
    }
    for (const [mid, entry] of this.subscribedTracks()) {
      if (entry.publisherClientId === clientId) mids.add(mid);
    }

    for (const mid of mids) {
      this.midToEntry.delete(mid);
      this.pendingOntrack.delete(mid);
    }

    const nextSubscribed = new Map(this.subscribedTracks());
    for (const [mid, entry] of nextSubscribed) {
      if (entry.publisherClientId === clientId) nextSubscribed.delete(mid);
    }
    if (nextSubscribed.size !== this.subscribedTracks().size) {
      this.subscribedTracks.set(nextSubscribed);
    }

    const nextStreams = new Map(this.remoteStreams());
    if (nextStreams.delete(clientId)) this.remoteStreams.set(nextStreams);

    const nextScreenStreams = new Map(this.remoteScreenStreams());
    if (nextScreenStreams.delete(clientId)) this.remoteScreenStreams.set(nextScreenStreams);

    this.subscribedClientIds.delete(clientId);
    this.subscribeInitiatedAt.delete(clientId);
    this.subscribeFirstFrameAt.delete(clientId);
    this.disarmSubscribeStuckWatchdog(clientId);
    this.clearMidCallSubscribeRetryState(clientId);
  }

  private subscribeNewRemoteTracks(publisher: import('./sfu-roster-utils.js').RemotePublisher, previousTracks: { trackName: string; kind: string }[]): void {
    const alreadySubscribed = this.currentSubscribedTrackNames();
    const newTracks = selectNewRemoteTracks(previousTracks, publisher.tracks, alreadySubscribed);
    if (!newTracks.length) return;
    this.enqueueMidCallSubscribeTracks(publisher, newTracks);
  }

  private currentSubscribedTrackNames(): Set<string> {
    return new Set([
      ...[...this.midToEntry.values()].map((entry) => entry.trackName),
      ...[...this.subscribedTracks().values()].map((entry) => entry.trackName),
    ]);
  }

  private isTrackSubscribed(clientId: string, trackName: string): boolean {
    for (const entry of this.midToEntry.values()) {
      if (entry.publisherClientId === clientId && entry.trackName === trackName) return true;
    }
    for (const entry of this.subscribedTracks().values()) {
      if (entry.publisherClientId === clientId && entry.trackName === trackName) return true;
    }
    return false;
  }

  private missingAdvertisedRemoteTracks(
    publisher: import('./sfu-roster-utils.js').RemotePublisher,
    trackNames?: Set<string>,
  ): { trackName: string; kind: string }[] {
    return publisher.tracks.filter((track) => {
      if (trackNames && !trackNames.has(track.trackName)) return false;
      return !this.isTrackSubscribed(publisher.clientId, track.trackName);
    });
  }

  private enqueueMidCallSubscribeTracks(
    publisher: import('./sfu-roster-utils.js').RemotePublisher,
    tracks: { trackName: string; kind: string }[],
  ): void {
    const missingTracks = this.missingAdvertisedRemoteTracks(publisher, new Set(tracks.map((track) => track.trackName)));
    if (!missingTracks.length) return;
    void this.enqueue(() => this.doSubscribeTracks(publisher, missingTracks))
      .then(() => {
        for (const track of missingTracks) {
          this.clearMidCallSubscribeRetryKey(this.midCallSubscribeRetryKey(publisher.clientId, publisher.cfSessionId, track.trackName));
        }
      })
      .catch((err) => this.scheduleMidCallSubscribeRetry(publisher, missingTracks, err));
  }

  private scheduleMidCallSubscribeRetry(
    publisher: import('./sfu-roster-utils.js').RemotePublisher,
    tracks: { trackName: string; kind: string }[],
    err: unknown,
  ): void {
    for (const track of tracks) {
      if (this.isTrackSubscribed(publisher.clientId, track.trackName)) {
        this.clearMidCallSubscribeRetryKey(this.midCallSubscribeRetryKey(publisher.clientId, publisher.cfSessionId, track.trackName));
        continue;
      }

      const key = this.midCallSubscribeRetryKey(publisher.clientId, publisher.cfSessionId, track.trackName);
      if (this.midCallSubscribeRetryTimers.has(key)) continue;
      const retry = planSubscribeRetry({
        currentAttempts: this.midCallSubscribeRetryAttempts.get(key) ?? 0,
        cap: this.SUBSCRIBE_RETRY_CAP,
        hasFirstFrame: false,
        baseBackoffMs: this.SUBSCRIBE_RETRY_BASE_BACKOFF_MS,
        maxBackoffMs: this.SUBSCRIBE_RETRY_MAX_BACKOFF_MS,
      });
      this.midCallSubscribeRetryAttempts.set(key, retry.nextAttempts);
      if (!retry.shouldRetry) {
        if (retry.capped) {
          console.warn('[SFU] mid-call subscribe permanently stopped after capped retries', {
            publisherClientId: publisher.clientId,
            publisherCfSessionId: publisher.cfSessionId,
            trackName: track.trackName,
            retryAttempts: retry.nextAttempts,
            error: String(err),
          });
        }
        this.midCallSubscribeRetryTimers.delete(key);
        continue;
      }

      const timer = setTimeout(() => {
        this.midCallSubscribeRetryTimers.delete(key);
        this.retryMidCallSubscribeTrack(publisher.clientId, publisher.cfSessionId, track.trackName);
      }, retry.backoffMs ?? 0);
      this.midCallSubscribeRetryTimers.set(key, timer);
    }
  }

  private retryMidCallSubscribeTrack(clientId: string, cfSessionId: string, trackName: string): void {
    const key = this.midCallSubscribeRetryKey(clientId, cfSessionId, trackName);
    const publisher = this.remotePublishers().get(clientId);
    if (!publisher || publisher.cfSessionId !== cfSessionId) {
      this.clearMidCallSubscribeRetryKey(key);
      return;
    }

    const missingTracks = this.missingAdvertisedRemoteTracks(publisher, new Set([trackName]));
    if (!missingTracks.length) {
      this.clearMidCallSubscribeRetryKey(key);
      return;
    }

    this.enqueueMidCallSubscribeTracks(publisher, missingTracks);
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

  private async doReplaceLocalTrackAndPublishIfNeeded(
    kind: 'audio' | 'video',
    sender: RTCRtpSender | null,
    track: MediaStreamTrack | null,
  ): Promise<boolean> {
    if (!sender) return false;
    const previousTrack = sender.track;
    const publishState = this.localPublishState();
    const publishedState = publishState?.status === 'published' ? publishState : null;
    const shouldPublish =
      !!publishedState &&
      !!this.pc &&
      !!this.callerCreds &&
      shouldRegisterFirstAddedLocalTrack(publishedState.tracks, kind, !!track);

    await sender.replaceTrack(track);
    if (!shouldPublish || !track || !publishedState || !this.pc || !this.callerCreds) return false;

    try {
      return await this.doRegisterFirstAddedLocalTrack(kind, sender, publishedState, this.callerCreds);
    } catch (err) {
      await this.rollbackPendingLocalOffer();
      await sender.replaceTrack(previousTrack);
      throw err;
    }
  }

  private async doRegisterFirstAddedLocalTrack(
    kind: 'audio' | 'video',
    sender: RTCRtpSender,
    publishState: LocalPublishState,
    creds: { clientKey: string; participantId: string; sessionId: string },
  ): Promise<boolean> {
    if (!this.pc) return false;
    const transceiver = this.pc.getTransceivers().find((candidate) => candidate.sender === sender);
    const mid = transceiver?.mid;
    if (!mid) throw new Error(`[sfu] cannot publish first ${kind} track without a sender mid`);

    const { clientKey, participantId, sessionId } = creds;
    const trackName = `${participantId}:${Date.now()}:${kind}:${crypto.randomUUID()}`;

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const tracksRes = await withTimeout(
      firstValueFrom(
        this.http.post<{ sessionDescription: RTCSessionDescriptionInit }>('/api/sfu/tracks', {
          clientKey,
          participantId,
          sessionId,
          cfSessionId: publishState.cfSessionId,
          sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
          tracks: [{ location: 'local', mid, trackName }],
        }),
      ),
      SFU_HTTP_TIMEOUT_MS,
      'POST /api/sfu/tracks',
    );

    await this.pc.setRemoteDescription(tracksRes.sessionDescription);
    const currentState = this.localPublishState();
    if (currentState?.status !== 'published') return false;
    if (!shouldRegisterFirstAddedLocalTrack(currentState.tracks, kind, true)) return false;
    this.localPublishState.set({
      ...currentState,
      tracks: [...currentState.tracks, { trackName, kind, mid, status: 'live' }],
    });
    return true;
  }

  private async rollbackPendingLocalOffer(): Promise<void> {
    if (!this.pc || this.pc.signalingState !== 'have-local-offer') return;
    try {
      await this.pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
    } catch {
      // If rollback is unsupported or no longer valid, sender rollback still preserves local media.
    }
  }

  private async rollbackAddedScreenTransceiver(transceiver: RTCRtpTransceiver): Promise<void> {
    try {
      await transceiver.sender.replaceTrack(null);
    } catch {
      // Best-effort cleanup; the pending offer rollback is the consistency guarantee.
    }
    try {
      transceiver.stop();
    } catch {
      // Older browser shims may not allow stopping an uncommitted transceiver.
    }
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
    try {
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
    } catch (err) {
      await this.rollbackPendingLocalOffer();
      await this.rollbackAddedScreenTransceiver(transceiver);
      if (this.screenSender === transceiver.sender) this.screenSender = null;
      throw err;
    }
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
    this.clearLocalTransportSessionState();
    this.callerCreds = null;
    this.remotePublishers.set(new Map());
    this.resetTransportRecoveryState(true);
  }

  // Exit teardown: close the SFU PC immediately (stops media), then fire-and-forget the CF
  // track-close PUT. State is cleared immediately so double-calls (deliberate-exit cleanupCall
  // followed by ngOnDestroy cleanupCall) are no-ops. CF 30s GC is the fallback.
  closeLiveTracksForExit(): void {
    this.closePeerConnectionForRecovery();

    // Snapshot and clear immediately — makes this call idempotent (second call returns early)
    const publishState = this.localPublishState();
    const creds = this.callerCreds;
    this.callerCreds = null;
    this.localPublishState.set(null);
    this.setPublishPhase(null);
    this.opQueue = Promise.resolve();
    this.recoveryPublishIceServers = null;
    this.pendingOntrack.clear();
    this.clearAllSubscribeStuckWatchdogs();
    this.clearAllSubscribeBackoffTimers();
    this.clearAllMidCallSubscribeRetryState();
    this.resetConnectionQuality();
    this.subscribedClientIds.clear();
    this.midToEntry.clear();
    this.subscribeRetryAttempts.clear();
    this.subscribeInitiatedAt.clear();
    this.subscribeFirstFrameAt.clear();
    this.resetTransportRecoveryState(true);
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
    this.closePeerConnectionForRecovery();
    this.callerCreds = null;
    this.subscribedClientIds.clear();
    this.midToEntry.clear();
    this.pendingOntrack.clear();
    this.subscribeRetryAttempts.clear();
    this.subscribeInitiatedAt.clear();
    this.subscribeFirstFrameAt.clear();
    this.clearAllSubscribeStuckWatchdogs();
    this.clearAllSubscribeBackoffTimers();
    this.clearAllMidCallSubscribeRetryState();
    this.resetConnectionQuality();
    this.resetTransportRecoveryState(true);
    this.localPublishState.set(null);
    this.setPublishPhase(null);
    this.opQueue = Promise.resolve();
    this.recoveryPublishIceServers = null;
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
      this.setPublishPhase('ice-config');
      const iceServers = await this.consumePublishIceServers();
      this.currentIceTransportPolicy = 'all';
      this.setPublishPhase('pc-create');
      this.pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: this.currentIceTransportPolicy });
      this.installTransportStateHandlers(this.pc);

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

  private async consumePublishIceServers(): Promise<RTCIceServer[]> {
    const recoveryIceServers = this.recoveryPublishIceServers;
    this.recoveryPublishIceServers = null;
    return recoveryIceServers ?? this.iceConfigService.getIceServers();
  }

  private async doSubscribe(publisher: import('./sfu-roster-utils.js').RemotePublisher): Promise<void> {
    await this.doSubscribeTracks(publisher, publisher.tracks);
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
    const tracksToSubscribe = tracks.filter((track) => !this.isTrackSubscribed(publisher.clientId, track.trackName));
    if (!tracksToSubscribe.length) return;
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
    const kindMap = new Map(tracksToSubscribe.map((t) => [t.trackName, t.kind]));

    // Snapshot existing transceiver mids before POST — new ones added by CF renegotiation
    const existingMids = new Set(this.pc.getTransceivers().map((t) => t.mid).filter((m): m is string => !!m));

    const res = await withTimeout(
      firstValueFrom(
        this.http.post<CfTracksResponse>('/api/sfu/tracks', {
          ...creds,
          cfSessionId,
          tracks: tracksToSubscribe.map((t) => {
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

    const subscribedBefore = new Map(this.subscribedTracks());
    const nextSubscribed = new Map(subscribedBefore);
    const touchedMidEntries = new Map<string, { hadEntry: boolean; entry: SubscribedTrackEntry | null }>();
    const firstFrameSnapshot = this.subscribeFirstFrameAt.has(publisher.clientId)
      ? { hadValue: true, value: this.subscribeFirstFrameAt.get(publisher.clientId)! }
      : { hadValue: false, value: 0 };
    const retryAttemptSnapshot = this.subscribeRetryAttempts.has(publisher.clientId)
      ? { hadValue: true, value: this.subscribeRetryAttempts.get(publisher.clientId)! }
      : { hadValue: false, value: 0 };

    const rememberTouchedMid = (mid: string): void => {
      if (touchedMidEntries.has(mid)) return;
      touchedMidEntries.set(mid, {
        hadEntry: this.midToEntry.has(mid),
        entry: this.midToEntry.get(mid) ?? null,
      });
    };

    const rollbackSubscribeMutation = async (): Promise<void> => {
      for (const [mid, previous] of touchedMidEntries) {
        if (previous.hadEntry && previous.entry) {
          this.midToEntry.set(mid, previous.entry);
        } else {
          this.midToEntry.delete(mid);
        }
      }
      this.subscribedTracks.set(subscribedBefore);
      if (firstFrameSnapshot.hadValue) {
        this.subscribeFirstFrameAt.set(publisher.clientId, firstFrameSnapshot.value);
      } else {
        this.subscribeFirstFrameAt.delete(publisher.clientId);
      }
      if (retryAttemptSnapshot.hadValue) {
        this.subscribeRetryAttempts.set(publisher.clientId, retryAttemptSnapshot.value);
      } else {
        this.subscribeRetryAttempts.delete(publisher.clientId);
      }
      await this.rollbackPendingLocalOffer();
    };

    try {
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
          rememberTouchedMid(r.realMid);
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
          rememberTouchedMid(rt.mid);
          this.midToEntry.set(rt.mid, entry);
          nextSubscribed.set(rt.mid, entry);
        }
        this.flushPendingOntrack();
      }
    } catch (err) {
      await rollbackSubscribeMutation();
      throw err;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function secondsToMsOrNull(value: unknown): number | null {
  const seconds = numberOrNull(value);
  return seconds === null ? null : Math.round(seconds * 1000);
}

function ssrcKindKey(ssrc: unknown, kind: unknown): string | null {
  if (ssrc === null || ssrc === undefined) return null;
  if (typeof kind !== 'string' || !kind) return null;
  return `${String(ssrc)}:${kind}`;
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
