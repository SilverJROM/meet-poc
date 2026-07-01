import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SubscribeFailureEvidence } from './sfu-subscribe-failure-evidence.js';

export type MeetingSession = {
  id: string;
  roomId: string;
  roomTitle: string;
  hostEmail: string;
  startedAtIso: string;
  admittedPeak: number;
  endedAtIso?: string;
  endedReason?: string;
  durationMs?: number;
  recordingsCount?: number;
};

export type ActiveSessionsResponse = {
  sessions: MeetingSession[];
  total: number;
};

export type EndedSessionsResponse = {
  sessions: MeetingSession[];
  page: number;
  pageSize: number;
  total: number;
};

export type DiagnosticsTrackInfo = {
  id: string | null;
  kind: 'audio' | 'video';
  deviceId: string | null;
  label: string | null;
  echoCancellation?: boolean | null;
  noiseSuppression?: boolean | null;
  autoGainControl?: boolean | null;
  sampleRate?: number | null;
  channelCount?: number | null;
  enabled: boolean | null;
  muted: boolean | null;
  readyState: MediaStreamTrackState | null;
  source: 'sender' | 'stream' | 'none';
};

export type DiagnosticsInboundAudio = {
  packetsReceived: number | null;
  packetsLost: number | null;
  bytesReceived: number | null;
  audioLevel: number | null;
  jitterBufferDelay: number | null;
  jitterBufferTargetDelay: number | null;
  jitterBufferEmittedCount: number | null;
  concealedSamples: number | null;
  concealmentEvents: number | null;
  remoteRoundTripTime: number | null;
  remoteFractionLost: number | null;
  packetsReceivedDelta: number | null;
  packetsActivelyArriving: boolean | null;
  trackReadyState: MediaStreamTrackState | null;
  trackMuted: boolean | null;
};

export type DiagnosticsInboundVideo = {
  bytesReceived: number | null;
  packetsReceived: number | null;
  packetsLost: number | null;
  framesDecoded: number | null;
  framesDecodedDelta: number | null;
  framesReceived: number | null;
  framesReceivedDelta: number | null;
  framesDropped: number | null;
  nackCount: number | null;
  pliCount: number | null;
  firCount: number | null;
  keyFramesDecoded: number | null;
  jitterBufferDelay: number | null;
  jitterBufferEmittedCount: number | null;
  freezeCount: number | null;
  freezeCountDelta: number | null;
  totalFreezesDuration: number | null;
  totalFreezesDurationDelta: number | null;
  framesActivelyDecoding: boolean | null;
  videoExpected: boolean;
  videoFrozenSamples: number;
  noInboundMediaSamples: number;
  videoFrozen: boolean;
  noInboundMedia: boolean;
  trackReadyState: MediaStreamTrackState | null;
  trackMuted: boolean | null;
};

export type DiagnosticsSenderEncoding = {
  active: boolean | null;
  maxBitrate: number | null;
  scaleResolutionDownBy: number | null;
  maxFramerate: number | null;
  priority: string | null;
  networkPriority: string | null;
};

export type DiagnosticsOutboundVideo = {
  bytesSent: number | null;
  packetsSent: number | null;
  framesEncoded: number | null;
  framesSent: number | null;
  framesSentDelta: number | null;
  keyFramesEncoded: number | null;
  frameWidth: number | null;
  frameHeight: number | null;
  framesPerSecond: number | null;
  targetBitrate: number | null;
  qualityLimitationReason: string | null;
  qualityLimitationDurations: Record<string, number> | null;
  nackCount: number | null;
  pliCount: number | null;
  firCount: number | null;
  activelySending: boolean | null;
  senderEncoding: DiagnosticsSenderEncoding;
  senderTrackId: string | null;
  senderTrackLabel: string | null;
  senderTrackKind: string | null;
  senderTrackSource: 'sender' | 'none';
};

export type DiagnosticsCandidateInfo = {
  id: string | null;
  candidateType: string | null;
  protocol: string | null;
  address: string | null;
  port: number | null;
};

export type DiagnosticsCandidatePair = {
  id: string | null;
  state: string | null;
  selected: boolean;
  nominated: boolean;
  local: DiagnosticsCandidateInfo | null;
  remote: DiagnosticsCandidateInfo | null;
  availableOutgoingBitrate?: number | null;
  availableIncomingBitrate?: number | null;
  currentRoundTripTime?: number | null;
  totalRoundTripTime?: number | null;
  bytesSent?: number | null;
  bytesReceived?: number | null;
};

