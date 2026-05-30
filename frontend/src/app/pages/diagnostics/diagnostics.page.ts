import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  DiagnosticEntry,
  DiagnosticsInboundAudio,
  DiagnosticsInboundVideo,
  DiagnosticSessionSummary,
  DiagnosticsDetailResponse,
  DiagnosticsPeerSample,
  DiagnosticsTrackInfo,
  MeetingSessionsService,
  SfuDiagnosticsSnapshot,
  SfuInboundTrackStats,
  SfuOutboundTrackStats,
  SfuSubscribeLatency,
} from '../../services/meeting-sessions.service';
import { IceConfigService, TurnHealthResult } from '../../services/ice-config.service';
import {
  classifyRemoteAudioHealth,
  concealmentRatio,
  remoteAudioBadgeLabel,
  RemoteAudioHealth,
} from '../../services/remote-audio-health';

@Component({
  selector: 'app-diagnostics-page',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './diagnostics.page.html',
  styleUrl: './diagnostics.page.scss',
})
export class DiagnosticsPage {
  private readonly sessionsService = inject(MeetingSessionsService);
  private readonly iceConfig = inject(IceConfigService);

  readonly sessions = signal<DiagnosticSessionSummary[]>([]);
  readonly selectedSessionId = signal<string | null>(null);
  readonly detail = signal<DiagnosticsDetailResponse | null>(null);
  readonly loading = signal(true);
  readonly detailLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly turnHealth = this.iceConfig.lastTurnHealth;
  readonly turnHealthChecking = this.iceConfig.turnHealthInFlight;

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.sessionsService.listDiagnostics({ page: 1, pageSize: 50 });
      this.sessions.set(result.sessions);
      const nextSelected = this.selectedSessionId() || result.sessions[0]?.id || null;
      this.selectedSessionId.set(nextSelected);
      if (nextSelected) await this.selectSession(nextSelected);
    } catch {
      this.error.set('Diagnostics could not be loaded');
      this.sessions.set([]);
      this.detail.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async selectSession(sessionId: string): Promise<void> {
    this.selectedSessionId.set(sessionId);
    this.detailLoading.set(true);
    this.error.set(null);
    try {
      this.detail.set(await this.sessionsService.getDiagnostics(sessionId));
    } catch {
      this.detail.set(null);
      this.error.set('Diagnostics detail could not be loaded');
    } finally {
      this.detailLoading.set(false);
    }
  }

  downloadUrl(sessionId: string): string {
    return this.sessionsService.diagnosticsDownloadUrl(sessionId);
  }

  async runTurnHealthCheck(): Promise<void> {
    await this.iceConfig.checkTurnHealth();
  }

  turnHealthSummary(result: TurnHealthResult | null): string {
    if (!result) return 'Not checked';
    const status = result.status === 'reachable' ? 'TURN reachable' : 'TURN unavailable';
    const transport = result.transport ? ` · ${result.transport}` : '';
    const elapsed = ` · ${result.elapsedMs}ms`;
    const error = result.error ? ` · ${result.error}` : '';
    return `${status}${transport}${elapsed}${error}`;
  }

  turnHealthClass(result: TurnHealthResult | null): 'turn-health-ok' | 'turn-health-bad' | 'turn-health-neutral' {
    if (!result) return 'turn-health-neutral';
    return result.status === 'reachable' ? 'turn-health-ok' : 'turn-health-bad';
  }

  latestEntry(): DiagnosticEntry | null {
    const entries = this.detail()?.entries ?? [];
    return entries.length ? entries[entries.length - 1] : null;
  }

  trackSummary(entry: DiagnosticEntry, kind: 'audio' | 'video'): string {
    const peer = entry.payload.peers.find((candidate) => candidate.outboundAudio.source === 'sender' || candidate.outboundVideo.source === 'sender') ?? entry.payload.peers[0];
    const track = kind === 'audio' ? peer?.outboundAudio : peer?.outboundVideo;
    if (!track) return 'No track';
    const label = track.label || 'Unlabeled';
    const deviceId = track.deviceId || 'no deviceId';
    return `${label} (${deviceId})`;
  }

  audioSettingsSummary(track: DiagnosticsTrackInfo | undefined): string {
    if (!track) return 'audio settings n/a';
    const ec = this.booleanSetting(track.echoCancellation);
    const ns = this.booleanSetting(track.noiseSuppression);
    const agc = this.booleanSetting(track.autoGainControl);
    const sampleRate = typeof track.sampleRate === 'number' ? `${track.sampleRate} Hz` : 'sample n/a';
    const channelCount = typeof track.channelCount === 'number' ? `${track.channelCount} ch` : 'channels n/a';
    return `EC ${ec} · NS ${ns} · AGC ${agc} · ${sampleRate} · ${channelCount}`;
  }

  entryOutboundAudioSettings(entry: DiagnosticEntry): string {
    const peer = entry.payload.peers.find((candidate) => candidate.outboundAudio.source === 'sender') ?? entry.payload.peers[0];
    return this.audioSettingsSummary(peer?.outboundAudio);
  }

  inboundAudioSummary(entry: DiagnosticEntry): string {
    const peer = this.inboundAudioPeer(entry);
    return this.peerInboundAudioSummary(peer);
  }

  inboundVideoSummary(entry: DiagnosticEntry): string {
    const peer = this.inboundAudioPeer(entry);
    return this.peerInboundVideoSummary(peer);
  }

  wsHealthSummary(entry: DiagnosticEntry): string {
    const ws = entry.payload.wsHealth;
    if (!ws) return `${entry.payload.wsStatus || 'unknown'} · reconnects ${entry.payload.wsReconnectAttempts ?? 0}`;
    const lastCycle = ws.cycles?.[ws.cycles.length - 1];
    const stuck = lastCycle?.timeStuckMs == null ? 'stuck n/a' : `stuck ${Math.round(lastCycle.timeStuckMs / 1000)}s`;
    const lastPong = ws.lastPongAgoMs == null ? 'pong n/a' : `pong ${Math.round(ws.lastPongAgoMs / 1000)}s ago`;
    return `${ws.status} · disconnects ${ws.disconnectCount} · reconnect attempts ${ws.reconnectAttempts} · heartbeat misses ${ws.heartbeatMissCount ?? 0} · ${lastPong} · ${stuck}`;
  }

  peerForensicsSummary(peer: DiagnosticsPeerSample): string {
    return `${this.candidatePairSummary(peer)} · relay ${this.relayGatheredSummary(peer)} · pair count ${peer.candidatePairCount ?? 0}`;
  }

  candidatePairSummary(peer: DiagnosticsPeerSample): string {
    const pair = peer.candidatePair;
    if (!pair) return `pair unknown (${peer.selectedCandidateType || 'candidate unknown'})`;
    const local = pair.local ? `${pair.local.candidateType || '?'}:${pair.local.protocol || '?'}` : 'local ?';
    const remote = pair.remote ? `${pair.remote.candidateType || '?'}:${pair.remote.protocol || '?'}` : 'remote ?';
    const nominated = pair.nominated ? 'nominated' : 'not nominated';
    return `${local} -> ${remote} · ${pair.state || 'state ?'} · ${nominated}`;
  }

  relayGatheredSummary(peer: DiagnosticsPeerSample): string {
    const relay = peer.iceRelayGathered;
    if (!relay) return 'local n/a / remote n/a';
    return `local ${relay.local ? 'yes' : 'no'} / remote ${relay.remote ? 'yes' : 'no'}`;
  }

  iceRestartSummary(peer: DiagnosticsPeerSample): string {
    const restart = peer.iceRestart;
    if (!restart) return 'restart audit n/a';
    const outcome = restart.lastOutcome || 'none';
    const recover = restart.lastTimeToRecoverMs == null ? 'recover n/a' : `recover ${Math.round(restart.lastTimeToRecoverMs / 1000)}s`;
    return `fired ${restart.fired ? 'yes' : 'no'} · attempts ${restart.attempts} · ${outcome} · ${recover} · terminal failed ${restart.terminalFailed ? 'yes' : 'no'}`;
  }

  negotiationSummary(peer: DiagnosticsPeerSample): string {
    const negotiation = peer.negotiation;
    if (!negotiation) return 'negotiation n/a';
    const neededOffer = negotiation.lastNegotiationNeededOfferSent == null ? 'offerSent n/a' : `offerSent ${negotiation.lastNegotiationNeededOfferSent ? 'yes' : 'no'}`;
    return `needed ${negotiation.negotiationNeededCount} · ${neededOffer} · offers ${negotiation.offerSentCount}/${negotiation.offerReceivedCount} · answers ${negotiation.answerSentCount}/${negotiation.answerReceivedCount} · glare ${negotiation.glareIgnoredCount}`;
  }

  transitionSummary(peer: DiagnosticsPeerSample): string {
    const latest = peer.transitionTimeline?.slice(-3) ?? [];
    if (!latest.length) return 'timeline empty';
    return latest.map((item) => `${item.scope}:${item.event || `${item.from || '?'}>${item.to || '?'}`}`).join(' · ');
  }

  micLivenessSummary(entry: DiagnosticEntry): string {
    const level = entry.payload.outboundAudioLevel == null ? 'level n/a' : `level ${entry.payload.outboundAudioLevel.toFixed(3)}`;
    const energy = entry.payload.outboundAudioEnergy == null ? 'energy n/a' : `energy ${entry.payload.outboundAudioEnergy.toFixed(6)}`;
    if (entry.payload.micSilent === true) return `MIC SILENT · ${level} · ${energy}`;
    if (entry.payload.micSilent === false) return `mic live · ${level} · ${energy}`;
    return `mic liveness n/a · ${level} · ${energy}`;
  }

  micLivenessClass(entry: DiagnosticEntry): 'mic-live-ok' | 'mic-live-bad' | 'mic-live-neutral' {
    if (entry.payload.micSilent === true) return 'mic-live-bad';
    if (entry.payload.micSilent === false) return 'mic-live-ok';
    return 'mic-live-neutral';
  }

  peerInboundAudioSummary(peer: DiagnosticsPeerSample | undefined): string {
    const inbound = peer?.inboundAudio;
    if (!inbound) return '✗ not arriving · packets 0 · track unknown';
    const arriving = inbound.packetsActivelyArriving === true && (inbound.packetsReceived ?? 0) > 0;
    const status = arriving ? '✓ arriving' : '✗ not arriving';
    const packets = inbound.packetsReceived ?? 0;
    const delta = inbound.packetsReceivedDelta == null ? 'delta n/a' : `delta +${inbound.packetsReceivedDelta}`;
    const level = inbound.audioLevel == null ? 'level n/a' : `level ${inbound.audioLevel.toFixed(3)}`;
    const jitterBuffer = inbound.jitterBufferDelay == null ? 'jb n/a' : `jb ${inbound.jitterBufferDelay.toFixed(3)}s`;
    const track = inbound.trackReadyState || 'track unknown';
    const muted = inbound.trackMuted == null ? 'muted n/a' : `muted ${inbound.trackMuted ? 'yes' : 'no'}`;
    return `${status} · packets ${packets} · ${delta} · ${level} · ${jitterBuffer} · ${track} · ${muted}`;
  }

  peerInboundVideoSummary(peer: DiagnosticsPeerSample | undefined): string {
    const inbound = peer?.inboundVideo;
    if (!inbound) return 'not sampled · frames n/a · freeze n/a';
    const status = inbound.noInboundMedia ? 'NO MEDIA' : inbound.videoFrozen ? 'VIDEO FROZEN' : inbound.framesActivelyDecoding ? 'decoding' : 'not decoding';
    const frames = inbound.framesDecoded ?? 0;
    const delta = inbound.framesDecodedDelta == null ? 'delta n/a' : `delta +${inbound.framesDecodedDelta}`;
    const received = inbound.framesReceived == null ? 'received n/a' : `received ${inbound.framesReceived}`;
    const freezes = inbound.freezeCount == null ? 'freeze n/a' : `freeze ${inbound.freezeCount}`;
    const receivedBytes = inbound.bytesReceived == null ? 'bytes n/a' : `bytes ${inbound.bytesReceived}`;
    const samples = `samples vf=${inbound.videoFrozenSamples ?? 0}/nm=${inbound.noInboundMediaSamples ?? 0}`;
    const expected = inbound.videoExpected ? 'expected' : 'not expected';
    return `${status} · frames ${frames} · ${delta} · ${received} · ${receivedBytes} · ${freezes} · ${samples} · ${expected}`;
  }

  peerOutboundVideoStatsSummary(peer: DiagnosticsPeerSample | undefined): string {
    const outbound = peer?.outboundVideoStats;
    if (!outbound) return 'send stats n/a';
    const sending = outbound.activelySending == null ? 'sending n/a' : outbound.activelySending ? 'sending' : 'not sending';
    const framesEncoded = outbound.framesEncoded == null ? 'encoded n/a' : `encoded ${outbound.framesEncoded}`;
    const framesDelta = outbound.framesSentDelta == null ? 'sent delta n/a' : `sent delta +${outbound.framesSentDelta}`;
    const quality = outbound.qualityLimitationReason || 'quality n/a';
    const encoding = outbound.senderEncoding;
    const maxBitrate = encoding.maxBitrate == null ? 'max bitrate n/a' : `max bitrate ${encoding.maxBitrate}`;
    return `${sending} · ${framesEncoded} · ${framesDelta} · ${quality} · ${maxBitrate}`;
  }

  peerLabelsSummary(peer: DiagnosticsPeerSample | undefined): string {
    const labels = peer?.diagnosticLabels ?? [];
    return labels.length ? labels.join(', ') : 'none';
  }

  audioRecvClass(inbound: DiagnosticsInboundAudio | undefined): 'audio-recv-ok' | 'audio-recv-bad' {
    return inbound?.packetsActivelyArriving === true && (inbound.packetsReceived ?? 0) > 0 ? 'audio-recv-ok' : 'audio-recv-bad';
  }

  videoRecvClass(inbound: DiagnosticsInboundVideo | undefined): 'audio-recv-ok' | 'audio-recv-bad' {
    return inbound?.videoFrozen || inbound?.noInboundMedia ? 'audio-recv-bad' : 'audio-recv-ok';
  }

  entryAudioRecvClass(entry: DiagnosticEntry): 'audio-recv-ok' | 'audio-recv-bad' {
    return this.audioRecvClass(this.inboundAudioPeer(entry)?.inboundAudio);
  }

  entryVideoRecvClass(entry: DiagnosticEntry): 'audio-recv-ok' | 'audio-recv-bad' {
    return this.videoRecvClass(this.inboundAudioPeer(entry)?.inboundVideo);
  }

  private inboundAudioPeer(entry: DiagnosticEntry): DiagnosticsPeerSample | undefined {
    return entry.payload.peers.find((candidate) => !candidate.isLocal && candidate.inboundAudio) ?? entry.payload.peers[0];
  }

  candidateLabel(entry: DiagnosticEntry): string {
    return entry.candidateTypes.length ? entry.candidateTypes.join(', ') : 'unknown';
  }

  relayLabel(session: DiagnosticSessionSummary | DiagnosticEntry): string {
    return session.relayUsed ? 'relay used' : 'no relay seen';
  }

  sfuDiag(entry: DiagnosticEntry): SfuDiagnosticsSnapshot | null {
    return (entry.payload.sfuDiagnostics as SfuDiagnosticsSnapshot | undefined) ?? null;
  }

  sfuTransportSummary(diag: SfuDiagnosticsSnapshot): string {
    const session = diag.cfSessionId ? diag.cfSessionId.slice(0, 12) + '…' : 'no session';
    const state = `${diag.connectionState}/${diag.iceConnectionState}`;
    const rtt = diag.rttMs !== null ? `RTT ${diag.rttMs}ms` : 'RTT n/a';
    const local = diag.localCandidateType ?? 'local?';
    const remote = diag.remoteCandidateType ?? 'remote?';
    return `${session} · ${state} · ${rtt} · ${local}→${remote}`;
  }

  sfuOutboundSummary(track: SfuOutboundTrackStats): string {
    const rid = track.rid ? ` [${track.rid}]` : '';
    const frames = track.framesEncoded !== null ? `frames ${track.framesEncoded}` : 'frames n/a';
    const bytes = track.bytesSent !== null ? `bytes ${track.bytesSent}` : 'bytes n/a';
    const quality = track.qualityLimitationReason ?? 'quality n/a';
    return `${track.kind}${rid} · ${frames} · ${bytes} · ${quality}`;
  }

  sfuInboundSummary(track: SfuInboundTrackStats): string {
    const client = track.publisherClientId.slice(0, 8);
    const rid = track.rid ? ` [${track.rid}]` : '';
    const frames = track.framesDecoded !== null ? `frames ${track.framesDecoded}` : 'frames n/a';
    const packets = track.packetsReceived !== null ? `pkts ${track.packetsReceived}` : 'pkts n/a';
    const lost = track.packetsLost !== null ? `lost ${track.packetsLost}` : '';
    const jb = track.jitterBufferDelay !== null && track.kind === 'audio' ? ` · jb ${track.jitterBufferDelay.toFixed(3)}s` : '';
    return `${client} ${track.kind}${rid} · ${frames} · ${packets}${lost ? ' ' + lost : ''}${jb}`;
  }

  sfuLatencySummary(lat: SfuSubscribeLatency): string {
    const client = lat.publisherClientId.slice(0, 8);
    const latency = lat.latencyMs !== null ? `${lat.latencyMs}ms` : 'pending';
    return `${client} · ${latency}`;
  }

  // --- R7: per-remote-publisher inbound AUDIO health ---

  // Map publisherClientId -> latest participant name from the diagnostics
  // payloads (R6 attribution link: payload.clientId / payload.clientName).
  private publisherNameMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const entry of this.detail()?.entries ?? []) {
      const clientId = entry.payload.clientId;
      const name = entry.payload.clientName;
      if (clientId && name) map.set(clientId, name);
    }
    return map;
  }

  // Map publisherClientId -> latest source micSilent from the payloads.
  private publisherMicSilentMap(): Map<string, boolean> {
    const map = new Map<string, boolean>();
    for (const entry of this.detail()?.entries ?? []) {
      const clientId = entry.payload.clientId;
      if (clientId && typeof entry.payload.micSilent === 'boolean') {
        map.set(clientId, entry.payload.micSilent);
      }
    }
    return map;
  }

  publisherName(publisherClientId: string): string {
    return this.publisherNameMap().get(publisherClientId) ?? publisherClientId.slice(0, 8);
  }

  sourceMicSilentFor(publisherClientId: string): boolean | null {
    const value = this.publisherMicSilentMap().get(publisherClientId);
    return value === undefined ? null : value;
  }

  remoteAudioHealthFor(track: SfuInboundTrackStats): RemoteAudioHealth {
    return classifyRemoteAudioHealth(track, this.sourceMicSilentFor(track.publisherClientId));
  }

  remoteAudioHealthClass(track: SfuInboundTrackStats): 'audio-recv-ok' | 'audio-recv-bad' | 'audio-recv-neutral' {
    const health = this.remoteAudioHealthFor(track);
    if (health === 'silent') return 'audio-recv-bad';
    if (health === 'ok') return 'audio-recv-ok';
    return 'audio-recv-neutral';
  }

  // Empty string for 'ok' / 'unknown' ⇒ NO badge rendered (badge only for 'silent').
  remoteAudioBadge(track: SfuInboundTrackStats): string {
    return remoteAudioBadgeLabel(this.remoteAudioHealthFor(track), this.sourceMicSilentFor(track.publisherClientId));
  }

  // D1 display corroboration only — concealmentRatio is NOT the badge driver here,
  // it is the same value the classifier uses, surfaced for human reading.
  concealmentPctLabel(track: SfuInboundTrackStats): string {
    const ratio = concealmentRatio(track);
    return ratio === null ? 'concealment n/a' : `${(ratio * 100).toFixed(1)}% concealed`;
  }

  // At-a-glance audio rows for the latest entry: one row per inbound AUDIO track.
  remoteAudioRows(entry: DiagnosticEntry): Array<{
    name: string;
    bytes: string;
    packets: string;
    concealment: string;
    health: RemoteAudioHealth;
    class: 'audio-recv-ok' | 'audio-recv-bad' | 'audio-recv-neutral';
    badge: string;
  }> {
    const tracks = entry.payload.sfuDiagnostics?.inboundTracks ?? [];
    return tracks
      .filter((track) => track.kind === 'audio')
      .map((track) => ({
        name: this.publisherName(track.publisherClientId),
        bytes: track.bytesReceived === null ? 'bytes n/a' : `bytes ${track.bytesReceived}`,
        packets: track.packetsReceived === null ? 'pkts n/a' : `pkts ${track.packetsReceived}`,
        concealment: this.concealmentPctLabel(track),
        health: this.remoteAudioHealthFor(track),
        class: this.remoteAudioHealthClass(track),
        badge: this.remoteAudioBadge(track),
      }));
  }

  private booleanSetting(value: boolean | null | undefined): string {
    if (value === true) return 'on';
    if (value === false) return 'off';
    return 'n/a';
  }
}
