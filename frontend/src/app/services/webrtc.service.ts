import { Injectable, computed, inject, signal } from '@angular/core';
import { IceConfigService } from './ice-config.service';
import type { DiagnosticsInboundAudio, DiagnosticsPayload, DiagnosticsPeerSample, DiagnosticsTrackInfo } from './meeting-sessions.service';

export type PeerState = {
  id: string;
  participantId: string;
  name: string;
  pc: RTCPeerConnection | null;
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState | 'local';
  iceConnectionState: RTCIceConnectionState | 'local';
  iceGatheringState: RTCIceGatheringState | 'local';
  signalingState: RTCSignalingState | 'local';
  selectedCandidateType: string | null;
  quality: ConnectionQuality;
  packetLossPct: number | null;
  jitterMs: number | null;
  rttMs: number | null;
  availableOutgoingBitrateKbps: number | null;
  audioOnlyReason: AudioOnlyReason;
  updatedAt: number;
  isLocal: boolean;
  isHost: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  screenOn: boolean;
  reconnecting: boolean;
  reconnectingSince: number | null;
};

export type ConnectionQuality = 'good' | 'weak' | 'poor';
export type AudioOnlyReason = 'auto-poor' | 'manual-audio-only' | 'remote-request' | null;

type SignalPayload = {
  sdp?: RTCSessionDescriptionInit;
  ice?: RTCIceCandidateInit;
  control?: VideoControlPayload;
};

type VideoControlPayload = {
  type?: string;
  videoPaused?: boolean;
  reason?: 'auto-poor' | 'manual-audio-only';
};

type PeerMeta = {
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  restartAttempts: number;
  restartTimer: ReturnType<typeof setTimeout> | null;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
  lastRestartAt: number;
};

type QualityCounters = {
  poor: number;
  good: number;
};

type PreviousStats = {
  packetsLost: number;
  packetsReceived: number;
};

type InboundAudioStats = Omit<DiagnosticsInboundAudio, 'trackReadyState' | 'trackMuted'>;

type OutboundAudioLiveness = Pick<DiagnosticsPayload, 'outboundAudioLevel' | 'outboundAudioEnergy' | 'micSilent'> & {
  silentSamples: number;
};

type QualityMetrics = {
  quality: ConnectionQuality;
  packetLossPct: number | null;
  jitterMs: number | null;
  rttMs: number | null;
  availableOutgoingBitrateKbps: number | null;
  hasInboundMedia: boolean;
};

type SenderEncoding = RTCRtpEncodingParameters & {
  priority?: 'very-low' | 'low' | 'medium' | 'high';
  networkPriority?: 'very-low' | 'low' | 'medium' | 'high';
};

const ICE_RESTART_DEBOUNCE_MS = 1200;
const ICE_RESTART_COOLDOWN_MS = 3000;
const MAX_ICE_RESTART_ATTEMPTS = 3;
const FORCE_RELAY_STORAGE_KEY = 'meet-poc.forceRelay';
const QUALITY_POLL_MS = 2500;
const AUTO_DEGRADE_POOR_SAMPLES = 3;
const AUTO_RESTORE_GOOD_SAMPLES = 5;
const VIDEO_MAX_BITRATE_BPS = 700_000;
const MIC_SILENT_AUDIO_LEVEL_THRESHOLD = 0.005;
const MIC_SILENT_REQUIRED_SAMPLES = 3;
const MIC_SILENT_ENERGY_EPSILON = 0.000001;

@Injectable({ providedIn: 'root' })
export class WebrtcService {
  private readonly iceConfig = inject(IceConfigService);

  private localStream: MediaStream | null = null;
  private sendSignal: ((to: string, data: unknown) => void) | null = null;
  private localClientId: string | null = null;
  private readonly peerMeta = new Map<string, PeerMeta>();
  private readonly qualityCounters = new Map<string, QualityCounters>();
  private readonly previousStats = new Map<string, PreviousStats>();
  private readonly previousInboundAudioPackets = new Map<string, number>();
  private readonly inboundAudioStats = new Map<string, InboundAudioStats>();
  private outboundAudioLiveness: OutboundAudioLiveness = emptyOutboundAudioLiveness();
  private readonly autoPausedReceivers = new Set<string>();
  private readonly remotePauseRequests = new Set<string>();
  private readonly outboundVideoPaused = new Map<string, boolean>();
  private readonly videoSenders = new Map<string, RTCRtpSender>();
  private readonly fallbackVideoTracks = new Map<string, MediaStreamTrack | null>();
  private qualityTimer: ReturnType<typeof setInterval> | null = null;
  readonly forceRelay = signal(readForceRelay());
  readonly lastPeerConnectionPolicy = signal<RTCIceTransportPolicy | 'all'>('all');
  readonly lastPeerConnectionConfig = signal<RTCConfiguration | null>(null);
  readonly manualAudioOnly = signal(false);

  readonly peers = signal<Map<string, PeerState>>(new Map());
  readonly peerList = computed(() => Array.from(this.peers().values()));
  readonly diagnostics = computed(() =>
    this.peerList()
      .filter((peer) => !peer.isLocal)
      .map((peer) => ({
        id: peer.id,
        participantId: peer.participantId,
        name: peer.name,
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        iceGatheringState: peer.iceGatheringState,
        signalingState: peer.signalingState,
        selectedCandidateType: peer.selectedCandidateType,
        quality: peer.quality,
        packetLossPct: peer.packetLossPct,
        jitterMs: peer.jitterMs,
        rttMs: peer.rttMs,
        availableOutgoingBitrateKbps: peer.availableOutgoingBitrateKbps,
        audioOnlyReason: peer.audioOnlyReason,
        reconnecting: peer.reconnecting,
        updatedAt: peer.updatedAt,
      })),
  );

  configure(localStream: MediaStream, sendSignal: (to: string, data: unknown) => void): void {
    this.localStream = localStream;
    this.sendSignal = sendSignal;
  }