export type DiagnosticsTransition = {
  at: number;
  atIso: string;
  scope: 'connection' | 'iceConnection' | 'signaling' | 'iceGathering' | 'candidatePair' | 'negotiation' | 'iceRestart';
  from?: string | null;
  to?: string | null;
  event?: string;
  detail?: string;
};

export type DiagnosticsIceRestartAudit = {
  fired: boolean;
  attempts: number;
  lastAttemptAt: number | null;
  lastOutcome: 'recovered' | 'failed' | 'pending' | null;
  lastTimeToRecoverMs: number | null;
  terminalFailed: boolean;
  autoRecoveryOutcome: 'recovered' | 'failed' | null;
};

export type DiagnosticsNegotiationAudit = {
  negotiationNeededCount: number;
  offerSentCount: number;
  answerSentCount: number;
  offerReceivedCount: number;
  answerReceivedCount: number;
  lastNegotiationNeededOfferSent: boolean | null;
  makingOffer: boolean;
  ignoreOffer: boolean;
  glareIgnoredCount: number;
  rollbackCount: number;
};

export type DiagnosticsTransceiverState = {
  mid: string | null;
  direction: RTCRtpTransceiverDirection;
  currentDirection: RTCRtpTransceiverDirection | null;
  senderTrackKind: string | null;
  receiverTrackKind: string | null;
  receiverTrackReadyState: MediaStreamTrackState | null;
  receiverTrackMuted: boolean | null;
};

export type DiagnosticsRelayGathered = {
  local: boolean;
  remote: boolean;
};

export type DiagnosticsPeerSample = {
  id: string;
  participantId?: string;
  name: string;
  advertisedAudioTrackNames?: string[];
  advertisedSubscribed?: boolean;
  isLocal: boolean;
  isHost: boolean;
  connectionState: string;
  iceConnectionState: string;
  iceGatheringState: string;
  signalingState: string;
  selectedCandidateType: string | null;
  candidatePair: DiagnosticsCandidatePair | null;
  candidatePairCount: number;
  nominatedPairChanges: number;
  iceRelayGathered: DiagnosticsRelayGathered;
  iceRestart: DiagnosticsIceRestartAudit;
  negotiation: DiagnosticsNegotiationAudit;
  transceivers: DiagnosticsTransceiverState[];
  transitionTimeline: DiagnosticsTransition[];
  relayUsed: boolean;
  quality: string;
  packetLossPct: number | null;
  jitterMs: number | null;
  rttMs: number | null;
  availableOutgoingBitrateKbps: number | null;
  audioOnlyReason: string | null;
  micEnabled: boolean;
  camEnabled: boolean;
  screenOn: boolean;
  diagnosticLabels?: string[];
  outboundAudio: DiagnosticsTrackInfo;
  inboundAudio: DiagnosticsInboundAudio;
  outboundVideo: DiagnosticsTrackInfo;
  outboundVideoStats?: DiagnosticsOutboundVideo;
  inboundVideo?: DiagnosticsInboundVideo;
  reconnecting?: boolean;
  updatedAt: number;
};

export type DiagnosticsWsCycle = {
  disconnectedAt: number;
  disconnectedAtIso: string;
  reconnectedAt: number | null;
  reconnectedAtIso: string | null;
  code: number | null;
  reason: string | null;
  recoveryMethod: string;
  timeStuckMs: number | null;
};

export type DiagnosticsWsHealth = {
  status: string;
  disconnectCount: number;
  reconnectAttempts: number;
  lastDisconnectAt: number | null;
  lastReconnectAt: number | null;
  lastSeenAt?: number | null;
  lastSeenAgoMs?: number | null;
  lastHeartbeatAt?: number | null;
  lastHeartbeatRttMs?: number | null;
  lastPongAgoMs?: number | null;
  heartbeatMissCount?: number;
  cycles: DiagnosticsWsCycle[];
};

export type SfuOutboundTrackStats = {
  trackName: string;
  kind: string;
  rid: string | null;
  bytesSent: number | null;
  packetsSent: number | null;
  framesEncoded: number | null;
  framesSent: number | null;
  qualityLimitationReason: string | null;
  remoteRoundTripTimeMs?: number | null;
  remoteFractionLost?: number | null;
  remoteJitterMs?: number | null;
};

export type SfuInboundTrackStats = {
  publisherClientId: string;
  trackName: string;
  kind: string;
  rid: string | null;
  bytesReceived: number | null;
  packetsReceived: number | null;
  packetsLost: number | null;
  framesDecoded: number | null;
  framesReceived: number | null;
  jitterBufferDelay: number | null;
  jitterBufferEmittedCount: number | null;
  concealedSamples: number | null;
  audioLevel?: number | null;
  totalAudioEnergy?: number | null;
  jitter?: number | null;
  nackCount?: number | null;
  pliCount?: number | null;
};

