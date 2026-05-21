import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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
  packetsReceivedDelta: number | null;
  packetsActivelyArriving: boolean | null;
  trackReadyState: MediaStreamTrackState | null;
  trackMuted: boolean | null;
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
  makingOffer: boolean;
  ignoreOffer: boolean;
  glareIgnoredCount: number;
  rollbackCount: number;
};

export type DiagnosticsRelayGathered = {
  local: boolean;
  remote: boolean;
};

export type DiagnosticsPeerSample = {
  id: string;
  participantId?: string;
  name: string;
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
  outboundAudio: DiagnosticsTrackInfo;
  inboundAudio: DiagnosticsInboundAudio;
  outboundVideo: DiagnosticsTrackInfo;
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
  cycles: DiagnosticsWsCycle[];
};

export type DiagnosticsPayload = {
  kind: 'sample' | 'state-change' | 'reconnect' | 'error' | 'call-end';
  roomId: string;
  roomTitle: string;
  clientId: string | null;
  participantId: string | null;
  clientKey: string;
  clientName: string;
  createdAt: number;
  wsStatus: string;
  wsReconnectAttempts: number;
  wsHealth: DiagnosticsWsHealth;
  forceRelay: boolean;
  manualAudioOnly: boolean;
  outboundAudioLevel: number | null;
  outboundAudioEnergy: number | null;
  micSilent: boolean | null;
  peers: DiagnosticsPeerSample[];
  error?: string;
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

  async appendDiagnostics(sessionId: string, payload: DiagnosticsPayload): Promise<void> {
    await firstValueFrom(this.http.post(`/api/meeting-sessions/${encodeURIComponent(sessionId)}/diagnostics`, payload));
  }

  sendDiagnosticsBeacon(sessionId: string, payload: DiagnosticsPayload): boolean {
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