  setLocalPeer(
    clientId: string,
    name: string,
    options: { participantId?: string; isHost: boolean; micEnabled: boolean; camEnabled: boolean; screenOn: boolean },
  ): void {
    this.localClientId = clientId;
    const participantId = options.participantId || clientId;
    this.mutatePeers((peers) => {
      peers.set(clientId, {
        id: clientId,
        participantId,
        name: `${name} (you)`,
        pc: null,
        stream: this.localStream,
        connectionState: 'local',
        iceConnectionState: 'local',
        iceGatheringState: 'local',
        signalingState: 'local',
        selectedCandidateType: null,
        quality: 'good',
        packetLossPct: null,
        jitterMs: null,
        rttMs: null,
        availableOutgoingBitrateKbps: null,
        audioOnlyReason: null,
        updatedAt: Date.now(),
        isLocal: true,
        isHost: options.isHost,
        micEnabled: options.micEnabled,
        camEnabled: options.camEnabled,
        screenOn: options.screenOn,
        reconnecting: false,
        reconnectingSince: null,
      });
      for (const [id, peer] of peers) {
        if (peer.isLocal && id !== clientId) peers.delete(id);
      }
    });
  }

  async addPeer(clientId: string, name: string, isInitiator: boolean, options: { participantId?: string; isHost?: boolean; stream?: MediaStream } = {}): Promise<void> {
    const participantId = options.participantId || clientId;
    if (!this.localStream || !this.sendSignal) return;
    if (this.peers().has(clientId)) {
      this.updatePeer(clientId, { name, participantId, isHost: !!options.isHost, reconnecting: false, reconnectingSince: null });
      return;
    }
    const blockedByLivePeer = this.removeStalePeersForParticipant(participantId, clientId);
    if (blockedByLivePeer) return;
    const iceServers = await this.iceConfig.getIceServers();
    const pc = new RTCPeerConnection(this.peerConnectionConfig(iceServers));
    const meta = this.createPeerMeta(clientId);
    this.peerMeta.set(clientId, meta);
    const peer: PeerState = {
      id: clientId,
      participantId,
      name,
      pc,
      stream: options.stream ?? new MediaStream(),
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState,
      signalingState: pc.signalingState,
      selectedCandidateType: null,
      quality: 'good',
      packetLossPct: null,
      jitterMs: null,
      rttMs: null,
      availableOutgoingBitrateKbps: null,
      audioOnlyReason: null,
      updatedAt: Date.now(),
      isLocal: false,
      isHost: !!options.isHost,
      micEnabled: true,
      camEnabled: true,
      screenOn: false,
      reconnecting: false,
      reconnectingSince: null,
    };
    this.mutatePeers((peers) => peers.set(clientId, peer));

    for (const track of this.localStream.getTracks()) {
      const sender = pc.addTrack(track, this.localStream);
      if (track.kind === 'video') this.videoSenders.set(clientId, sender);
    }
    await this.applySenderBandwidthPreferences(pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) this.sendSignal?.(clientId, { ice: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      const nextStream = peer.stream ?? new MediaStream();
      nextStream.addTrack(event.track);
      peer.stream = nextStream;
      this.touchPeer(clientId, { stream: nextStream });
    };
    pc.onconnectionstatechange = () => {
      this.touchPeer(clientId, { connectionState: pc.connectionState, reconnecting: false, reconnectingSince: null });
      console.log(`[webrtc] peer ${clientId} connectionState=${pc.connectionState} at ${new Date().toISOString()}`);
      this.updateRecoveryState(clientId, pc);
      void this.logSelectedCandidateType(clientId, pc);
      this.maybeScheduleIceRestart(clientId, pc);
    };
    pc.oniceconnectionstatechange = () => {
      this.touchPeer(clientId, { iceConnectionState: pc.iceConnectionState, reconnecting: false, reconnectingSince: null });
      console.log(`[webrtc] peer ${clientId} iceConnectionState=${pc.iceConnectionState} at ${new Date().toISOString()}`);
      this.updateRecoveryState(clientId, pc);
      void this.logSelectedCandidateType(clientId, pc);
      this.maybeScheduleIceRestart(clientId, pc);
    };
    pc.onicegatheringstatechange = () => {
      this.touchPeer(clientId, { iceGatheringState: pc.iceGatheringState });
      console.log(`[webrtc] peer ${clientId} iceGatheringState=${pc.iceGatheringState} at ${new Date().toISOString()}`);
    };
    pc.onsignalingstatechange = () => {
      this.touchPeer(clientId, { signalingState: pc.signalingState });
      console.log(`[webrtc] peer ${clientId} signalingState=${pc.signalingState} at ${new Date().toISOString()}`);
    };

    if (isInitiator) {
      await this.sendOffer(clientId, pc, meta, false);
    }
    this.startQualityPolling();
  }

  async resumePeer(oldClientId: string, clientId: string, name: string, isInitiator: boolean, options: { participantId?: string; isHost?: boolean } = {}): Promise<void> {
    const participantId = options.participantId || this.peers().get(oldClientId)?.participantId || clientId;
    if (oldClientId === clientId) {
      this.updatePeer(clientId, { name, participantId, isHost: !!options.isHost, reconnecting: false, reconnectingSince: null });
      return;
    }
    const oldPeer = this.peers().get(oldClientId);
    const preservedStream = oldPeer?.stream ?? new MediaStream();
    this.removePeerResources(oldClientId, false);
    this.mutatePeers((peers) => peers.delete(oldClientId));
    this.removeStalePeersForParticipant(participantId, clientId, oldClientId);
    await this.addPeer(clientId, name, isInitiator, { ...options, participantId, stream: preservedStream });
  }

  markPeerReconnecting(clientId: string): void {
    this.touchPeer(clientId, {
      connectionState: 'disconnected',
      iceConnectionState: 'disconnected',
      quality: 'weak',
      reconnecting: true,
      reconnectingSince: Date.now(),
    });
  }

  debugMarkPeerRecoveredForTest(clientId: string): void {
    const meta = this.peerMeta.get(clientId);
    if (meta?.recoveryTimer) clearTimeout(meta.recoveryTimer);
    if (meta) meta.recoveryTimer = null;
    this.touchPeer(clientId, {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      quality: 'good',
      reconnecting: false,
      reconnectingSince: null,
    });
  }

  async setForceRelay(enabled: boolean): Promise<void> {
    if (this.forceRelay() === enabled) return;
    this.forceRelay.set(enabled);
    storeForceRelay(enabled);
    await this.recreateRemotePeerConnections();
  }

  async recreateRemotePeerConnections(): Promise<void> {
    const remotes = this.peerList()
      .filter((peer) => !peer.isLocal)
      .map((peer) => ({
        id: peer.id,
        participantId: peer.participantId,
        name: peer.name,
        isHost: peer.isHost,
        micEnabled: peer.micEnabled,
        camEnabled: peer.camEnabled,
        screenOn: peer.screenOn,
      }));
    for (const peer of remotes) this.removePeer(peer.id);
    for (const peer of remotes) {
      await this.addPeer(peer.id, peer.name, true, { participantId: peer.participantId, isHost: peer.isHost });
      this.updatePeer(peer.id, { micEnabled: peer.micEnabled, camEnabled: peer.camEnabled, screenOn: peer.screenOn });
    }
  }

  async setManualAudioOnly(enabled: boolean): Promise<void> {
    if (this.manualAudioOnly() === enabled) return;
    this.manualAudioOnly.set(enabled);
    await this.applyAllVideoPolicies();
    for (const peer of this.peerList()) {
      if (peer.isLocal) continue;
      const stillPaused = enabled || this.autoPausedReceivers.has(peer.id);
      this.sendReceiverVideoPolicy(peer.id, stillPaused, enabled ? 'manual-audio-only' : 'auto-poor');
    }
  }

  async sampleQualityNowForTest(quality?: ConnectionQuality): Promise<void> {
    if (!quality) {
      await this.sampleAllPeerQuality();
      return;
    }
    await Promise.all(
      this.peerList()
        .filter((peer) => !peer.isLocal && peer.pc)
        .map((peer) =>
          this.handlePeerQualityMetrics(peer.id, {
            quality,
            packetLossPct: quality === 'poor' ? 20 : 0,
            jitterMs: quality === 'poor' ? 120 : 5,
            rttMs: quality === 'poor' ? 800 : 50,
            availableOutgoingBitrateKbps: quality === 'poor' ? 140 : 1600,
            hasInboundMedia: true,
          }),
        ),
    );
  }

  debugSenderSnapshot(): {
    id: string;
    videoPaused: boolean;
    audioActive: boolean;
    videoActive: boolean;
    audioPriority: unknown;
    audioNetworkPriority: unknown;
    videoPriority: unknown;
    videoNetworkPriority: unknown;
    videoMaxBitrate: number | null;
  }[] {
    return this.peerList()
      .filter((peer) => !peer.isLocal && peer.pc)
      .map((peer) => {
        const senders = peer.pc?.getSenders() ?? [];
        const audioSender = senders.find((sender) => sender.track?.kind === 'audio');
        const videoSender = senders.find((sender) => sender.track?.kind === 'video') ?? this.videoSenders.get(peer.id);
        const audioEncoding = audioSender?.getParameters().encodings?.[0] as SenderEncoding | undefined;
        const videoEncoding = videoSender?.getParameters().encodings?.[0] as SenderEncoding | undefined;
        return {
          id: peer.id,
          videoPaused: this.shouldPauseOutboundVideo(peer.id),
          audioActive: !!audioSender?.track && audioSender.track.readyState === 'live',
          videoActive: !!videoSender?.track && !this.shouldPauseOutboundVideo(peer.id),
          audioPriority: audioEncoding?.priority ?? null,
          audioNetworkPriority: audioEncoding?.networkPriority ?? null,
          videoPriority: videoEncoding?.priority ?? null,
          videoNetworkPriority: videoEncoding?.networkPriority ?? null,
          videoMaxBitrate: typeof videoEncoding?.maxBitrate === 'number' ? videoEncoding.maxBitrate : null,
        };
      });
  }

  diagnosticSnapshot(): Pick<DiagnosticsPayload, 'outboundAudioLevel' | 'outboundAudioEnergy' | 'micSilent' | 'peers'> {
    const outboundAudio = this.currentOutboundAudioLiveness();
    return {
      outboundAudioLevel: outboundAudio.outboundAudioLevel,
      outboundAudioEnergy: outboundAudio.outboundAudioEnergy,
      micSilent: outboundAudio.micSilent,
      peers: this.peerList().map((peer) => {
        const senders = peer.pc?.getSenders() ?? [];
        const receivers = peer.pc?.getReceivers() ?? [];
        const audioSender = senders.find((sender) => sender.track?.kind === 'audio');
        const videoSender = senders.find((sender) => sender.track?.kind === 'video') ?? this.videoSenders.get(peer.id) ?? null;
        const audioReceiver = receivers.find((receiver) => receiver.track?.kind === 'audio');
        const fallbackAudio = this.localStream?.getAudioTracks()[0] ?? peer.stream?.getAudioTracks()[0] ?? null;
        const fallbackVideo = this.localStream?.getVideoTracks()[0] ?? peer.stream?.getVideoTracks()[0] ?? null;
        return {
          id: peer.id,
          participantId: peer.participantId,
          name: peer.name,
          isLocal: peer.isLocal,
          isHost: peer.isHost,
          connectionState: peer.connectionState,
          iceConnectionState: peer.iceConnectionState,
          iceGatheringState: peer.iceGatheringState,
          signalingState: peer.signalingState,
          selectedCandidateType: peer.selectedCandidateType,
          relayUsed: peer.selectedCandidateType === 'relay' || this.forceRelay(),
          quality: peer.quality,
          packetLossPct: peer.packetLossPct,
          jitterMs: peer.jitterMs,
          rttMs: peer.rttMs,
          availableOutgoingBitrateKbps: peer.availableOutgoingBitrateKbps,
          audioOnlyReason: peer.audioOnlyReason,
          micEnabled: peer.micEnabled,
          camEnabled: peer.camEnabled,
          screenOn: peer.screenOn,
          outboundAudio: trackInfo(audioSender?.track ?? null, fallbackAudio, 'audio'),
          inboundAudio: inboundAudioInfo(this.inboundAudioStats.get(peer.id), audioReceiver?.track ?? null),
          outboundVideo: trackInfo(videoSender?.track ?? null, fallbackVideo, 'video'),
          reconnecting: peer.reconnecting,
          updatedAt: peer.updatedAt,
        };
      }),
    };
  }

  async handleSignal(from: string, data: unknown): Promise<void> {
    const payload = (data && typeof data === 'object' ? data : {}) as SignalPayload;
    if (payload.control) {
      await this.handleControlSignal(from, payload.control);
      return;
    }
    const peer = this.peers().get(from);
    const pc = peer?.pc;
    if (!pc) return;
    const meta = this.peerMeta.get(from) ?? this.createPeerMeta(from);
    this.peerMeta.set(from, meta);
    if (payload.sdp) {
      const offerCollision = payload.sdp.type === 'offer' && (meta.makingOffer || pc.signalingState !== 'stable');
      meta.ignoreOffer = !meta.polite && offerCollision;
      if (meta.ignoreOffer) {
        console.warn(`[webrtc] ignored colliding offer from ${from}`);
        return;
      }
      meta.ignoreOffer = false;
      await pc.setRemoteDescription(payload.sdp);
      if (payload.sdp.type === 'offer') await this.sendAnswer(from, pc);
    } else if (payload.ice) {
      try {
        await pc.addIceCandidate(payload.ice);
      } catch (err) {
        if (meta.ignoreOffer) return;
        console.warn('addIceCandidate failed', err);
      }
    }
  }

  async replaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    await this.replaceLocalSenderTrack('video', track);
  }