export type SfuMediaPlayoutStats = {
  audioLevel: number | null;
  totalAudioEnergy: number | null;
  totalSamplesDuration: number | null;
};

export type SfuSubscribeLatency = {
  publisherClientId: string;
  initiatedAtMs: number;
  firstFrameAtMs: number | null;
  latencyMs: number | null;
};

export type SfuConnectionQuality = {
  route: 'direct' | 'relayed' | 'unknown';
  band: 'good' | 'fair' | 'poor' | 'unknown';
  relayUsed: boolean;
  rttMs: number | null;
  packetLossPct: number | null;
  jitterMs: number | null;
  localCandidateType: string | null;
  remoteCandidateType: string | null;
  sampledAt: number;
  thresholds: {
    goodRttMs: number;
    fairRttMs: number;
    goodPacketLossPct: number;
    fairPacketLossPct: number;
    goodJitterMs: number;
    fairJitterMs: number;
  };
};

export type SfuPublishPhase = 'ice-config' | 'pc-create' | 'offer' | 'cf-session' | 'cf-tracks' | 'set-remote' | 'done' | null;

export type SfuDiagnosticsSnapshot = {
  cfSessionId: string;
  requestedIceTransportPolicy?: RTCIceTransportPolicy;
  connectionState: string | null;
  iceConnectionState: string | null;
  rttMs: number | null;
  localCandidateType: string | null;
  remoteCandidateType: string | null;
  selectedCandidatePair: DiagnosticsCandidatePair | null;
  outboundTracks: SfuOutboundTrackStats[];
  inboundTracks: SfuInboundTrackStats[];
  subscribeLatencies: SfuSubscribeLatency[];
  connectionQuality?: SfuConnectionQuality | null;
  publishPhase?: SfuPublishPhase;
  publishPhaseAtMs?: number | null;
  hasPc?: boolean;
  publishStatus?: 'publishing' | 'published' | 'error' | null;
  publishError?: string | null;
  outboundAudioSource?: { audioLevel: number | null; totalAudioEnergy: number | null } | null;
  mediaPlayout?: SfuMediaPlayoutStats;
};

export type DiagnosticsGumError = { name: string; message: string } | null;

export type DiagnosticsRemoteInboundPublisher = {
  publisherClientId: string;
  trackName: string;
  bytesReceived: number | null;
  packetsReceived: number | null;
  packetsLost: number | null;
  audioLevel: number | null;
  totalAudioEnergy: number | null;
  concealedSamples: number | null;
};

export type DiagnosticsAdvertisedNotSubscribedGap = {
  publisherClientId: string;
  name: string;
  advertisedAudioTrackNames: string[];
  actionHint: string;
};

export type DiagnosticsRecoveryEvent = {
  rung: 'subscribe-retry' | 'subscribe-renegotiate' | 'needs-rejoin' | 'throttled' | 'sfu-rejoin' | 'unrecovered-visible';
  publisherClientId: string;
  epoch: number;
  attempt: number;
  atMs: number;
};

export type DiagnosticsLayerSnapshot = {
  device: { lastGumError: DiagnosticsGumError };
  publish: {
    cfSessionId: string | null;
    status: 'publishing' | 'published' | 'error' | null;
    error: string | null;
    publishRecoveryFailed: boolean;
  };
  subscribe: SubscribeFailureEvidence | null;
  recovery: {
    lastRecoveryEvent: DiagnosticsRecoveryEvent | null;
    sfuRejoinThrottled: boolean;
  };
  playout: RemoteAudioPlayoutDiagnostics | null;
  remoteInbound: DiagnosticsRemoteInboundPublisher[];
  advertisedNotSubscribed: DiagnosticsAdvertisedNotSubscribedGap[];
};

export type RemoteAudioPlayoutDiagnostics = {
  selectedAudioOutputId: string | null;
  effectiveSinkId: string | null;
  usedFallback: boolean;
  unlocked: boolean;
  blockedPeerIds: string[];
  perPublisher: {
    publisherClientId: string;
    trackName: string | null;
    trackId: string | null;
    paused: boolean;
    muted: boolean;
    volume: number;
    sinkId: string | null;
    blockedReason: 'autoplay' | 'sink-failed' | 'paused' | 'voice-stalled' | 'playback-unsupported' | null;
    sinkApplyResult: 'selected' | 'default-fallback' | 'unsupported' | 'failed';
    sinkApplyTimedOut: boolean;
    srcObjectAttached: boolean;
    readyState: string | null;
  }[];
};

