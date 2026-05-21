import { Injectable, computed, inject, signal } from '@angular/core';
import { IceConfigService } from './ice-config.service';
import type {
  DiagnosticsCandidatePair,
  DiagnosticsInboundAudio,
  DiagnosticsInboundVideo,
  DiagnosticsIceRestartAudit,
  DiagnosticsNegotiationAudit,
  DiagnosticsPayload,
  DiagnosticsPeerSample,
  DiagnosticsRelayGathered,
  DiagnosticsTrackInfo,
  DiagnosticsTransition,
} from './meeting-sessions.service';

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
  isMobile: boolean;
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
  videoDegraded?: boolean;
  reason?: 'auto-poor' | 'manual-audio-only';
};

type PeerMeta = {
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  restartAttempts: number;
  restartTimer: ReturnType<typeof setTimeout> | null;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
  pcRecreateAttempts: number;
  pcRecreateTimer: ReturnType<typeof setTimeout> | null;
  lastPcRecreateAt: number;
  recreatingPc: boolean;
  healthyPcSamples: number;
  negotiationTimer: ReturnType<typeof setTimeout> | null;
  negotiationRecoveryAttempts: number;
  lastRestartAt: number;
  currentRestartStartedAt: number | null;
  mediaDeadReason: 'video-frozen' | 'no-inbound-media' | null;
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

type InboundVideoStats = Omit<DiagnosticsInboundVideo, 'trackReadyState' | 'trackMuted'>;

type PreviousInboundVideoStats = {
  framesDecoded: number;
  framesReceived: number;
  freezeCount: number;
  totalFreezesDuration: number;
};

type MediaHealthState = {
  videoFrozenSamples: number;
  noInboundMediaSamples: number;
  activeLabel: 'video-frozen' | 'no-inbound-media' | null;
};

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
  audioOnlyFloor: boolean;
  connected: boolean;
  inboundVideo: InboundVideoStats;
};

type SenderEncoding = RTCRtpEncodingParameters & {
  priority?: 'very-low' | 'low' | 'medium' | 'high';
  networkPriority?: 'very-low' | 'low' | 'medium' | 'high';
};

type PeerForensics = {
  candidatePair: DiagnosticsCandidatePair | null;
  candidatePairCount: number;
  selectedPairId: string | null;
  nominatedPairChanges: number;
  iceRelayGathered: DiagnosticsRelayGathered;
  iceRestart: DiagnosticsIceRestartAudit;
  negotiation: DiagnosticsNegotiationAudit;
  transitionTimeline: DiagnosticsTransition[];
  lastConnectionState: string | null;
  lastIceConnectionState: string | null;
  lastIceGatheringState: string | null;
  lastSignalingState: string | null;
};

const ICE_RESTART_DEBOUNCE_MS = 1500;
const ICE_RESTART_COOLDOWN_MS = 5000;
const MAX_ICE_RESTART_ATTEMPTS = 3;
const PC_RECREATE_DEBOUNCE_MS = 1500;
const PC_RECREATE_BACKOFF_MS = [10_000, 30_000];
const MAX_CONSECUTIVE_PC_RECREATE_ATTEMPTS = 2;
const NEGOTIATION_STUCK_MS = 8000;
const MAX_NEGOTIATION_RECOVERY_ATTEMPTS = 2;
const FORCE_RELAY_STORAGE_KEY = 'meet-poc.forceRelay';
const QUALITY_POLL_MS = 2500;
const AUTO_DEGRADE_POOR_SAMPLES = 3;
const AUTO_RESTORE_GOOD_SAMPLES = 5;
const MOBILE_PROTECTIVE_VIDEO_PARTICIPANTS = 4;
const VIDEO_MAX_BITRATE_BPS = 700_000;
const VIDEO_DEGRADED_MAX_BITRATE_BPS = 120_000;
const VIDEO_DEGRADED_SCALE = 4;
const VIDEO_DEGRADED_MAX_FRAMERATE = 8;
const VIDEO_NORMAL_SCALE = 1;
const VIDEO_NORMAL_MAX_FRAMERATE = 30;
const AUDIO_ONLY_FLOOR_LOSS_PCT = 35;
const AUDIO_ONLY_FLOOR_RTT_MS = 1500;
const AUDIO_ONLY_FLOOR_JITTER_MS = 250;
const AUDIO_ONLY_FLOOR_BITRATE_KBPS = 90;
const MIC_SILENT_AUDIO_LEVEL_THRESHOLD = 0.005;
const MIC_SILENT_REQUIRED_SAMPLES = 3;
const MIC_SILENT_ENERGY_EPSILON = 0.000001;
const MAX_FORENSIC_TRANSITIONS = 40;
const MEDIA_DEAD_REQUIRED_SAMPLES = 3;

@Injectable({ providedIn: 'root' })
export class WebrtcService {
  private readonly iceConfig = inject(IceConfigService);

  private localStream: MediaStream | null = null;
  private sendSignal: ((to: string, data: unknown) => void) | null = null;
  private localClientId: string | null = null;
  private localMobile = false;
  private readonly peerMeta = new Map<string, PeerMeta>();
  private readonly qualityCounters = new Map<string, QualityCounters>();
  private readonly previousStats = new Map<string, PreviousStats>();
  private readonly previousInboundAudioPackets = new Map<string, number>();
  private readonly previousInboundVideoStats = new Map<string, PreviousInboundVideoStats>();
  private readonly inboundAudioStats = new Map<string, InboundAudioStats>();
  private readonly inboundVideoStats = new Map<string, InboundVideoStats>();
  private readonly mediaHealthState = new Map<string, MediaHealthState>();
  private readonly peerForensics = new Map<string, PeerForensics>();
  private outboundAudioLiveness: OutboundAudioLiveness = emptyOutboundAudioLiveness();
  private readonly autoPausedReceivers = new Set<string>();
  private readonly autoDegradedReceivers = new Set<string>();
  private readonly mobileAutoPausedReceivers = new Set<string>();
  private readonly remotePauseRequests = new Set<string>();
  private readonly remoteDegradeRequests = new Set<string>();
  private readonly lastActiveSpeakerAt = new Map<string, number>();
  private readonly outboundVideoPaused = new Map<string, boolean>();
  private readonly outboundVideoDegraded = new Map<string, boolean>();
  private readonly videoSenders = new Map<string, RTCRtpSender>();
  private readonly fallbackVideoTracks = new Map<string, MediaStreamTrack | null>();
  private shareCameraSuppressed = false;
  private localScreenShareActive = false;
  private qualityTimer: ReturnType<typeof setInterval> | null = null;
  private activeSpeakerId: string | null = null;
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