  async replaceLocalSenderTrack(kind: 'audio' | 'video', track: MediaStreamTrack | null): Promise<void> {
    const operations: Promise<void>[] = [];
    for (const peer of this.peers().values()) {
      const pc = peer.pc;
      if (!pc) continue;
      const sender =
        pc.getSenders().find((candidate) => candidate.track?.kind === kind) ??
        (kind === 'video' ? this.videoSenders.get(peer.id) ?? null : null);
      if (sender) {
        if (kind === 'video') this.videoSenders.set(peer.id, sender);
        operations.push(sender.replaceTrack(track).then(() => this.applySenderPreference(sender, kind)));
      } else if (track && this.localStream) {
        const added = pc.addTrack(track, this.localStream);
        if (kind === 'video') this.videoSenders.set(peer.id, added);
        operations.push(this.applySenderPreference(added, kind));
      }
      operations.push(this.applySenderBandwidthPreferences(pc));
    }
    await Promise.all(operations);
    await Promise.all(this.peerList().filter((peer) => !peer.isLocal && peer.pc).map((peer) => this.applySenderBandwidthPreferences(peer.pc!)));
    const localPeer = this.peerList().find((peer) => peer.isLocal);
    if (localPeer) this.touchPeer(localPeer.id, { stream: this.localStream });
  }

