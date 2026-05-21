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
} from '../../services/meeting-sessions.service';

@Component({
  selector: 'app-diagnostics-page',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './diagnostics.page.html',
  styleUrl: './diagnostics.page.scss',
})
export class DiagnosticsPage {
  private readonly sessionsService = inject(MeetingSessionsService);

  readonly sessions = signal<DiagnosticSessionSummary[]>([]);
  readonly selectedSessionId = signal<string | null>(null);
  readonly detail = signal<DiagnosticsDetailResponse | null>(null);
  readonly loading = signal(true);
  readonly detailLoading = signal(false);
  readonly error = signal<string | null>(null);

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
    return `needed ${negotiation.negotiationNeededCount} · offers ${negotiation.offerSentCount}/${negotiation.offerReceivedCount} · answers ${negotiation.answerSentCount}/${negotiation.answerReceivedCount} · glare ${negotiation.glareIgnoredCount}`;
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
    const track = inbound.trackReadyState || 'track unknown';
    const muted = inbound.trackMuted == null ? 'muted n/a' : `muted ${inbound.trackMuted ? 'yes' : 'no'}`;
    return `${status} · packets ${packets} · ${delta} · ${level} · ${track} · ${muted}`;
  }

  peerInboundVideoSummary(peer: DiagnosticsPeerSample | undefined): string {
    const inbound = peer?.inboundVideo;
    if (!inbound) return 'not sampled · frames n/a · freeze n/a';
    const status = inbound.noInboundMedia ? 'NO MEDIA' : inbound.videoFrozen ? 'VIDEO FROZEN' : inbound.framesActivelyDecoding ? 'decoding' : 'not decoding';
    const frames = inbound.framesDecoded ?? 0;
    const delta = inbound.framesDecodedDelta == null ? 'delta n/a' : `delta +${inbound.framesDecodedDelta}`;
    const received = inbound.framesReceived == null ? 'received n/a' : `received ${inbound.framesReceived}`;
    const freezes = inbound.freezeCount == null ? 'freeze n/a' : `freeze ${inbound.freezeCount}`;
    const samples = `samples vf=${inbound.videoFrozenSamples ?? 0}/nm=${inbound.noInboundMediaSamples ?? 0}`;
    const expected = inbound.videoExpected ? 'expected' : 'not expected';
    return `${status} · frames ${frames} · ${delta} · ${received} · ${freezes} · ${samples} · ${expected}`;
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

  private booleanSetting(value: boolean | null | undefined): string {
    if (value === true) return 'on';
    if (value === false) return 'off';
    return 'n/a';
  }
}