export type DiagnosticsPayload = {
  kind: 'sample' | 'state-change' | 'reconnect' | 'error' | 'call-end';
  roomId: string;
  roomTitle: string;
  clientId: string | null;
  participantId: string | null;
  clientName: string;
  createdAt: number;
  platform?: 'ios' | 'android' | 'mobile' | 'desktop';
  userAgent?: string;
  selectedAudioDeviceId?: string;
  selectedAudioOutputId?: string;
  selectedVideoDeviceId?: string;
  lastGumError?: DiagnosticsGumError;
  layerDiagnostics?: DiagnosticsLayerSnapshot;
  wsStatus: string;
  wsReconnectAttempts: number;
  wsHealth: DiagnosticsWsHealth;
  forceRelay: boolean;
  requestedIceTransportPolicy?: RTCIceTransportPolicy;
  selectedCandidatePairType?: string | null;
  forceRelayDiagnostic?: {
    status: 'reachable' | 'unavailable';
    checkedAt: number;
    elapsedMs: number;
    iceTransportPolicy: RTCIceTransportPolicy;
    candidateType: string | null;
    transport: string | null;
    error: string | null;
  } | null;
  manualAudioOnly: boolean;
  outboundAudioLevel: number | null;
  outboundAudioEnergy: number | null;
  micSilent: boolean | null;
  peers: DiagnosticsPeerSample[];
  sfuDiagnostics?: SfuDiagnosticsSnapshot;
  remoteAudioPlayout?: RemoteAudioPlayoutDiagnostics;
  publishTriggerCount?: number;
  roomState?: string;
  error?: string;
};

export type DiagnosticsPostPayload = DiagnosticsPayload & {
  clientKey: string;
};

export type DiagnosticEntry = {
  id: string;
  sessionId: string;
  roomId: string;
  roomTitle: string;
  kind: DiagnosticsPayload['kind'];
  createdAtIso: string;
  relayUsed: boolean;
  candidateTypes: string[];
  peerCount: number;
  payload: DiagnosticsPayload;
};

export type DiagnosticSessionSummary = MeetingSession & {
  diagnosticCount: number;
  lastDiagnosticAtIso: string;
  relayUsed: boolean;
  candidateTypes: string[];
};

export type DiagnosticsListResponse = {
  sessions: DiagnosticSessionSummary[];
  page: number;
  pageSize: number;
  total: number;
};

export type DiagnosticsDetailResponse = {
  session: MeetingSession;
  entries: DiagnosticEntry[];
};

@Injectable({ providedIn: 'root' })
export class MeetingSessionsService {
  private readonly http = inject(HttpClient);

  async listActive(): Promise<ActiveSessionsResponse> {
    return firstValueFrom(this.http.get<ActiveSessionsResponse>('/api/meeting-sessions?status=active'));
  }

  async listEnded(options: { page: number; pageSize: number }): Promise<EndedSessionsResponse> {
    return firstValueFrom(
      this.http.get<EndedSessionsResponse>('/api/meeting-sessions', {
        params: {
          status: 'ended',
          page: String(options.page),
          pageSize: String(options.pageSize),
        },
      }),
    );
  }

  async appendDiagnostics(sessionId: string, payload: DiagnosticsPostPayload): Promise<void> {
    await firstValueFrom(this.http.post(`/api/meeting-sessions/${encodeURIComponent(sessionId)}/diagnostics`, payload));
  }

  sendDiagnosticsBeacon(sessionId: string, payload: DiagnosticsPostPayload): boolean {
    if (!navigator.sendBeacon) return false;
    const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    return navigator.sendBeacon(`/api/meeting-sessions/${encodeURIComponent(sessionId)}/diagnostics`, body);
  }

  async listDiagnostics(options: { page: number; pageSize: number }): Promise<DiagnosticsListResponse> {
    return firstValueFrom(
      this.http.get<DiagnosticsListResponse>('/api/meeting-sessions/diagnostics-log', {
        params: {
          page: String(options.page),
          pageSize: String(options.pageSize),
        },
      }),
    );
  }

  async getDiagnostics(sessionId: string): Promise<DiagnosticsDetailResponse> {
    return firstValueFrom(this.http.get<DiagnosticsDetailResponse>(`/api/meeting-sessions/${encodeURIComponent(sessionId)}/diagnostics`));
  }

  diagnosticsDownloadUrl(sessionId: string): string {
    return `/api/meeting-sessions/${encodeURIComponent(sessionId)}/diagnostics.json`;
  }
}