  updatePeer(clientId: string, patch: Partial<PeerState>): void {
    this.touchPeer(clientId, patch);
  }

  removePeer(clientId: string): void {
    this.removePeerResources(clientId, true);
    this.mutatePeers((peers) => peers.delete(clientId));
    if (!this.peerList().some((peerState) => !peerState.isLocal)) this.stopQualityPolling();
  }

  resetRemotePeers(): void {
    const remoteIds = this.peerList()
      .filter((peer) => !peer.isLocal)
      .map((peer) => peer.id);
    for (const id of remoteIds) this.removePeer(id);
  }

  stopLocalSenderTracks(): void {
    const stopped = new Set<MediaStreamTrack>();
    for (const peer of this.peers().values()) {
      const pc = peer.pc;
      if (!pc) continue;
      for (const sender of pc.getSenders()) {
        const track = sender.track;
        if (track && !stopped.has(track)) {
          track.stop();
          stopped.add(track);
        }
      }
    }
  }

  reset(): void {
    this.stopLocalSenderTracks();
    for (const peer of this.peers().values()) {
      peer.pc?.close();
      if (!peer.isLocal) peer.stream?.getTracks().forEach((track) => track.stop());
    }
    this.peers.set(new Map());
    this.localStream = null;
    this.sendSignal = null;
    this.localClientId = null;
    for (const meta of this.peerMeta.values()) {
      if (meta.restartTimer) clearTimeout(meta.restartTimer);
      if (meta.recoveryTimer) clearTimeout(meta.recoveryTimer);
    }
    this.peerMeta.clear();
    this.qualityCounters.clear();
    this.previousStats.clear();
    this.previousInboundAudioPackets.clear();
    this.inboundAudioStats.clear();
    this.outboundAudioLiveness = emptyOutboundAudioLiveness();
    this.autoPausedReceivers.clear();
    this.remotePauseRequests.clear();
    this.outboundVideoPaused.clear();
    this.videoSenders.clear();
    this.fallbackVideoTracks.clear();
    this.manualAudioOnly.set(false);
    this.stopQualityPolling();
  }

  private touchPeer(clientId: string, patch: Partial<PeerState>): void {
    this.mutatePeers((peers) => {
      const current = peers.get(clientId);
      if (current) peers.set(clientId, { ...current, ...patch, updatedAt: Date.now() });
    });
  }

  private mutatePeers(change: (peers: Map<string, PeerState>) => void): void {
    const next = new Map(this.peers());
    change(next);
    this.peers.set(next);
  }

  private removeStalePeersForParticipant(participantId: string, keepClientId: string, explicitOldClientId?: string): boolean {
    let livePeerBlocks = false;
    const removeIds: string[] = [];
    for (const [id, peer] of this.peers()) {
      if (id === keepClientId || peer.isLocal || peer.participantId !== participantId) continue;
      if (id === explicitOldClientId || this.isStalePeer(peer)) {
        removeIds.push(id);
      } else {
        livePeerBlocks = true;
      }
    }
    for (const id of removeIds) this.removePeer(id);
    return livePeerBlocks;
  }

  private isStalePeer(peer: PeerState): boolean {
    return (
      peer.reconnecting ||
      peer.connectionState === 'failed' ||
      peer.connectionState === 'disconnected' ||
      peer.connectionState === 'closed' ||
      peer.iceConnectionState === 'failed' ||
      peer.iceConnectionState === 'disconnected' ||
      peer.iceConnectionState === 'closed' ||
      peer.signalingState === 'closed'
    );
  }

  private removePeerResources(clientId: string, stopStreamTracks: boolean): void {
    const peer = this.peers().get(clientId);
    const meta = this.peerMeta.get(clientId);
    if (meta?.restartTimer) clearTimeout(meta.restartTimer);
    if (meta?.recoveryTimer) clearTimeout(meta.recoveryTimer);
    this.peerMeta.delete(clientId);
    this.qualityCounters.delete(clientId);
    this.previousStats.delete(clientId);
    this.previousInboundAudioPackets.delete(clientId);
    this.inboundAudioStats.delete(clientId);
    this.autoPausedReceivers.delete(clientId);
    this.remotePauseRequests.delete(clientId);
    this.outboundVideoPaused.delete(clientId);
    this.videoSenders.delete(clientId);
    this.fallbackVideoTracks.delete(clientId);
    peer?.pc?.close();
    if (stopStreamTracks) peer?.stream?.getTracks().forEach((track) => track.stop());
  }