  configure(localStream: MediaStream, sendSignal: (to: string, data: unknown) => void, options: { isMobile?: boolean } = {}): void {
    this.localStream = localStream;
    this.sendSignal = sendSignal;
    this.localMobile = !!options.isMobile;
    void this.applyAllVideoPolicies();
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
        isMobile: this.localMobile,
      });
      for (const [id, peer] of peers) {
        if (peer.isLocal && id !== clientId) peers.delete(id);
      }
    });
  }

  async addPeer(clientId: string, name: string, isInitiator: boolean, options: { participantId?: string; isHost?: boolean; isMobile?: boolean; stream?: MediaStream } = {}): Promise<void> {
    const participantId = options.participantId || clientId;
    if (!this.localStream || !this.sendSignal) return;
    if (this.peers().has(clientId)) {
      this.updatePeer(clientId, { name, participantId, isHost: !!options.isHost, isMobile: !!options.isMobile, reconnecting: false, reconnectingSince: null });
      return;
    }
    const blockedByLivePeer = this.removeStalePeersForParticipant(participantId, clientId);
    if (blockedByLivePeer) return;
    const meta = this.createPeerMeta(clientId);
    this.peerMeta.set(clientId, meta);
    const peer: PeerState = {
      id: clientId,
      participantId,
      name,
      pc: null,
      stream: options.stream ?? new MediaStream(),
      connectionState: 'new',
      iceConnectionState: 'new',
      iceGatheringState: 'new',
      signalingState: 'stable',
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
      isMobile: !!options.isMobile,
    };
    this.mutatePeers((peers) => peers.set(clientId, peer));

    await this.createPeerConnectionForPeer(clientId, isInitiator, { resetForensics: true });
    await this.applyAllVideoPolicies();
  }

  async resumePeer(oldClientId: string, clientId: string, name: string, isInitiator: boolean, options: { participantId?: string; isHost?: boolean; isMobile?: boolean } = {}): Promise<void> {
    const participantId = options.participantId || this.peers().get(oldClientId)?.participantId || clientId;
    if (oldClientId === clientId) {
      this.cancelPeerConnectionRecreate(clientId);
      this.updatePeer(clientId, { name, participantId, isHost: !!options.isHost, isMobile: !!options.isMobile, reconnecting: false, reconnectingSince: null });
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
    this.cancelPeerConnectionRecreate(clientId);
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
    if (meta) {
      meta.recoveryTimer = null;
      meta.restartAttempts = 0;
      meta.pcRecreateAttempts = 0;
      meta.healthyPcSamples = 0;
    }
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
        isMobile: peer.isMobile,
      }));
    for (const peer of remotes) this.removePeer(peer.id);
    for (const peer of remotes) {
      await this.addPeer(peer.id, peer.name, true, { participantId: peer.participantId, isHost: peer.isHost, isMobile: peer.isMobile });
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
      const stillDegraded = !stillPaused && this.autoDegradedReceivers.has(peer.id);
      this.sendReceiverVideoPolicy(peer.id, stillPaused, enabled ? 'manual-audio-only' : 'auto-poor', stillDegraded);
    }
  }

  async setShareCameraPolicy(options: { suppressCamera: boolean; localScreenShareActive: boolean }): Promise<void> {
    if (this.shareCameraSuppressed === options.suppressCamera && this.localScreenShareActive === options.localScreenShareActive) return;
    this.shareCameraSuppressed = options.suppressCamera;
    this.localScreenShareActive = options.localScreenShareActive;
    await this.applyAllVideoPolicies();
  }

  async sampleQualityNowForTest(quality?: ConnectionQuality | 'critical'): Promise<void> {
    if (!quality) {
      await this.sampleAllPeerQuality();
      return;
    }
    const audioOnlyFloor = quality === 'critical';
    const normalizedQuality: ConnectionQuality = audioOnlyFloor ? 'poor' : quality;
    await Promise.all(
      this.peerList()
        .filter((peer) => !peer.isLocal && peer.pc)
        .map((peer) =>
          this.handlePeerQualityMetrics(peer.id, {
            quality: normalizedQuality,
            packetLossPct: audioOnlyFloor ? 40 : normalizedQuality === 'poor' ? 20 : normalizedQuality === 'weak' ? 8 : 0,
            jitterMs: audioOnlyFloor ? 260 : normalizedQuality === 'poor' ? 120 : normalizedQuality === 'weak' ? 50 : 5,
            rttMs: audioOnlyFloor ? 1600 : normalizedQuality === 'poor' ? 800 : normalizedQuality === 'weak' ? 400 : 50,
            availableOutgoingBitrateKbps: audioOnlyFloor ? 80 : normalizedQuality === 'poor' ? 140 : normalizedQuality === 'weak' ? 500 : 1600,
            hasInboundMedia: true,
            audioOnlyFloor,
            connected: true,
            inboundVideo: emptyInboundVideoStats(this.isInboundVideoExpected(peer.id)),
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
    videoScaleResolutionDownBy: number | null;
    videoMaxFramerate: number | null;
    videoDegraded: boolean;
    remoteIsMobile: boolean;
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
          videoScaleResolutionDownBy: typeof videoEncoding?.scaleResolutionDownBy === 'number' ? videoEncoding.scaleResolutionDownBy : null,
          videoMaxFramerate: typeof videoEncoding?.maxFramerate === 'number' ? videoEncoding.maxFramerate : null,
          videoDegraded: this.shouldDegradeOutboundVideo(peer.id),
          remoteIsMobile: peer.isMobile,
        };
    });
  }

  async debugForceTerminalRecoveryForTest(clientId?: string): Promise<void> {
    const peer = clientId ? this.peers().get(clientId) : this.peerList().find((candidate) => !candidate.isLocal && candidate.pc);
    if (!peer?.pc) return;
    const meta = this.peerMeta.get(peer.id) ?? this.createPeerMeta(peer.id);
    this.peerMeta.set(peer.id, meta);
    meta.restartAttempts = MAX_ICE_RESTART_ATTEMPTS;
    const forensics = this.ensureForensics(peer.id, peer.pc);
    forensics.iceRestart.attempts = MAX_ICE_RESTART_ATTEMPTS;
    forensics.iceRestart.terminalFailed = true;
    this.maybeSchedulePeerConnectionRecreate(peer.id, peer.pc);
  }

  async debugForceNegotiationDeadlockForTest(clientId?: string): Promise<void> {
    const peer = clientId ? this.peers().get(clientId) : this.peerList().find((candidate) => !candidate.isLocal && candidate.pc);
    if (!peer?.pc) return;
    const meta = this.peerMeta.get(peer.id) ?? this.createPeerMeta(peer.id);
    this.peerMeta.set(peer.id, meta);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this.recordNegotiationEvent(peer.id, 'offer-sent', peer.pc);
    await this.breakNegotiationDeadlock(peer.id, peer.pc, meta);
  }

  debugRecoverySnapshot(clientId?: string): {
    id: string;
    participantId: string;
    pcPresent: boolean;
    pcRecreateAttempts: number;
    restartAttempts: number;
    autoRecoveryOutcome: 'recovered' | 'failed' | null;
    rollbackCount: number;
    forceRelay: boolean;
  }[] {
    return this.peerList()
      .filter((peer) => !peer.isLocal && (!clientId || peer.id === clientId))
      .map((peer) => {
        const meta = this.peerMeta.get(peer.id);
        const forensics = this.peerForensics.get(peer.id) ?? createEmptyForensics();
        return {
          id: peer.id,
          participantId: peer.participantId,
          pcPresent: !!peer.pc,
          pcRecreateAttempts: meta?.pcRecreateAttempts ?? 0,
          restartAttempts: meta?.restartAttempts ?? 0,
          autoRecoveryOutcome: forensics.iceRestart.autoRecoveryOutcome,
          rollbackCount: forensics.negotiation.rollbackCount,
          forceRelay: this.forceRelay(),
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
        const videoReceiver = receivers.find((receiver) => receiver.track?.kind === 'video');
        const fallbackAudio = this.localStream?.getAudioTracks()[0] ?? peer.stream?.getAudioTracks()[0] ?? null;
        const fallbackVideo = this.localStream?.getVideoTracks()[0] ?? peer.stream?.getVideoTracks()[0] ?? null;
        const forensics = this.peerForensics.get(peer.id) ?? createEmptyForensics();
        const outboundAudio = trackInfo(audioSender?.track ?? null, fallbackAudio, 'audio');
        const inboundAudio = inboundAudioInfo(this.inboundAudioStats.get(peer.id), audioReceiver?.track ?? null);
        const outboundVideo = trackInfo(videoSender?.track ?? null, fallbackVideo, 'video');
        const inboundVideo = inboundVideoInfo(this.inboundVideoStats.get(peer.id), videoReceiver?.track ?? null);
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
          candidatePair: forensics.candidatePair,
          candidatePairCount: forensics.candidatePairCount,
          nominatedPairChanges: forensics.nominatedPairChanges,
          iceRelayGathered: { ...forensics.iceRelayGathered },
          iceRestart: { ...forensics.iceRestart },
          negotiation: { ...forensics.negotiation },
          transitionTimeline: forensics.transitionTimeline.slice(),
          relayUsed: peer.selectedCandidateType === 'relay' || forensics.iceRelayGathered.local || forensics.iceRelayGathered.remote || this.forceRelay(),
          quality: peer.quality,
          packetLossPct: peer.packetLossPct,
          jitterMs: peer.jitterMs,
          rttMs: peer.rttMs,
          availableOutgoingBitrateKbps: peer.availableOutgoingBitrateKbps,
          audioOnlyReason: peer.audioOnlyReason,
          micEnabled: peer.micEnabled,
          camEnabled: peer.camEnabled,
          screenOn: peer.screenOn,
          diagnosticLabels: diagnosticLabelsForPeer(peer, outboundAudio, inboundAudio, outboundVideo, inboundVideo),
          outboundAudio,
          inboundAudio,
          outboundVideo,
          inboundVideo,
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
      this.recordNegotiationEvent(from, payload.sdp.type === 'offer' ? 'offer-received' : 'answer-received', pc);
      const offerCollision = payload.sdp.type === 'offer' && (meta.makingOffer || pc.signalingState !== 'stable');
      meta.ignoreOffer = !meta.polite && offerCollision;
      if (meta.ignoreOffer) {
        const forensics = this.ensureForensics(from, pc);
        forensics.negotiation.glareIgnoredCount += 1;
        forensics.negotiation.ignoreOffer = true;
        this.pushTransition(from, {
          scope: 'negotiation',
          event: 'ignoreOffer',
          detail: `polite=${meta.polite} makingOffer=${meta.makingOffer} signaling=${pc.signalingState}`,
        });
        console.warn(`[webrtc] ignored colliding offer from ${from}`);
        return;
      }
      meta.ignoreOffer = false;
      this.ensureForensics(from, pc).negotiation.ignoreOffer = false;
      if (offerCollision && meta.polite) await this.rollbackLocalOffer(from, pc, meta, 'polite-offer-collision');
      await pc.setRemoteDescription(payload.sdp);
      if (pc.signalingState === 'stable') this.clearNegotiationWatchdog(meta, true);
      if (payload.sdp.type === 'offer') await this.sendAnswer(from, pc);
    } else if (payload.ice) {
      try {
        this.recordGatheredCandidate(from, payload.ice, 'remote');
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
        operations.push(sender.replaceTrack(track).then(() => this.applySenderPreference(sender, kind, this.shouldDegradeOutboundVideo(peer.id))));
      } else if (track && this.localStream) {
        const added = pc.addTrack(track, this.localStream);
        if (kind === 'video') this.videoSenders.set(peer.id, added);
        operations.push(this.applySenderPreference(added, kind, this.shouldDegradeOutboundVideo(peer.id)));
      }
      operations.push(this.applySenderBandwidthPreferences(pc, peer.id));
    }
    await Promise.all(operations);
    await Promise.all(this.peerList().filter((peer) => !peer.isLocal && peer.pc).map((peer) => this.applySenderBandwidthPreferences(peer.pc!, peer.id)));
    const localPeer = this.peerList().find((peer) => peer.isLocal);
    if (localPeer) this.touchPeer(localPeer.id, { stream: this.localStream });
  }

  updatePeer(clientId: string, patch: Partial<PeerState>): void {
    this.touchPeer(clientId, patch);
  }

  setActiveSpeakerPeer(clientId: string | null): void {
    this.activeSpeakerId = clientId;
    if (!clientId) return;
    this.lastActiveSpeakerAt.set(clientId, Date.now());
    if (this.mobileAutoPausedReceivers.has(clientId)) {
      this.mobileAutoPausedReceivers.delete(clientId);
      this.autoPausedReceivers.delete(clientId);
      if (!this.manualAudioOnly()) this.sendReceiverVideoPolicy(clientId, false, 'auto-poor', true);
      this.updateAudioOnlyReason(clientId);
    }
  }

  removePeer(clientId: string): void {
    this.removePeerResources(clientId, true);
    this.mutatePeers((peers) => peers.delete(clientId));
    if (!this.peerList().some((peerState) => !peerState.isLocal)) this.stopQualityPolling();
    void this.applyAllVideoPolicies();
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
    this.localMobile = false;
    for (const meta of this.peerMeta.values()) {
      if (meta.restartTimer) clearTimeout(meta.restartTimer);
      if (meta.recoveryTimer) clearTimeout(meta.recoveryTimer);
      if (meta.pcRecreateTimer) clearTimeout(meta.pcRecreateTimer);
      if (meta.negotiationTimer) clearTimeout(meta.negotiationTimer);
    }
    this.peerMeta.clear();
    this.qualityCounters.clear();
    this.previousStats.clear();
    this.previousInboundAudioPackets.clear();
    this.previousInboundVideoStats.clear();
    this.inboundAudioStats.clear();
    this.inboundVideoStats.clear();
    this.mediaHealthState.clear();
    this.peerForensics.clear();
    this.outboundAudioLiveness = emptyOutboundAudioLiveness();
    this.autoPausedReceivers.clear();
    this.autoDegradedReceivers.clear();
    this.mobileAutoPausedReceivers.clear();
    this.remotePauseRequests.clear();
    this.remoteDegradeRequests.clear();
    this.lastActiveSpeakerAt.clear();
    this.activeSpeakerId = null;
    this.outboundVideoPaused.clear();
    this.outboundVideoDegraded.clear();
    this.videoSenders.clear();
    this.fallbackVideoTracks.clear();
    this.shareCameraSuppressed = false;
    this.localScreenShareActive = false;
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

  private async createPeerConnectionForPeer(clientId: string, isInitiator: boolean, options: { resetForensics: boolean }): Promise<RTCPeerConnection | null> {
    if (!this.localStream || !this.sendSignal) return null;
    const peer = this.peers().get(clientId);
    if (!peer || peer.isLocal) return null;
    const meta = this.peerMeta.get(clientId) ?? this.createPeerMeta(clientId);
    this.peerMeta.set(clientId, meta);
    const iceServers = await this.iceConfig.getIceServers();
    const pc = new RTCPeerConnection(this.peerConnectionConfig(iceServers));
    if (options.resetForensics || !this.peerForensics.has(clientId)) this.peerForensics.set(clientId, createPeerForensics(pc));
    else {
      const forensics = this.ensureForensics(clientId, pc);
      forensics.lastConnectionState = pc.connectionState;
      forensics.lastIceConnectionState = pc.iceConnectionState;
      forensics.lastIceGatheringState = pc.iceGatheringState;
      forensics.lastSignalingState = pc.signalingState;
    }
    this.previousStats.delete(clientId);
    this.previousInboundAudioPackets.delete(clientId);
    this.previousInboundVideoStats.delete(clientId);
    this.inboundAudioStats.delete(clientId);
    this.inboundVideoStats.delete(clientId);
    this.mediaHealthState.delete(clientId);
    this.videoSenders.delete(clientId);
    this.fallbackVideoTracks.delete(clientId);
    this.touchPeer(clientId, {
      pc,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState,
      signalingState: pc.signalingState,
      selectedCandidateType: null,
      reconnecting: false,
      reconnectingSince: null,
    });

    for (const track of this.localStream.getTracks()) {
      const sender = pc.addTrack(track, this.localStream);
      if (track.kind === 'video') this.videoSenders.set(clientId, sender);
    }
    await this.applySenderBandwidthPreferences(pc, clientId);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.recordGatheredCandidate(clientId, event.candidate.toJSON(), 'local');
        this.sendSignal?.(clientId, { ice: event.candidate.toJSON() });
      }
    };
    pc.ontrack = (event) => {
      const currentPeer = this.peers().get(clientId);
      const nextStream = currentPeer?.stream ?? new MediaStream();
      if (!nextStream.getTracks().some((track) => track.id === event.track.id)) nextStream.addTrack(event.track);
      this.touchPeer(clientId, { stream: nextStream });
    };
    pc.onconnectionstatechange = () => {
      this.recordStateTransition(clientId, 'connection', pc.connectionState);
      this.touchPeer(clientId, { connectionState: pc.connectionState, reconnecting: false, reconnectingSince: null });
      console.log(`[webrtc] peer ${clientId} connectionState=${pc.connectionState} at ${new Date().toISOString()}`);
      this.updateRecoveryState(clientId, pc);
      void this.logSelectedCandidateType(clientId, pc);
      this.maybeScheduleIceRestart(clientId, pc);
      this.maybeSchedulePeerConnectionRecreate(clientId, pc);
    };
    pc.oniceconnectionstatechange = () => {
      this.recordStateTransition(clientId, 'iceConnection', pc.iceConnectionState);
      this.touchPeer(clientId, { iceConnectionState: pc.iceConnectionState, reconnecting: false, reconnectingSince: null });
      console.log(`[webrtc] peer ${clientId} iceConnectionState=${pc.iceConnectionState} at ${new Date().toISOString()}`);
      this.updateRecoveryState(clientId, pc);
      void this.logSelectedCandidateType(clientId, pc);
      this.maybeScheduleIceRestart(clientId, pc);
      this.maybeSchedulePeerConnectionRecreate(clientId, pc);
    };
    pc.onicegatheringstatechange = () => {
      this.recordStateTransition(clientId, 'iceGathering', pc.iceGatheringState);
      this.touchPeer(clientId, { iceGatheringState: pc.iceGatheringState });
      console.log(`[webrtc] peer ${clientId} iceGatheringState=${pc.iceGatheringState} at ${new Date().toISOString()}`);
      void this.logSelectedCandidateType(clientId, pc);
    };
    pc.onsignalingstatechange = () => {
      this.recordStateTransition(clientId, 'signaling', pc.signalingState);
      this.touchPeer(clientId, { signalingState: pc.signalingState });
      console.log(`[webrtc] peer ${clientId} signalingState=${pc.signalingState} at ${new Date().toISOString()}`);
      if (pc.signalingState === 'stable') this.clearNegotiationWatchdog(meta, true);
      else this.scheduleNegotiationWatchdog(clientId, pc, meta);
      void this.logSelectedCandidateType(clientId, pc);
    };
    pc.onnegotiationneeded = () => {
      const forensics = this.ensureForensics(clientId, pc);
      forensics.negotiation.negotiationNeededCount += 1;
      this.pushTransition(clientId, {
        scope: 'negotiation',
        event: 'negotiationneeded',
        detail: `makingOffer=${meta.makingOffer} signaling=${pc.signalingState}`,
      });
    };

    if (isInitiator) await this.sendOffer(clientId, pc, meta, false);
    this.startQualityPolling();
    return pc;
  }

  private removePeerResources(clientId: string, stopStreamTracks: boolean): void {
    const peer = this.peers().get(clientId);
    const meta = this.peerMeta.get(clientId);
    if (meta?.restartTimer) clearTimeout(meta.restartTimer);
    if (meta?.recoveryTimer) clearTimeout(meta.recoveryTimer);
    if (meta?.pcRecreateTimer) clearTimeout(meta.pcRecreateTimer);
    if (meta?.negotiationTimer) clearTimeout(meta.negotiationTimer);
    this.peerMeta.delete(clientId);
    this.qualityCounters.delete(clientId);
    this.previousStats.delete(clientId);
    this.previousInboundAudioPackets.delete(clientId);
    this.previousInboundVideoStats.delete(clientId);
    this.inboundAudioStats.delete(clientId);
    this.inboundVideoStats.delete(clientId);
    this.mediaHealthState.delete(clientId);
    this.peerForensics.delete(clientId);
    this.autoPausedReceivers.delete(clientId);
    this.autoDegradedReceivers.delete(clientId);
    this.mobileAutoPausedReceivers.delete(clientId);
    this.remotePauseRequests.delete(clientId);
    this.remoteDegradeRequests.delete(clientId);
    this.lastActiveSpeakerAt.delete(clientId);
    this.outboundVideoPaused.delete(clientId);
    this.outboundVideoDegraded.delete(clientId);
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
      pcRecreateAttempts: 0,
      pcRecreateTimer: null,
      lastPcRecreateAt: 0,
      recreatingPc: false,
      healthyPcSamples: 0,
      negotiationTimer: null,
      negotiationRecoveryAttempts: 0,
      lastRestartAt: 0,
      currentRestartStartedAt: null,
      mediaDeadReason: null,
    };
  }

  private updateRecoveryState(clientId: string, pc: RTCPeerConnection): void {
    const meta = this.peerMeta.get(clientId);
    if (!meta) return;
    const forensics = this.ensureForensics(clientId, pc);
    if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
      forensics.iceRestart.terminalFailed = true;
      if (forensics.iceRestart.lastOutcome === 'pending') forensics.iceRestart.lastOutcome = 'failed';
    }
    const disconnected =
      pc.connectionState === 'disconnected' ||
      pc.iceConnectionState === 'disconnected' ||
      pc.connectionState === 'failed' ||
      pc.iceConnectionState === 'failed';
    if (!disconnected) {
      if (meta.recoveryTimer) clearTimeout(meta.recoveryTimer);
      meta.recoveryTimer = null;
      if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (meta.currentRestartStartedAt != null) {
          forensics.iceRestart.lastOutcome = 'recovered';
          forensics.iceRestart.lastTimeToRecoverMs = Date.now() - meta.currentRestartStartedAt;
          if (meta.pcRecreateAttempts > 0) forensics.iceRestart.autoRecoveryOutcome = 'recovered';
          this.pushTransition(clientId, {
            scope: 'iceRestart',
            event: 'recovered',
            detail: `attempt=${forensics.iceRestart.attempts} timeToRecoverMs=${forensics.iceRestart.lastTimeToRecoverMs}`,
          });
          meta.currentRestartStartedAt = null;
        }
        if (!meta.mediaDeadReason) meta.restartAttempts = 0;
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
      if (stillDisconnected) {
        const currentForensics = this.ensureForensics(clientId, current);
        if (currentForensics.iceRestart.lastOutcome === 'pending') currentForensics.iceRestart.lastOutcome = 'failed';
        this.touchPeer(clientId, { quality: 'poor' });
      }
    }, 20_000);
  }

  private async sendOffer(clientId: string, pc: RTCPeerConnection, meta: PeerMeta, iceRestart: boolean): Promise<void> {
    try {
      meta.makingOffer = true;
      this.recordMakingOffer(clientId, pc, true);
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      await pc.setLocalDescription(offer);
      this.recordNegotiationEvent(clientId, iceRestart ? 'ice-restart-offer-sent' : 'offer-sent', pc);
      this.scheduleNegotiationWatchdog(clientId, pc, meta);
      this.sendSignal?.(clientId, { sdp: pc.localDescription?.toJSON() });
    } finally {
      meta.makingOffer = false;
      this.recordMakingOffer(clientId, pc, false);
    }
  }

  private async sendAnswer(clientId: string, pc: RTCPeerConnection): Promise<void> {
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.recordNegotiationEvent(clientId, 'answer-sent', pc);
    if (pc.signalingState === 'stable') this.clearNegotiationWatchdog(this.peerMeta.get(clientId) ?? null, true);
    this.sendSignal?.(clientId, { sdp: pc.localDescription?.toJSON() });
  }

  private maybeScheduleIceRestart(clientId: string, pc: RTCPeerConnection, trigger: 'connection' | 'media-dead' = 'connection'): void {
    const connectionTrigger =
      pc.connectionState === 'failed' ||
      pc.connectionState === 'disconnected' ||
      pc.iceConnectionState === 'failed' ||
      pc.iceConnectionState === 'disconnected';
    if (trigger === 'connection' && !connectionTrigger) return;
    if (trigger === 'media-dead' && !isPeerConnectionConnected(pc)) return;
    const peer = this.peers().get(clientId);
    const meta = this.peerMeta.get(clientId);
    if (!peer || peer.reconnecting || !meta || meta.restartTimer || meta.restartAttempts >= MAX_ICE_RESTART_ATTEMPTS || pc.signalingState === 'closed') return;

    meta.restartTimer = setTimeout(() => {
      meta.restartTimer = null;
      void this.restartIce(clientId, pc, meta, trigger);
    }, ICE_RESTART_DEBOUNCE_MS);
  }

  private async restartIce(clientId: string, pc: RTCPeerConnection, meta: PeerMeta, trigger: 'connection' | 'media-dead' = 'connection'): Promise<void> {
    const now = Date.now();
    if (now - meta.lastRestartAt < ICE_RESTART_COOLDOWN_MS || pc.signalingState !== 'stable') {
      this.maybeScheduleIceRestart(clientId, pc, trigger);
      return;
    }
    const peer = this.peers().get(clientId);
    if (!peer || peer.reconnecting || peer.pc !== pc) return;
    meta.restartAttempts += 1;
    meta.lastRestartAt = now;
    meta.currentRestartStartedAt = now;
    const forensics = this.ensureForensics(clientId, pc);
    forensics.iceRestart.fired = true;
    forensics.iceRestart.attempts = meta.restartAttempts;
    forensics.iceRestart.lastAttemptAt = now;
    forensics.iceRestart.lastOutcome = 'pending';
    forensics.iceRestart.lastTimeToRecoverMs = null;
    this.pushTransition(clientId, {
      scope: 'iceRestart',
      event: 'fired',
      detail: `attempt=${meta.restartAttempts}/${MAX_ICE_RESTART_ATTEMPTS} trigger=${trigger}`,
    });
    console.warn(`[webrtc] restarting ICE for peer ${clientId}; attempt=${meta.restartAttempts}/${MAX_ICE_RESTART_ATTEMPTS}`);
    pc.restartIce();
    await this.sendOffer(clientId, pc, meta, true);
  }

  private maybeSchedulePeerConnectionRecreate(clientId: string, pc: RTCPeerConnection, trigger: 'connection' | 'media-dead' = 'connection'): void {
    const terminalFailed = pc.connectionState === 'failed' || pc.iceConnectionState === 'failed';
    const peer = this.peers().get(clientId);
    const meta = this.peerMeta.get(clientId);
    const terminalMediaDead = trigger === 'media-dead' && !!meta?.mediaDeadReason && isPeerConnectionConnected(pc);
    if ((!terminalFailed && !terminalMediaDead) || pc.signalingState === 'closed') return;
    if (!peer || peer.reconnecting || !meta || meta.recreatingPc || meta.pcRecreateTimer || meta.restartAttempts < MAX_ICE_RESTART_ATTEMPTS) return;
    const forensics = this.ensureForensics(clientId, pc);
    forensics.iceRestart.terminalFailed = true;
    if (meta.pcRecreateAttempts >= MAX_CONSECUTIVE_PC_RECREATE_ATTEMPTS) {
      forensics.iceRestart.autoRecoveryOutcome = 'failed';
      this.pushTransition(clientId, {
        scope: 'iceRestart',
        event: 'pc-recreate-cap-hit',
        detail: `attempts=${meta.pcRecreateAttempts}/${MAX_CONSECUTIVE_PC_RECREATE_ATTEMPTS}`,
      });
      return;
    }
    const backoff = meta.pcRecreateAttempts === 0 ? PC_RECREATE_DEBOUNCE_MS : PC_RECREATE_BACKOFF_MS[Math.min(meta.pcRecreateAttempts - 1, PC_RECREATE_BACKOFF_MS.length - 1)];
    const elapsed = meta.lastPcRecreateAt ? Date.now() - meta.lastPcRecreateAt : Number.POSITIVE_INFINITY;
    const delay = Math.max(PC_RECREATE_DEBOUNCE_MS, backoff - elapsed);
    meta.pcRecreateTimer = setTimeout(() => {
      meta.pcRecreateTimer = null;
      void this.recreateFailedPeerConnection(clientId, pc);
    }, delay);
    this.pushTransition(clientId, {
      scope: 'iceRestart',
      event: 'pc-recreate-scheduled',
      detail: `delayMs=${delay} restartAttempts=${meta.restartAttempts}/${MAX_ICE_RESTART_ATTEMPTS} trigger=${trigger}`,
    });
  }

  private async recreateFailedPeerConnection(clientId: string, failedPc: RTCPeerConnection): Promise<void> {
    const peer = this.peers().get(clientId);
    const meta = this.peerMeta.get(clientId);
    if (!peer || !meta || peer.reconnecting || peer.pc !== failedPc || meta.recreatingPc) return;
    const terminalFailed = failedPc.connectionState === 'failed' || failedPc.iceConnectionState === 'failed';
    const terminalMediaDead = !!meta.mediaDeadReason && isPeerConnectionConnected(failedPc);
    if ((!terminalFailed && !terminalMediaDead) || meta.restartAttempts < MAX_ICE_RESTART_ATTEMPTS) return;
    if (meta.pcRecreateAttempts >= MAX_CONSECUTIVE_PC_RECREATE_ATTEMPTS) {
      this.ensureForensics(clientId, failedPc).iceRestart.autoRecoveryOutcome = 'failed';
      return;
    }

    meta.recreatingPc = true;
    meta.pcRecreateAttempts += 1;
    meta.lastPcRecreateAt = Date.now();
    meta.restartAttempts = 0;
    meta.currentRestartStartedAt = meta.lastPcRecreateAt;
    meta.healthyPcSamples = 0;
    const forensics = this.ensureForensics(clientId, failedPc);
    forensics.iceRestart.fired = true;
    forensics.iceRestart.lastOutcome = 'pending';
    forensics.iceRestart.lastAttemptAt = meta.lastPcRecreateAt;
    forensics.iceRestart.lastTimeToRecoverMs = null;
    forensics.iceRestart.terminalFailed = true;
    this.pushTransition(clientId, {
      scope: 'iceRestart',
      event: 'pc-recreate-fired',
      detail: `attempt=${meta.pcRecreateAttempts}/${MAX_CONSECUTIVE_PC_RECREATE_ATTEMPTS} participantId=${peer.participantId} trigger=${terminalMediaDead ? meta.mediaDeadReason : 'connection'}`,
    });

    if (!this.forceRelay() && meta.pcRecreateAttempts > 1) {
      this.forceRelay.set(true);
      storeForceRelay(true);
      this.pushTransition(clientId, { scope: 'iceRestart', event: 'relay-policy-escalated', detail: 'forceRelay=true' });
    }

    try {
      this.closePeerConnectionForRecreate(clientId, failedPc, meta);
      const stream = peer.stream ?? new MediaStream();
      for (const track of stream.getTracks()) stream.removeTrack(track);
      this.touchPeer(clientId, { pc: null, stream, connectionState: 'new', iceConnectionState: 'new', iceGatheringState: 'new', signalingState: 'stable' });
      await this.createPeerConnectionForPeer(clientId, true, { resetForensics: false });
    } catch (err) {
      forensics.iceRestart.autoRecoveryOutcome = 'failed';
      forensics.iceRestart.lastOutcome = 'failed';
      this.pushTransition(clientId, { scope: 'iceRestart', event: 'pc-recreate-failed', detail: err instanceof Error ? err.message : 'unknown' });
      console.warn(`[webrtc] peer ${clientId} PC recreate failed`, err);
    } finally {
      meta.recreatingPc = false;
    }
  }

  private closePeerConnectionForRecreate(clientId: string, pc: RTCPeerConnection, meta: PeerMeta): void {
    if (meta.restartTimer) clearTimeout(meta.restartTimer);
    if (meta.recoveryTimer) clearTimeout(meta.recoveryTimer);
    if (meta.negotiationTimer) clearTimeout(meta.negotiationTimer);
    meta.restartTimer = null;
    meta.recoveryTimer = null;
    meta.negotiationTimer = null;
    this.previousStats.delete(clientId);
    this.previousInboundAudioPackets.delete(clientId);
    this.previousInboundVideoStats.delete(clientId);
    this.inboundAudioStats.delete(clientId);
    this.inboundVideoStats.delete(clientId);
    this.mediaHealthState.delete(clientId);
    this.videoSenders.delete(clientId);
    this.fallbackVideoTracks.delete(clientId);
    pc.close();
  }

  private cancelPeerConnectionRecreate(clientId: string): void {
    const meta = this.peerMeta.get(clientId);
    if (!meta?.pcRecreateTimer) return;
    clearTimeout(meta.pcRecreateTimer);
    meta.pcRecreateTimer = null;
    this.pushTransition(clientId, { scope: 'iceRestart', event: 'pc-recreate-deferred', detail: 'peer-resume-in-progress' });
  }

  private scheduleNegotiationWatchdog(clientId: string, pc: RTCPeerConnection, meta: PeerMeta): void {
    if (pc.signalingState === 'closed' || pc.signalingState === 'stable') return;
    if (meta.negotiationTimer) return;
    meta.negotiationTimer = setTimeout(() => {
      meta.negotiationTimer = null;
      void this.breakNegotiationDeadlock(clientId, pc, meta);
    }, NEGOTIATION_STUCK_MS);
  }

  private clearNegotiationWatchdog(meta: PeerMeta | null, resetAttempts: boolean): void {
    if (!meta) return;
    if (meta.negotiationTimer) clearTimeout(meta.negotiationTimer);
    meta.negotiationTimer = null;
    if (resetAttempts) meta.negotiationRecoveryAttempts = 0;
  }

  private async breakNegotiationDeadlock(clientId: string, pc: RTCPeerConnection, meta: PeerMeta): Promise<void> {
    const peer = this.peers().get(clientId);
    if (!peer || peer.reconnecting || peer.pc !== pc || pc.signalingState === 'closed' || pc.signalingState === 'stable') return;
    if (meta.negotiationRecoveryAttempts >= MAX_NEGOTIATION_RECOVERY_ATTEMPTS) {
      this.pushTransition(clientId, {
        scope: 'negotiation',
        event: 'deadlock-cap-hit',
        detail: `signaling=${pc.signalingState}`,
      });
      return;
    }
    meta.negotiationRecoveryAttempts += 1;
    this.pushTransition(clientId, {
      scope: 'negotiation',
      event: 'deadlock-break',
      detail: `attempt=${meta.negotiationRecoveryAttempts}/${MAX_NEGOTIATION_RECOVERY_ATTEMPTS} signaling=${pc.signalingState}`,
    });
    await this.rollbackLocalOffer(clientId, pc, meta, 'deadlock-watchdog');
    if ((pc as RTCPeerConnection).signalingState === 'stable') await this.sendOffer(clientId, pc, meta, false);
  }

  private async rollbackLocalOffer(clientId: string, pc: RTCPeerConnection, meta: PeerMeta, reason: string): Promise<void> {
    if (pc.signalingState !== 'have-local-offer' && !meta.makingOffer) return;
    try {
      await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
      meta.makingOffer = false;
      const forensics = this.ensureForensics(clientId, pc);
      forensics.negotiation.rollbackCount += 1;
      this.pushTransition(clientId, {
        scope: 'negotiation',
        event: 'rollback',
        detail: `${reason} signaling=${pc.signalingState}`,
      });
    } catch (err) {
      this.pushTransition(clientId, {
        scope: 'negotiation',
        event: 'rollback-failed',
        detail: err instanceof Error ? err.message : reason,
      });
    }
  }

  private async logSelectedCandidateType(clientId: string, pc: RTCPeerConnection): Promise<void> {
    try {
      const stats = await pc.getStats();
      this.updateForensicsFromStats(clientId, pc, stats);
      const candidateType = selectedCandidateTypeFromStats(stats);
      if (candidateType) {
        this.touchPeer(clientId, { selectedCandidateType: candidateType });
        console.log(`[webrtc] peer ${clientId} selectedCandidateType=${candidateType}`);
      }
    } catch (err) {
      console.debug(`[webrtc] selected candidate lookup failed for ${clientId}`, err);
    }
  }

  private ensureForensics(clientId: string, pc?: RTCPeerConnection): PeerForensics {
    const existing = this.peerForensics.get(clientId);
    if (existing) return existing;
    const created = pc ? createPeerForensics(pc) : createEmptyForensics();
    this.peerForensics.set(clientId, created);
    return created;
  }

  private recordStateTransition(clientId: string, scope: DiagnosticsTransition['scope'], nextState: string): void {
    const forensics = this.ensureForensics(clientId);
    const key =
      scope === 'connection'
        ? 'lastConnectionState'
        : scope === 'iceConnection'
          ? 'lastIceConnectionState'
          : scope === 'iceGathering'
            ? 'lastIceGatheringState'
            : scope === 'signaling'
              ? 'lastSignalingState'
              : null;
    if (!key) return;
    const previous = forensics[key];
    forensics[key] = nextState;
    if (previous === nextState) return;
    this.pushTransition(clientId, { scope, from: previous, to: nextState });
  }

  private recordGatheredCandidate(clientId: string, candidate: RTCIceCandidateInit, side: 'local' | 'remote'): void {
    const type = candidateTypeFromCandidateLine(candidate.candidate);
    if (type !== 'relay') return;
    const forensics = this.ensureForensics(clientId);
    forensics.iceRelayGathered[side] = true;
    this.pushTransition(clientId, { scope: 'iceGathering', event: `${side}-relay-gathered` });
  }

  private recordMakingOffer(clientId: string, pc: RTCPeerConnection, makingOffer: boolean): void {
    const forensics = this.ensureForensics(clientId, pc);
    forensics.negotiation.makingOffer = makingOffer;
    this.pushTransition(clientId, {
      scope: 'negotiation',
      event: makingOffer ? 'makingOffer-start' : 'makingOffer-end',
      detail: `signaling=${pc.signalingState}`,
    });
  }

  private recordNegotiationEvent(clientId: string, event: string, pc: RTCPeerConnection): void {
    const forensics = this.ensureForensics(clientId, pc);
    if (event.endsWith('offer-sent') || event === 'offer-sent') forensics.negotiation.offerSentCount += 1;
    if (event === 'answer-sent') forensics.negotiation.answerSentCount += 1;
    if (event === 'offer-received') forensics.negotiation.offerReceivedCount += 1;
    if (event === 'answer-received') forensics.negotiation.answerReceivedCount += 1;
    forensics.negotiation.makingOffer = this.peerMeta.get(clientId)?.makingOffer ?? forensics.negotiation.makingOffer;
    forensics.negotiation.ignoreOffer = this.peerMeta.get(clientId)?.ignoreOffer ?? forensics.negotiation.ignoreOffer;
    this.pushTransition(clientId, { scope: 'negotiation', event, detail: `signaling=${pc.signalingState}` });
  }

  private updateForensicsFromStats(clientId: string, pc: RTCPeerConnection, stats: RTCStatsReport): void {
    const forensics = this.ensureForensics(clientId, pc);
    const next = readCandidatePairForensics(stats);
    forensics.candidatePairCount = next.candidatePairCount;
    if (next.localRelayGathered) forensics.iceRelayGathered.local = true;
    if (next.remoteRelayGathered) forensics.iceRelayGathered.remote = true;
    if (next.candidatePair) {
      if (next.candidatePair.id !== forensics.selectedPairId) {
        const previous = forensics.selectedPairId;
        forensics.selectedPairId = next.candidatePair.id;
        if (next.candidatePair.nominated) forensics.nominatedPairChanges += 1;
        this.pushTransition(clientId, {
          scope: 'candidatePair',
          from: previous,
          to: next.candidatePair.id,
          detail: candidatePairSummary(next.candidatePair),
        });
      } else if (next.candidatePair.nominated && forensics.candidatePair && !forensics.candidatePair.nominated) {
        forensics.nominatedPairChanges += 1;
        this.pushTransition(clientId, {
          scope: 'candidatePair',
          event: 'nominated',
          detail: candidatePairSummary(next.candidatePair),
        });
      }
      forensics.candidatePair = next.candidatePair;
    }
  }

  private pushTransition(clientId: string, transition: Omit<DiagnosticsTransition, 'at' | 'atIso'>): void {
    const forensics = this.ensureForensics(clientId);
    const at = Date.now();
    forensics.transitionTimeline.push({ ...transition, at, atIso: new Date(at).toISOString() });
    trimToLast(forensics.transitionTimeline, MAX_FORENSIC_TRANSITIONS);
  }

  private async handleControlSignal(from: string, control: VideoControlPayload): Promise<void> {
    if (control.type !== 'receiver-video-policy') return;
    if (control.videoPaused) {
      this.remotePauseRequests.add(from);
      this.remoteDegradeRequests.delete(from);
    } else {
      this.remotePauseRequests.delete(from);
      if (control.videoDegraded) this.remoteDegradeRequests.add(from);
      else this.remoteDegradeRequests.delete(from);
    }
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
    if (metrics.quality === 'weak' || metrics.quality === 'poor') {
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
    this.updateSustainedHealthyRecoveryWindow(clientId, metrics);
    this.touchPeer(clientId, {
      quality: metrics.quality,
      packetLossPct: metrics.packetLossPct,
      jitterMs: metrics.jitterMs,
      rttMs: metrics.rttMs,
      availableOutgoingBitrateKbps: metrics.availableOutgoingBitrateKbps,
    });
    this.handleInboundMediaHealth(clientId, metrics);
    if (this.localMobile && counters.poor >= AUTO_DEGRADE_POOR_SAMPLES && metrics.quality !== 'good') {
      this.pauseNextMobileNonSpeakerReceiver();
      return;
    }
    if (this.localMobile && metrics.quality === 'good' && counters.good >= AUTO_RESTORE_GOOD_SAMPLES && this.restoreOneMobileReceiverVideo()) {
      return;
    }
    if (counters.poor >= AUTO_DEGRADE_POOR_SAMPLES && metrics.audioOnlyFloor) {
      const changed = !this.autoPausedReceivers.has(clientId) || this.autoDegradedReceivers.has(clientId);
      this.autoPausedReceivers.add(clientId);
      this.autoDegradedReceivers.delete(clientId);
      if (changed && !this.manualAudioOnly()) this.sendReceiverVideoPolicy(clientId, true, 'auto-poor');
      this.updateAudioOnlyReason(clientId);
      return;
    }
    if (counters.poor >= AUTO_DEGRADE_POOR_SAMPLES) {
      const changed = !this.autoDegradedReceivers.has(clientId) || this.autoPausedReceivers.has(clientId);
      this.autoPausedReceivers.delete(clientId);
      this.autoDegradedReceivers.add(clientId);
      if (changed && !this.manualAudioOnly()) this.sendReceiverVideoPolicy(clientId, false, 'auto-poor', true);
      this.updateAudioOnlyReason(clientId);
    }
    if (metrics.quality === 'good' && counters.good >= AUTO_RESTORE_GOOD_SAMPLES && (this.autoPausedReceivers.has(clientId) || this.autoDegradedReceivers.has(clientId))) {
      this.autoPausedReceivers.delete(clientId);
      this.autoDegradedReceivers.delete(clientId);
      if (!this.manualAudioOnly()) this.sendReceiverVideoPolicy(clientId, false, 'auto-poor', false);
      this.updateAudioOnlyReason(clientId);
    }
  }

  private handleInboundMediaHealth(clientId: string, metrics: QualityMetrics): void {
    const label = metrics.inboundVideo.noInboundMedia ? 'no-inbound-media' : metrics.inboundVideo.videoFrozen ? 'video-frozen' : null;
    const peer = this.peers().get(clientId);
    const pc = peer?.pc;
    const meta = this.peerMeta.get(clientId);
    if (!peer || !pc || !meta) return;
    if (!label) {
      if (meta.mediaDeadReason && metrics.connected) {
        const forensics = this.ensureForensics(clientId, pc);
        if (forensics.iceRestart.lastOutcome === 'pending') {
          forensics.iceRestart.lastOutcome = 'recovered';
          forensics.iceRestart.lastTimeToRecoverMs = meta.currentRestartStartedAt == null ? null : Date.now() - meta.currentRestartStartedAt;
          if (meta.pcRecreateAttempts > 0) forensics.iceRestart.autoRecoveryOutcome = 'recovered';
        }
        this.pushTransition(clientId, { scope: 'iceRestart', event: 'media-dead-recovered', detail: `reason=${meta.mediaDeadReason}` });
        meta.mediaDeadReason = null;
        meta.currentRestartStartedAt = null;
        meta.restartAttempts = 0;
      }
      return;
    }
    if (meta.mediaDeadReason !== label) {
      meta.mediaDeadReason = label;
      this.pushTransition(clientId, {
        scope: 'iceRestart',
        event: 'media-dead-detected',
        detail: `${label} samples=${label === 'no-inbound-media' ? metrics.inboundVideo.noInboundMediaSamples : metrics.inboundVideo.videoFrozenSamples}`,
      });
    }
    this.touchPeer(clientId, { quality: 'poor' });
    if (meta.restartAttempts >= MAX_ICE_RESTART_ATTEMPTS) {
      this.maybeSchedulePeerConnectionRecreate(clientId, pc, 'media-dead');
      return;
    }
    this.maybeScheduleIceRestart(clientId, pc, 'media-dead');
  }

  private pauseNextMobileNonSpeakerReceiver(): void {
    if (!this.localMobile || this.manualAudioOnly()) return;
    const candidate = this.peerList()
      .filter((peer) => !peer.isLocal && peer.pc && peer.id !== this.activeSpeakerId && !this.autoPausedReceivers.has(peer.id))
      .sort((a, b) => (this.lastActiveSpeakerAt.get(a.id) ?? 0) - (this.lastActiveSpeakerAt.get(b.id) ?? 0))[0];
    if (!candidate) return;
    this.mobileAutoPausedReceivers.add(candidate.id);
    this.autoPausedReceivers.add(candidate.id);
    this.autoDegradedReceivers.delete(candidate.id);
    this.sendReceiverVideoPolicy(candidate.id, true, 'auto-poor');
    this.updateAudioOnlyReason(candidate.id);
  }

  private restoreOneMobileReceiverVideo(): boolean {
    if (!this.localMobile || this.manualAudioOnly()) return false;
    const clientId = this.mobileAutoPausedReceivers.values().next().value as string | undefined;
    if (!clientId) return false;
    this.mobileAutoPausedReceivers.delete(clientId);
    this.autoPausedReceivers.delete(clientId);
    this.sendReceiverVideoPolicy(clientId, false, 'auto-poor', true);
    this.updateAudioOnlyReason(clientId);
    return true;
  }

  private updateSustainedHealthyRecoveryWindow(clientId: string, metrics: QualityMetrics): void {
    const meta = this.peerMeta.get(clientId);
    if (!meta) return;
    const pc = this.peers().get(clientId)?.pc;
    const connected = pc?.connectionState === 'connected' || pc?.iceConnectionState === 'connected' || pc?.iceConnectionState === 'completed';
    if (metrics.quality === 'good' && connected) {
      meta.healthyPcSamples += 1;
      if (meta.healthyPcSamples >= AUTO_RESTORE_GOOD_SAMPLES) {
        if (meta.pcRecreateAttempts > 0) {
          this.pushTransition(clientId, {
            scope: 'iceRestart',
            event: 'pc-recreate-cap-reset',
            detail: `healthySamples=${meta.healthyPcSamples}`,
          });
        }
        meta.pcRecreateAttempts = 0;
        meta.healthyPcSamples = 0;
      }
      return;
    }
    meta.healthyPcSamples = 0;
  }

  private async readQualityMetrics(clientId: string, pc: RTCPeerConnection, sampleOutboundAudio = false): Promise<QualityMetrics> {
    const stats = await pc.getStats();
    this.updateForensicsFromStats(clientId, pc, stats);
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
    let inboundVideoFramesDecoded: number | null = null;
    let inboundVideoFramesReceived: number | null = null;
    let inboundVideoFreezeCount: number | null = null;
    let inboundVideoTotalFreezesDuration: number | null = null;
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
        if (report['kind'] === 'video') {
          inboundVideoFramesDecoded = (inboundVideoFramesDecoded ?? 0) + numberOrZero(report['framesDecoded']);
          inboundVideoFramesReceived = (inboundVideoFramesReceived ?? 0) + numberOrZero(report['framesReceived']);
          inboundVideoFreezeCount = (inboundVideoFreezeCount ?? 0) + numberOrZero(report['freezeCount']);
          inboundVideoTotalFreezesDuration = (inboundVideoTotalFreezesDuration ?? 0) + numberOrZero(report['totalFreezesDuration']);
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

    const inboundAudio = this.buildInboundAudioStats(clientId, inboundAudioPacketsReceived, inboundAudioPacketsLost, inboundAudioBytesReceived, inboundAudioLevel);
    this.inboundAudioStats.set(clientId, inboundAudio);
    const connected = isPeerConnectionConnected(pc);
    const inboundVideo = this.buildInboundVideoStats(
      clientId,
      {
        framesDecoded: inboundVideoFramesDecoded,
        framesReceived: inboundVideoFramesReceived,
        freezeCount: inboundVideoFreezeCount,
        totalFreezesDuration: inboundVideoTotalFreezesDuration,
      },
      inboundAudio,
      connected,
      this.isInboundVideoExpected(clientId),
    );
    this.inboundVideoStats.set(clientId, inboundVideo);

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
    const audioOnlyFloor = isAudioOnlyFloor({
      packetLossPct,
      jitterMs,
      rttMs,
      availableOutgoingBitrateKbps,
      hasInboundMedia,
      inboundPacketsReceivedTotal,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
    });
    return {
      quality,
      packetLossPct,
      jitterMs,
      rttMs,
      availableOutgoingBitrateKbps,
      hasInboundMedia,
      audioOnlyFloor,
      connected,
      inboundVideo,
    };
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

  private buildInboundVideoStats(
    clientId: string,
    stats: {
      framesDecoded: number | null;
      framesReceived: number | null;
      freezeCount: number | null;
      totalFreezesDuration: number | null;
    },
    inboundAudio: InboundAudioStats,
    connected: boolean,
    videoExpected: boolean,
  ): InboundVideoStats {
    const hasVideoStats =
      stats.framesDecoded != null ||
      stats.framesReceived != null ||
      stats.freezeCount != null ||
      stats.totalFreezesDuration != null;
    const framesDecoded = stats.framesDecoded ?? null;
    const framesReceived = stats.framesReceived ?? null;
    const freezeCount = stats.freezeCount ?? null;
    const totalFreezesDuration = stats.totalFreezesDuration ?? null;
    const previous = this.previousInboundVideoStats.get(clientId);
    const current = {
      framesDecoded: framesDecoded ?? 0,
      framesReceived: framesReceived ?? 0,
      freezeCount: freezeCount ?? 0,
      totalFreezesDuration: totalFreezesDuration ?? 0,
    };
    const framesDecodedDelta = previous ? Math.max(0, current.framesDecoded - previous.framesDecoded) : current.framesDecoded;
    const framesReceivedDelta = previous ? Math.max(0, current.framesReceived - previous.framesReceived) : current.framesReceived;
    const freezeCountDelta = previous ? Math.max(0, current.freezeCount - previous.freezeCount) : 0;
    const totalFreezesDurationDelta = previous ? Math.max(0, current.totalFreezesDuration - previous.totalFreezesDuration) : 0;
    if (hasVideoStats || videoExpected) this.previousInboundVideoStats.set(clientId, current);
    else this.previousInboundVideoStats.delete(clientId);

    const videoActivelyDecoding = framesDecodedDelta > 0 || framesReceivedDelta > 0;
    const audioActivelyArriving =
      inboundAudio.packetsActivelyArriving === true ||
      (inboundAudio.packetsReceivedDelta == null && (inboundAudio.packetsReceived ?? 0) > 0) ||
      (inboundAudio.packetsReceivedDelta ?? 0) > 0;
    const freezeIncreasing = freezeCountDelta > 0 || totalFreezesDurationDelta > 0;
    const frozenSample = connected && videoExpected && (!videoActivelyDecoding || freezeIncreasing);
    const noInboundMediaSample = connected && videoExpected && !audioActivelyArriving && !videoActivelyDecoding;
    const state = this.mediaHealthState.get(clientId) ?? { videoFrozenSamples: 0, noInboundMediaSamples: 0, activeLabel: null };
    state.videoFrozenSamples = frozenSample ? state.videoFrozenSamples + 1 : 0;
    state.noInboundMediaSamples = noInboundMediaSample ? state.noInboundMediaSamples + 1 : 0;
    state.activeLabel =
      state.noInboundMediaSamples >= MEDIA_DEAD_REQUIRED_SAMPLES
        ? 'no-inbound-media'
        : state.videoFrozenSamples >= MEDIA_DEAD_REQUIRED_SAMPLES
          ? 'video-frozen'
          : null;
    if (!videoExpected) {
      state.videoFrozenSamples = 0;
      state.noInboundMediaSamples = 0;
      state.activeLabel = null;
    } else if (!connected && !state.activeLabel) {
      state.videoFrozenSamples = 0;
      state.noInboundMediaSamples = 0;
    }
    this.mediaHealthState.set(clientId, state);
    return {
      framesDecoded,
      framesDecodedDelta,
      framesReceived,
      framesReceivedDelta,
      freezeCount,
      freezeCountDelta,
      totalFreezesDuration,
      totalFreezesDurationDelta,
      framesActivelyDecoding: videoActivelyDecoding,
      videoExpected,
      videoFrozenSamples: state.videoFrozenSamples,
      noInboundMediaSamples: state.noInboundMediaSamples,
      videoFrozen: state.activeLabel === 'video-frozen',
      noInboundMedia: state.activeLabel === 'no-inbound-media',
    };
  }

  private isInboundVideoExpected(clientId: string): boolean {
    const peer = this.peers().get(clientId);
    if (!peer || peer.isLocal || !peer.camEnabled || peer.screenOn) return false;
    const meta = this.peerMeta.get(clientId);
    if (meta?.mediaDeadReason) return true;
    if (this.manualAudioOnly()) return false;
    if (this.autoPausedReceivers.has(clientId) || this.mobileAutoPausedReceivers.has(clientId) || this.remotePauseRequests.has(clientId)) return false;
    return true;
  }

  private sendReceiverVideoPolicy(clientId: string, videoPaused: boolean, reason: 'auto-poor' | 'manual-audio-only', videoDegraded = false): void {
    this.sendSignal?.(clientId, { control: { type: 'receiver-video-policy', videoPaused, videoDegraded: !videoPaused && videoDegraded, reason } });
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
    await this.applySenderBandwidthPreferences(pc, clientId);
    const shouldPause = this.shouldPauseOutboundVideo(clientId);
    const shouldDegrade = this.shouldDegradeOutboundVideo(clientId);
    const pauseUnchanged = this.outboundVideoPaused.get(clientId) === shouldPause;
    const degradeUnchanged = this.outboundVideoDegraded.get(clientId) === shouldDegrade;
    if (pauseUnchanged && degradeUnchanged) return;
    const sender = pc.getSenders().find((candidate) => candidate.track?.kind === 'video') ?? this.videoSenders.get(clientId);
    if (sender && !pauseUnchanged) {
      try {
        await setVideoSenderActive(sender, !shouldPause, shouldDegrade);
      } catch {
        await this.replaceVideoSenderFallback(clientId, sender, shouldPause);
      }
    }
    await this.applySenderBandwidthPreferences(pc, clientId);
    this.outboundVideoPaused.set(clientId, shouldPause);
    this.outboundVideoDegraded.set(clientId, shouldDegrade);
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

  private async applySenderBandwidthPreferences(pc: RTCPeerConnection, clientId?: string): Promise<void> {
    const degradeVideo = clientId ? this.shouldDegradeOutboundVideo(clientId) : false;
    await Promise.all(
      pc.getSenders().map(async (sender) => {
        const kind = sender.track?.kind;
        if (kind !== 'audio' && kind !== 'video') return;
        await this.applySenderPreference(sender, kind, degradeVideo);
      }),
    );
  }

  private async applySenderPreference(sender: RTCRtpSender, kind: 'audio' | 'video', degradeVideo = false): Promise<void> {
    try {
      await setSenderBandwidthPreference(sender, kind, degradeVideo);
    } catch (err) {
      console.debug(`[webrtc] ${kind} sender bandwidth preference unavailable`, err);
    }
  }

  private shouldPauseOutboundVideo(clientId: string): boolean {
    if (this.localScreenShareActive) return false;
    return this.manualAudioOnly() || this.remotePauseRequests.has(clientId) || this.shareCameraSuppressed;
  }

  private shouldDegradeOutboundVideo(clientId: string): boolean {
    return !this.shouldPauseOutboundVideo(clientId) && (this.remoteDegradeRequests.has(clientId) || this.isRemoteMobile(clientId) || this.shouldProtectMobileOutboundVideo());
  }

  private isRemoteMobile(clientId: string): boolean {
    const peer = this.peers().get(clientId);
    return !!peer && !peer.isLocal && peer.isMobile;
  }

  private shouldProtectMobileOutboundVideo(): boolean {
    return this.localMobile && this.peerList().length >= MOBILE_PROTECTIVE_VIDEO_PARTICIPANTS;
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

async function setVideoSenderActive(sender: RTCRtpSender, active: boolean, degraded: boolean): Promise<void> {
  const params = sender.getParameters();
  if (!params.encodings?.length) throw new Error('sender encodings unavailable');
  params.encodings = params.encodings.map((encoding) => ({
    ...encoding,
    active,
    priority: 'low',
    networkPriority: 'low',
    ...videoEncodingLimits(degraded),
  }));
  await sender.setParameters(params);
}

async function setSenderBandwidthPreference(sender: RTCRtpSender, kind: 'audio' | 'video', degradeVideo = false): Promise<void> {
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
    Object.assign(next, videoEncodingLimits(degradeVideo));
    return next;
  });
  await sender.setParameters(params);
}

function videoEncodingLimits(degraded: boolean): Pick<RTCRtpEncodingParameters, 'maxBitrate' | 'scaleResolutionDownBy' | 'maxFramerate'> {
  return degraded
    ? {
        maxBitrate: VIDEO_DEGRADED_MAX_BITRATE_BPS,
        scaleResolutionDownBy: VIDEO_DEGRADED_SCALE,
        maxFramerate: VIDEO_DEGRADED_MAX_FRAMERATE,
      }
    : {
        maxBitrate: VIDEO_MAX_BITRATE_BPS,
        scaleResolutionDownBy: VIDEO_NORMAL_SCALE,
        maxFramerate: VIDEO_NORMAL_MAX_FRAMERATE,
      };
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

function isAudioOnlyFloor(input: {
  packetLossPct: number | null;
  jitterMs: number | null;
  rttMs: number | null;
  availableOutgoingBitrateKbps: number | null;
  hasInboundMedia: boolean;
  inboundPacketsReceivedTotal: number;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
}): boolean {
  return (
    input.connectionState === 'failed' ||
    input.connectionState === 'disconnected' ||
    input.iceConnectionState === 'failed' ||
    input.iceConnectionState === 'disconnected' ||
    (input.hasInboundMedia && input.inboundPacketsReceivedTotal === 0) ||
    (input.packetLossPct != null && input.packetLossPct >= AUDIO_ONLY_FLOOR_LOSS_PCT) ||
    (input.rttMs != null && input.rttMs >= AUDIO_ONLY_FLOOR_RTT_MS) ||
    (input.jitterMs != null && input.jitterMs >= AUDIO_ONLY_FLOOR_JITTER_MS) ||
    (input.availableOutgoingBitrateKbps != null && input.availableOutgoingBitrateKbps < AUDIO_ONLY_FLOOR_BITRATE_KBPS)
  );
}

function isPeerConnectionConnected(pc: RTCPeerConnection): boolean {
  return pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed';
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

function inboundVideoInfo(stats: InboundVideoStats | undefined, receiverTrack: MediaStreamTrack | null): DiagnosticsInboundVideo {
  return {
    framesDecoded: stats?.framesDecoded ?? null,
    framesDecodedDelta: stats?.framesDecodedDelta ?? null,
    framesReceived: stats?.framesReceived ?? null,
    framesReceivedDelta: stats?.framesReceivedDelta ?? null,
    freezeCount: stats?.freezeCount ?? null,
    freezeCountDelta: stats?.freezeCountDelta ?? null,
    totalFreezesDuration: stats?.totalFreezesDuration ?? null,
    totalFreezesDurationDelta: stats?.totalFreezesDurationDelta ?? null,
    framesActivelyDecoding: stats?.framesActivelyDecoding ?? null,
    videoExpected: stats?.videoExpected ?? false,
    videoFrozenSamples: stats?.videoFrozenSamples ?? 0,
    noInboundMediaSamples: stats?.noInboundMediaSamples ?? 0,
    videoFrozen: stats?.videoFrozen ?? false,
    noInboundMedia: stats?.noInboundMedia ?? false,
    trackReadyState: receiverTrack?.readyState ?? null,
    trackMuted: receiverTrack?.muted ?? null,
  };
}

function emptyInboundVideoStats(videoExpected: boolean): InboundVideoStats {
  return {
    framesDecoded: null,
    framesDecodedDelta: null,
    framesReceived: null,
    framesReceivedDelta: null,
    freezeCount: null,
    freezeCountDelta: null,
    totalFreezesDuration: null,
    totalFreezesDurationDelta: null,
    framesActivelyDecoding: null,
    videoExpected,
    videoFrozenSamples: 0,
    noInboundMediaSamples: 0,
    videoFrozen: false,
    noInboundMedia: false,
  };
}

function diagnosticLabelsForPeer(
  peer: PeerState,
  outboundAudio: DiagnosticsTrackInfo,
  inboundAudio: DiagnosticsInboundAudio,
  outboundVideo: DiagnosticsTrackInfo,
  inboundVideo: DiagnosticsInboundVideo,
): string[] {
  const labels = new Set<string>();
  if (inboundVideo.videoFrozen) labels.add('video-frozen');
  if (inboundVideo.noInboundMedia) labels.add('no-inbound-media');
  if (!peer.isLocal && inboundAudio.packetsActivelyArriving === false && (inboundAudio.packetsReceived ?? 0) === 0) labels.add('receiver-zero');
  if (outboundAudio.readyState === 'ended' || outboundVideo.readyState === 'ended' || inboundAudio.trackReadyState === 'ended' || inboundVideo.trackReadyState === 'ended') {
    labels.add('track-ended');
  }
  return [...labels];
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

function createPeerForensics(pc: RTCPeerConnection): PeerForensics {
  return {
    ...createEmptyForensics(),
    lastConnectionState: pc.connectionState,
    lastIceConnectionState: pc.iceConnectionState,
    lastIceGatheringState: pc.iceGatheringState,
    lastSignalingState: pc.signalingState,
  };
}

function createEmptyForensics(): PeerForensics {
  return {
    candidatePair: null,
    candidatePairCount: 0,
    selectedPairId: null,
    nominatedPairChanges: 0,
    iceRelayGathered: { local: false, remote: false },
    iceRestart: {
      fired: false,
      attempts: 0,
      lastAttemptAt: null,
      lastOutcome: null,
      lastTimeToRecoverMs: null,
      terminalFailed: false,
      autoRecoveryOutcome: null,
    },
    negotiation: {
      negotiationNeededCount: 0,
      offerSentCount: 0,
      answerSentCount: 0,
      offerReceivedCount: 0,
      answerReceivedCount: 0,
      makingOffer: false,
      ignoreOffer: false,
      glareIgnoredCount: 0,
      rollbackCount: 0,
    },
    transitionTimeline: [],
    lastConnectionState: null,
    lastIceConnectionState: null,
    lastIceGatheringState: null,
    lastSignalingState: null,
  };
}

function readCandidatePairForensics(stats: RTCStatsReport): {
  candidatePair: DiagnosticsCandidatePair | null;
  candidatePairCount: number;
  localRelayGathered: boolean;
  remoteRelayGathered: boolean;
} {
  let selectedPair: (RTCStats & Record<string, unknown>) | null = null;
  let fallbackPair: (RTCStats & Record<string, unknown>) | null = null;
  let candidatePairCount = 0;
  let localRelayGathered = false;
  let remoteRelayGathered = false;

  for (const rawReport of stats.values()) {
    const report = rawReport as RTCStats & Record<string, unknown>;
    if (report.type === 'local-candidate' && report['candidateType'] === 'relay') localRelayGathered = true;
    if (report.type === 'remote-candidate' && report['candidateType'] === 'relay') remoteRelayGathered = true;
    if (report.type === 'transport' && report['selectedCandidatePairId']) {
      const pair = stats.get(String(report['selectedCandidatePairId'])) as (RTCStats & Record<string, unknown>) | undefined;
      if (pair) selectedPair = pair;
    }
    if (report.type === 'candidate-pair') {
      candidatePairCount += 1;
      if (report['selected']) selectedPair = report;
      if (!fallbackPair && report['state'] === 'succeeded') fallbackPair = report;
    }
  }

  const pair = selectedPair ?? fallbackPair;
  if (!pair) return { candidatePair: null, candidatePairCount, localRelayGathered, remoteRelayGathered };
  const local = pair['localCandidateId'] ? (stats.get(String(pair['localCandidateId'])) as (RTCStats & Record<string, unknown>) | undefined) : undefined;
  const remote = pair['remoteCandidateId'] ? (stats.get(String(pair['remoteCandidateId'])) as (RTCStats & Record<string, unknown>) | undefined) : undefined;
  const candidatePair: DiagnosticsCandidatePair = {
    id: stringOrNull(pair.id),
    state: stringOrNull(pair['state']),
    selected: pair === selectedPair || pair['selected'] === true,
    nominated: pair['nominated'] === true,
    local: candidateInfo(local),
    remote: candidateInfo(remote),
  };
  return { candidatePair, candidatePairCount, localRelayGathered, remoteRelayGathered };
}

function candidateInfo(report: (RTCStats & Record<string, unknown>) | undefined): DiagnosticsCandidatePair['local'] {
  if (!report) return null;
  return {
    id: stringOrNull(report.id),
    candidateType: stringOrNull(report['candidateType']),
    protocol: stringOrNull(report['protocol'] ?? report['relayProtocol']),
    address: stringOrNull(report['address'] ?? report['ip']),
    port: typeof report['port'] === 'number' ? report['port'] : null,
  };
}

function selectedCandidateTypeFromStats(stats: RTCStatsReport): string | null {
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

function candidateTypeFromCandidateLine(candidate: string | undefined): string | null {
  if (!candidate) return null;
  const match = / typ ([a-zA-Z0-9-]+)/.exec(candidate);
  return match?.[1] ?? null;
}

function candidatePairSummary(pair: DiagnosticsCandidatePair): string {
  const local = pair.local ? `${pair.local.candidateType || '?'}:${pair.local.protocol || '?'}` : 'local ?';
  const remote = pair.remote ? `${pair.remote.candidateType || '?'}:${pair.remote.protocol || '?'}` : 'remote ?';
  return `${local} -> ${remote}; state=${pair.state || '?'}; nominated=${pair.nominated ? 'yes' : 'no'}`;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function trimToLast<T>(items: T[], max: number): void {
  if (items.length > max) items.splice(0, items.length - max);
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