  private createPeerMeta(clientId: string): PeerMeta {
    return {
      polite: this.localClientId ? this.localClientId < clientId : false,
      makingOffer: false,
      ignoreOffer: false,
      restartAttempts: 0,
      restartTimer: null,
      recoveryTimer: null,
      lastRestartAt: 0,
    };
  }

  private updateRecoveryState(clientId: string, pc: RTCPeerConnection): void {
    const meta = this.peerMeta.get(clientId);
    if (!meta) return;
    const disconnected =
      pc.connectionState === 'disconnected' ||
      pc.iceConnectionState === 'disconnected' ||
      pc.connectionState === 'failed' ||
      pc.iceConnectionState === 'failed';
    if (!disconnected) {
      if (meta.recoveryTimer) clearTimeout(meta.recoveryTimer);
      meta.recoveryTimer = null;
      if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        meta.restartAttempts = 0;
      }
      return;
    }
    this.touchPeer(clientId, { quality: 'weak' });
    if (meta.recoveryTimer) return;
    meta.recoveryTimer = setTimeout(() => {
      meta.recoveryTimer = null;
      const peer = this.peers().get(clientId);
      const current = peer?.pc;
      if (!current) return;
      const stillDisconnected =
        current.connectionState === 'disconnected' ||
        current.iceConnectionState === 'disconnected' ||
        current.connectionState === 'failed' ||
        current.iceConnectionState === 'failed';
      if (stillDisconnected) this.touchPeer(clientId, { quality: 'poor' });
    }, 20_000);
  }

  private async sendOffer(clientId: string, pc: RTCPeerConnection, meta: PeerMeta, iceRestart: boolean): Promise<void> {
    try {
      meta.makingOffer = true;
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      await pc.setLocalDescription(offer);
      this.sendSignal?.(clientId, { sdp: pc.localDescription?.toJSON() });
    } finally {
      meta.makingOffer = false;
    }
  }

  private async sendAnswer(clientId: string, pc: RTCPeerConnection): Promise<void> {
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.sendSignal?.(clientId, { sdp: pc.localDescription?.toJSON() });
  }

  private maybeScheduleIceRestart(clientId: string, pc: RTCPeerConnection): void {
    if (pc.connectionState !== 'failed' && pc.connectionState !== 'disconnected' && pc.iceConnectionState !== 'failed' && pc.iceConnectionState !== 'disconnected') return;
    const meta = this.peerMeta.get(clientId);
    if (!meta || meta.restartTimer || meta.restartAttempts >= MAX_ICE_RESTART_ATTEMPTS || pc.signalingState === 'closed') return;

    meta.restartTimer = setTimeout(() => {
      meta.restartTimer = null;
      void this.restartIce(clientId, pc, meta);
    }, ICE_RESTART_DEBOUNCE_MS);
  }

  private async restartIce(clientId: string, pc: RTCPeerConnection, meta: PeerMeta): Promise<void> {
    const now = Date.now();
    if (now - meta.lastRestartAt < ICE_RESTART_COOLDOWN_MS || pc.signalingState !== 'stable') {
      this.maybeScheduleIceRestart(clientId, pc);
      return;
    }
    meta.restartAttempts += 1;
    meta.lastRestartAt = now;
    console.warn(`[webrtc] restarting ICE for peer ${clientId}; attempt=${meta.restartAttempts}/${MAX_ICE_RESTART_ATTEMPTS}`);
    pc.restartIce();
    await this.sendOffer(clientId, pc, meta, true);
  }

  private async logSelectedCandidateType(clientId: string, pc: RTCPeerConnection): Promise<void> {
    try {
      const candidateType = await selectedCandidateType(pc);
      if (candidateType) {
        this.touchPeer(clientId, { selectedCandidateType: candidateType });
        console.log(`[webrtc] peer ${clientId} selectedCandidateType=${candidateType}`);
      }
    } catch (err) {
      console.debug(`[webrtc] selected candidate lookup failed for ${clientId}`, err);
    }
  }

  private async handleControlSignal(from: string, control: VideoControlPayload): Promise<void> {
    if (control.type !== 'receiver-video-policy') return;
    if (control.videoPaused) this.remotePauseRequests.add(from);
    else this.remotePauseRequests.delete(from);
    await this.applyVideoPolicy(from);
    this.updateAudioOnlyReason(from);
  }

  private startQualityPolling(): void {
    if (this.qualityTimer) return;
    this.qualityTimer = setInterval(() => {
      void this.sampleAllPeerQuality();
    }, QUALITY_POLL_MS);
  }

  private stopQualityPolling(): void {
    if (this.qualityTimer) clearInterval(this.qualityTimer);
    this.qualityTimer = null;
  }

  private async sampleAllPeerQuality(): Promise<void> {
    const peers = this.peerList().filter((peer) => !peer.isLocal && peer.pc);
    await Promise.all(peers.map((peer, index) => this.samplePeerQuality(peer.id, peer.pc!, index === 0)));
  }

  private async samplePeerQuality(clientId: string, pc: RTCPeerConnection, sampleOutboundAudio = false): Promise<void> {
    if (pc.signalingState === 'closed') return;
    try {
      const metrics = await this.readQualityMetrics(clientId, pc, sampleOutboundAudio);
      await this.handlePeerQualityMetrics(clientId, metrics);
    } catch (err) {
      console.debug(`[webrtc] quality sample failed for ${clientId}`, err);
    }
  }

  private async handlePeerQualityMetrics(clientId: string, metrics: QualityMetrics): Promise<void> {
    const counters = this.qualityCounters.get(clientId) ?? { poor: 0, good: 0 };
    if (metrics.quality === 'poor') {
      counters.poor += 1;
      counters.good = 0;
    } else if (metrics.quality === 'good') {
      counters.good += 1;
      counters.poor = 0;
    } else {
      counters.poor = 0;
      counters.good = 0;
    }
    this.qualityCounters.set(clientId, counters);
    this.touchPeer(clientId, {
      quality: metrics.quality,
      packetLossPct: metrics.packetLossPct,
      jitterMs: metrics.jitterMs,
      rttMs: metrics.rttMs,
      availableOutgoingBitrateKbps: metrics.availableOutgoingBitrateKbps,
    });
    if (metrics.quality === 'poor' && counters.poor >= AUTO_DEGRADE_POOR_SAMPLES && !this.autoPausedReceivers.has(clientId)) {
      this.autoPausedReceivers.add(clientId);
      await this.applyVideoPolicy(clientId);
      this.sendReceiverVideoPolicy(clientId, true, 'auto-poor');
      this.updateAudioOnlyReason(clientId);
    }
    if (metrics.quality === 'good' && counters.good >= AUTO_RESTORE_GOOD_SAMPLES && this.autoPausedReceivers.has(clientId)) {
      this.autoPausedReceivers.delete(clientId);
      await this.applyVideoPolicy(clientId);
      if (!this.manualAudioOnly()) this.sendReceiverVideoPolicy(clientId, false, 'auto-poor');
      this.updateAudioOnlyReason(clientId);
    }
  }

  private async readQualityMetrics(clientId: string, pc: RTCPeerConnection, sampleOutboundAudio = false): Promise<QualityMetrics> {
    const stats = await pc.getStats();
    let packetsLost: number | null = null;
    let packetsReceived: number | null = null;
    let jitterMs: number | null = null;
    let rttMs: number | null = null;
    let availableOutgoingBitrateKbps: number | null = null;
    let hasInboundMedia = false;
    let inboundPacketsReceivedTotal = 0;
    let inboundAudioPacketsReceived: number | null = null;
    let inboundAudioPacketsLost: number | null = null;
    let inboundAudioBytesReceived: number | null = null;
    let inboundAudioLevel: number | null = null;
    let outboundAudioLevel: number | null = null;
    let outboundAudioEnergy: number | null = null;

    for (const rawReport of stats.values()) {
      const report = rawReport as RTCStats & Record<string, unknown>;
      if (report.type === 'inbound-rtp' && !report['isRemote']) {
        hasInboundMedia = true;
        packetsLost = (packetsLost ?? 0) + numberOrZero(report['packetsLost']);
        packetsReceived = (packetsReceived ?? 0) + numberOrZero(report['packetsReceived']);
        inboundPacketsReceivedTotal += numberOrZero(report['packetsReceived']);
        if (typeof report['jitter'] === 'number') jitterMs = Math.max(jitterMs ?? 0, report['jitter'] * 1000);
        if (report['kind'] === 'audio') {
          inboundAudioPacketsReceived = (inboundAudioPacketsReceived ?? 0) + numberOrZero(report['packetsReceived']);
          inboundAudioPacketsLost = (inboundAudioPacketsLost ?? 0) + numberOrZero(report['packetsLost']);
          inboundAudioBytesReceived = (inboundAudioBytesReceived ?? 0) + numberOrZero(report['bytesReceived']);
          if (typeof report['audioLevel'] === 'number') inboundAudioLevel = Math.max(inboundAudioLevel ?? 0, report['audioLevel']);
        }
      }
      if (report.type === 'remote-inbound-rtp' && typeof report['roundTripTime'] === 'number') {
        rttMs = Math.max(rttMs ?? 0, report['roundTripTime'] * 1000);
      }
      if (report.type === 'candidate-pair' && (report['selected'] || report['state'] === 'succeeded')) {
        if (typeof report['currentRoundTripTime'] === 'number') rttMs = Math.max(rttMs ?? 0, report['currentRoundTripTime'] * 1000);
        if (typeof report['availableOutgoingBitrate'] === 'number') {
          availableOutgoingBitrateKbps = Math.round(report['availableOutgoingBitrate'] / 1000);
        }
      }
      if (report.type === 'transport' && report['selectedCandidatePairId']) {
        const pair = stats.get(String(report['selectedCandidatePairId'])) as (RTCStats & Record<string, unknown>) | undefined;
        if (typeof pair?.['currentRoundTripTime'] === 'number') rttMs = Math.max(rttMs ?? 0, pair['currentRoundTripTime'] * 1000);
        if (typeof pair?.['availableOutgoingBitrate'] === 'number') availableOutgoingBitrateKbps = Math.round(pair['availableOutgoingBitrate'] / 1000);
      }
      if (sampleOutboundAudio && report.type === 'media-source' && report['kind'] === 'audio') {
        if (typeof report['audioLevel'] === 'number') outboundAudioLevel = Math.max(outboundAudioLevel ?? 0, report['audioLevel']);
        if (typeof report['totalAudioEnergy'] === 'number') outboundAudioEnergy = Math.max(outboundAudioEnergy ?? 0, report['totalAudioEnergy']);
      }
    }

    if (sampleOutboundAudio) this.updateOutboundAudioLiveness(outboundAudioLevel, outboundAudioEnergy);

    const previous = this.previousStats.get(clientId);
    const currentLost = packetsLost ?? 0;
    const currentReceived = packetsReceived ?? 0;
    let packetLossPct: number | null = null;
    if (packetsLost != null && packetsReceived != null) {
      const lostDelta = Math.max(0, currentLost - (previous?.packetsLost ?? 0));
      const receivedDelta = Math.max(0, currentReceived - (previous?.packetsReceived ?? 0));
      const denominator = lostDelta + receivedDelta;
      packetLossPct = denominator > 0 ? Math.round((lostDelta / denominator) * 1000) / 10 : 0;
      this.previousStats.set(clientId, { packetsLost: currentLost, packetsReceived: currentReceived });
    }

    this.inboundAudioStats.set(clientId, this.buildInboundAudioStats(clientId, inboundAudioPacketsReceived, inboundAudioPacketsLost, inboundAudioBytesReceived, inboundAudioLevel));

    const quality = classifyQuality({
      packetLossPct,
      jitterMs,
      rttMs,
      availableOutgoingBitrateKbps,
      hasInboundMedia,
      inboundPacketsReceivedTotal,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
    });
    return { quality, packetLossPct, jitterMs, rttMs, availableOutgoingBitrateKbps, hasInboundMedia };
  }

  private updateOutboundAudioLiveness(outboundAudioLevel: number | null, outboundAudioEnergy: number | null): void {
    const audioTrack = this.localStream?.getAudioTracks()[0] ?? null;
    if (!audioTrack || !audioTrack.enabled || audioTrack.readyState !== 'live') {
      this.outboundAudioLiveness = emptyOutboundAudioLiveness();
      return;
    }

    if (outboundAudioLevel == null || outboundAudioEnergy == null) {
      this.outboundAudioLiveness = {
        outboundAudioLevel,
        outboundAudioEnergy,
        micSilent: null,
        silentSamples: 0,
      };
      return;
    }

    const previousEnergy = this.outboundAudioLiveness.outboundAudioEnergy;
    const energyFlat = previousEnergy == null || outboundAudioEnergy <= previousEnergy + MIC_SILENT_ENERGY_EPSILON;
    const silentThisSample = outboundAudioLevel <= MIC_SILENT_AUDIO_LEVEL_THRESHOLD && energyFlat;
    const silentSamples = silentThisSample ? this.outboundAudioLiveness.silentSamples + 1 : 0;
    this.outboundAudioLiveness = {
      outboundAudioLevel,
      outboundAudioEnergy,
      micSilent: silentSamples >= MIC_SILENT_REQUIRED_SAMPLES,
      silentSamples,
    };
  }

  private currentOutboundAudioLiveness(): Pick<DiagnosticsPayload, 'outboundAudioLevel' | 'outboundAudioEnergy' | 'micSilent'> {
    const audioTrack = this.localStream?.getAudioTracks()[0] ?? null;
    if (!audioTrack || !audioTrack.enabled || audioTrack.readyState !== 'live') {
      return {
        outboundAudioLevel: null,
        outboundAudioEnergy: null,
        micSilent: null,
      };
    }
    return {
      outboundAudioLevel: this.outboundAudioLiveness.outboundAudioLevel,
      outboundAudioEnergy: this.outboundAudioLiveness.outboundAudioEnergy,
      micSilent: this.outboundAudioLiveness.micSilent,
    };
  }

  private buildInboundAudioStats(
    clientId: string,
    packetsReceived: number | null,
    packetsLost: number | null,
    bytesReceived: number | null,
    audioLevel: number | null,
  ): InboundAudioStats {
    if (packetsReceived == null) {
      this.previousInboundAudioPackets.delete(clientId);
      return {
        packetsReceived: null,
        packetsLost,
        bytesReceived,
        audioLevel,
        packetsReceivedDelta: null,
        packetsActivelyArriving: null,
      };
    }
    const previousPackets = this.previousInboundAudioPackets.get(clientId);
    const packetsReceivedDelta = previousPackets == null ? null : Math.max(0, packetsReceived - previousPackets);
    const packetsActivelyArriving = previousPackets == null ? packetsReceived > 0 : (packetsReceivedDelta ?? 0) > 0;
    this.previousInboundAudioPackets.set(clientId, packetsReceived);
    return {
      packetsReceived,
      packetsLost,
      bytesReceived,
      audioLevel,
      packetsReceivedDelta,
      packetsActivelyArriving,
    };
  }

  private sendReceiverVideoPolicy(clientId: string, videoPaused: boolean, reason: 'auto-poor' | 'manual-audio-only'): void {
    this.sendSignal?.(clientId, { control: { type: 'receiver-video-policy', videoPaused, reason } });
  }

  private async applyAllVideoPolicies(): Promise<void> {
    await Promise.all(this.peerList().filter((peer) => !peer.isLocal).map((peer) => this.applyVideoPolicy(peer.id)));
    this.mutatePeers((peers) => {
      for (const peer of peers.values()) {
        if (!peer.isLocal) peers.set(peer.id, { ...peer, audioOnlyReason: this.audioOnlyReasonFor(peer.id), updatedAt: Date.now() });
      }
    });
  }

  private async applyVideoPolicy(clientId: string): Promise<void> {
    const peer = this.peers().get(clientId);
    const pc = peer?.pc;
    if (!pc) return;
    await this.applySenderBandwidthPreferences(pc);
    const shouldPause = this.shouldPauseOutboundVideo(clientId);
    if (this.outboundVideoPaused.get(clientId) === shouldPause) return;
    const sender = pc.getSenders().find((candidate) => candidate.track?.kind === 'video') ?? this.videoSenders.get(clientId);
    if (!sender) return;
    try {
      await setVideoSenderActive(sender, !shouldPause);
    } catch {
      await this.replaceVideoSenderFallback(clientId, sender, shouldPause);
    }
    await this.applySenderBandwidthPreferences(pc);
    this.outboundVideoPaused.set(clientId, shouldPause);
  }

  private async replaceVideoSenderFallback(clientId: string, sender: RTCRtpSender, shouldPause: boolean): Promise<void> {
    if (shouldPause) {
      if (!this.fallbackVideoTracks.has(clientId)) this.fallbackVideoTracks.set(clientId, sender.track ?? null);
      await sender.replaceTrack(null);
      return;
    }
    const original = this.fallbackVideoTracks.get(clientId);
    const fallback = this.localStream?.getVideoTracks()[0] ?? null;
    await sender.replaceTrack(original?.readyState === 'live' ? original : fallback);
    this.fallbackVideoTracks.delete(clientId);
  }

  private async applySenderBandwidthPreferences(pc: RTCPeerConnection): Promise<void> {
    await Promise.all(
      pc.getSenders().map(async (sender) => {
        const kind = sender.track?.kind;
        if (kind !== 'audio' && kind !== 'video') return;
        await this.applySenderPreference(sender, kind);
      }),
    );
  }

  private async applySenderPreference(sender: RTCRtpSender, kind: 'audio' | 'video'): Promise<void> {
    try {
      await setSenderBandwidthPreference(sender, kind);
    } catch (err) {
      console.debug(`[webrtc] ${kind} sender bandwidth preference unavailable`, err);
    }
  }

  private shouldPauseOutboundVideo(clientId: string): boolean {
    return this.manualAudioOnly() || this.remotePauseRequests.has(clientId);
  }

  private updateAudioOnlyReason(clientId: string): void {
    this.touchPeer(clientId, { audioOnlyReason: this.audioOnlyReasonFor(clientId) });
  }

  private audioOnlyReasonFor(clientId: string): AudioOnlyReason {
    if (this.manualAudioOnly()) return 'manual-audio-only';
    if (this.autoPausedReceivers.has(clientId)) return 'auto-poor';
    if (this.remotePauseRequests.has(clientId)) return 'remote-request';
    return null;
  }

  private peerConnectionConfig(iceServers: RTCIceServer[]): RTCConfiguration {
    const config: RTCConfiguration = this.forceRelay() ? { iceServers, iceTransportPolicy: 'relay' } : { iceServers };
    this.lastPeerConnectionPolicy.set(config.iceTransportPolicy ?? 'all');
    this.lastPeerConnectionConfig.set(config);
    return config;
  }
}

async function setVideoSenderActive(sender: RTCRtpSender, active: boolean): Promise<void> {
  const params = sender.getParameters();
  if (!params.encodings?.length) throw new Error('sender encodings unavailable');
  params.encodings = params.encodings.map((encoding) => ({
    ...encoding,
    active,
    priority: 'low',
    networkPriority: 'low',
    maxBitrate: Math.min(typeof encoding.maxBitrate === 'number' ? encoding.maxBitrate : VIDEO_MAX_BITRATE_BPS, VIDEO_MAX_BITRATE_BPS),
  }));
  await sender.setParameters(params);
}

async function setSenderBandwidthPreference(sender: RTCRtpSender, kind: 'audio' | 'video'): Promise<void> {
  const params = sender.getParameters();
  const encodings = params.encodings?.length ? params.encodings : [{} as RTCRtpEncodingParameters];
  params.encodings = encodings.map((encoding) => {
    const next: SenderEncoding = { ...encoding };
    if (kind === 'audio') {
      next.priority = 'high';
      next.networkPriority = 'high';
      return next;
    }
    next.priority = 'low';
    next.networkPriority = 'low';
    next.maxBitrate = Math.min(typeof next.maxBitrate === 'number' ? next.maxBitrate : VIDEO_MAX_BITRATE_BPS, VIDEO_MAX_BITRATE_BPS);
    return next;
  });
  await sender.setParameters(params);
}

function classifyQuality(input: {
  packetLossPct: number | null;
  jitterMs: number | null;
  rttMs: number | null;
  availableOutgoingBitrateKbps: number | null;
  hasInboundMedia: boolean;
  inboundPacketsReceivedTotal: number;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
}): ConnectionQuality {
  if (input.connectionState === 'failed' || input.connectionState === 'disconnected' || input.iceConnectionState === 'failed' || input.iceConnectionState === 'disconnected') {
    return 'poor';
  }
  if (input.hasInboundMedia && input.inboundPacketsReceivedTotal === 0) return 'poor';
  if (
    (input.packetLossPct != null && input.packetLossPct >= 12) ||
    (input.rttMs != null && input.rttMs >= 650) ||
    (input.jitterMs != null && input.jitterMs >= 80) ||
    (input.availableOutgoingBitrateKbps != null && input.availableOutgoingBitrateKbps < 250)
  ) {
    return 'poor';
  }
  if (
    (input.packetLossPct != null && input.packetLossPct >= 5) ||
    (input.rttMs != null && input.rttMs >= 350) ||
    (input.jitterMs != null && input.jitterMs >= 40) ||
    (input.availableOutgoingBitrateKbps != null && input.availableOutgoingBitrateKbps < 650)
  ) {
    return 'weak';
  }
  return 'good';
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function emptyOutboundAudioLiveness(): OutboundAudioLiveness {
  return {
    outboundAudioLevel: null,
    outboundAudioEnergy: null,
    micSilent: null,
    silentSamples: 0,
  };
}

function inboundAudioInfo(stats: InboundAudioStats | undefined, receiverTrack: MediaStreamTrack | null): DiagnosticsInboundAudio {
  return {
    packetsReceived: stats?.packetsReceived ?? null,
    packetsLost: stats?.packetsLost ?? null,
    bytesReceived: stats?.bytesReceived ?? null,
    audioLevel: stats?.audioLevel ?? null,
    packetsReceivedDelta: stats?.packetsReceivedDelta ?? null,
    packetsActivelyArriving: stats?.packetsActivelyArriving ?? null,
    trackReadyState: receiverTrack?.readyState ?? null,
    trackMuted: receiverTrack?.muted ?? null,
  };
}

function trackInfo(senderTrack: MediaStreamTrack | null, fallbackTrack: MediaStreamTrack | null, kind: 'audio' | 'video'): DiagnosticsTrackInfo {
  const track = senderTrack ?? fallbackTrack;
  if (!track) {
    return {
      id: null,
      kind,
      deviceId: null,
      label: null,
      enabled: null,
      muted: null,
      readyState: null,
      source: 'none',
    };
  }
  const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
  const debugTrack = track as MediaStreamTrack & { __diagDeviceId?: string; __diagiDeviceId?: string; __diagLabel?: string };
  return {
    id: track.id || null,
    kind,
    deviceId: debugTrack.__diagDeviceId || debugTrack.__diagiDeviceId || settings.deviceId || null,
    label: debugTrack.__diagLabel || track.label || null,
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState,
    source: senderTrack ? 'sender' : 'stream',
  };
}

async function selectedCandidateType(pc: RTCPeerConnection): Promise<string | null> {
  const stats = await pc.getStats();
  for (const report of stats.values()) {
    if (report.type !== 'transport' || !report.selectedCandidatePairId) continue;
    const pair = stats.get(report.selectedCandidatePairId);
    const candidateId = pair?.localCandidateId || pair?.remoteCandidateId;
    const candidate = candidateId ? stats.get(candidateId) : null;
    return candidate?.candidateType ?? null;
  }
  for (const report of stats.values()) {
    if (report.type !== 'candidate-pair' || !report.selected) continue;
    const candidateId = report.localCandidateId || report.remoteCandidateId;
    const candidate = candidateId ? stats.get(candidateId) : null;
    return candidate?.candidateType ?? null;
  }
  return null;
}

function readForceRelay(): boolean {
  try {
    return window.localStorage.getItem(FORCE_RELAY_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function storeForceRelay(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(FORCE_RELAY_STORAGE_KEY, '1');
    else window.localStorage.removeItem(FORCE_RELAY_STORAGE_KEY);
  } catch {
    // Best effort; relay diagnostics still work for this session.
  }
}
