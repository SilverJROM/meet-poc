import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, HostListener, OnDestroy, Signal, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { micOffOutline, micOutline, videocamOffOutline, videocamOutline } from 'ionicons/icons';
import { ControlsBarComponent } from '../../components/controls-bar/controls-bar.component';
import { DeviceDialogComponent } from '../../components/device-dialog/device-dialog.component';
import { LeaveDialogComponent } from '../../components/leave-dialog/leave-dialog.component';
import { MeetingEndedToastComponent } from '../../components/meeting-ended-toast/meeting-ended-toast.component';
import { KnockSpinnerComponent } from '../../components/knock-spinner/knock-spinner.component';
import { LobbyPreviewComponent } from '../../components/lobby-preview/lobby-preview.component';
import { Knocker, ParticipantSidebarComponent } from '../../components/participant-sidebar/participant-sidebar.component';
import { RecordingBannerComponent } from '../../components/recording-banner/recording-banner.component';
import { TileComponent } from '../../components/tile/tile.component';
import { ActiveSpeakerService } from '../../services/active-speaker.service';
import { AuthService } from '../../services/auth.service';
import { MediaError, MediaService } from '../../services/media.service';
import { MeetingSessionsService } from '../../services/meeting-sessions.service';
import type { DiagnosticsPayload, DiagnosticsPeerSample } from '../../services/meeting-sessions.service';
import { IceConfigService } from '../../services/ice-config.service';
import { PlatformService } from '../../services/platform.service';
import { ParticipantSnapshot, RecorderService } from '../../services/recorder.service';
import { RemoteAudioService } from '../../services/remote-audio.service';
import { RoomsService } from '../../services/rooms.service';
import { ViewportService } from '../../services/viewport.service';
import { SignalingMessage, WsService } from '../../services/ws.service';
import { WebrtcService, type PeerState } from '../../services/webrtc.service';
import { SfuClientService, type LocalPublishState } from '../../services/sfu-client.service';

const DIAGNOSTICS_LOG_INTERVAL_MS = 7_500;
const DIAGNOSTICS_EVENT_THROTTLE_MS = 2_000;
const DIAGNOSTICS_LOGGING_STORAGE_KEY = 'meet-poc.diagnosticsLogging';
const LOCAL_TRACK_MUTE_DEBOUNCE_MS = 1_200;
const DEVICE_RECOVERY_MAX_ATTEMPTS = 3;
const DEVICE_RECOVERY_BACKOFF_MS = 650;

type RoomState = 'checking' | 'not-found' | 'lobby' | 'connecting' | 'waiting-room' | 'knocking' | 'in-call' | 'rejected' | 'error';
type BufferedSignal = { from: string; data: unknown };
type ChatMessage = { id: string; clientId: string; sender: string; text: string; sentAt: number; mine: boolean };
type LobbyError =
  | { kind: 'denied' }
  | { kind: 'no-devices' }
  | { kind: 'video-denied-but-audio-ok' }
  | { kind: 'unknown'; message: string };

@Component({
  selector: 'app-room',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    FormsModule,
    RouterLink,
    ControlsBarComponent,
    DeviceDialogComponent,
    LeaveDialogComponent,
    MeetingEndedToastComponent,
    KnockSpinnerComponent,
    LobbyPreviewComponent,
    ParticipantSidebarComponent,
    RecordingBannerComponent,
    TileComponent,
  ],
  templateUrl: './room.page.html',
  styleUrl: './room.page.scss',
})
export class RoomPage implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  private readonly rooms = inject(RoomsService);
  private readonly meetingSessions = inject(MeetingSessionsService);
  private readonly ws = inject(WsService);
  private readonly iceConfig = inject(IceConfigService);
  readonly media = inject(MediaService);
  readonly recorder = inject(RecorderService);
  readonly webrtc = inject(WebrtcService);
  readonly activeSpeaker = inject(ActiveSpeakerService);
  private readonly remoteAudio = inject(RemoteAudioService);
  private readonly platform = inject(PlatformService);
  private readonly viewport = inject(ViewportService);
  readonly sfuClient = inject(SfuClientService);

  readonly roomKey = this.route.snapshot.paramMap.get('slug') ?? this.route.snapshot.paramMap.get('id') ?? '';
  roomId = this.roomKey;
  readonly roomSlug = signal('');
  readonly roomOpen = signal(false);
  readonly state = signal<RoomState>('checking');
  readonly roomTitle = signal('Checking room...');
  readonly displayName = signal('');
  readonly nameError = signal<string | null>(null);
  readonly microphoneRequested = signal(true);
  readonly cameraRequested = signal(false);
  readonly localStream = this.media.localStream;
  readonly audioInputs = signal<MediaDeviceInfo[]>([]);
  readonly audioOutputs = signal<MediaDeviceInfo[]>([]);
  readonly videoInputs = signal<MediaDeviceInfo[]>([]);
  readonly selectedAudioId = signal(readStoredDevice(DEVICE_STORAGE.audioInput));
  readonly selectedAudioOutputId = signal(readStoredDevice(DEVICE_STORAGE.audioOutput));
  readonly selectedVideoId = signal(readStoredDevice(DEVICE_STORAGE.videoInput));
  private readonly videoDevicePinned = signal(!!readStoredDevice(DEVICE_STORAGE.videoInput));
  readonly currentFacingMode = signal<'user' | 'environment'>('user');
  readonly lobbyDeviceDialogOpen = signal(true);
  readonly devicePermissionIntro = signal(true);
  readonly inCallDeviceDialogOpen = signal(false);
  readonly deviceDialogBusy = signal(false);
  readonly deviceDialogError = signal<string | null>(null);
  readonly canSelectAudioOutput = signal(canSetSinkId());
  readonly canFlipCamera = computed(() => this.viewport.isMobile() && (this.state() === 'in-call' ? this.media.cameraOn() : this.cameraRequested()));
  readonly iosRemoteAudioMixerEnabled = computed(() => this.platform.isIOS());
  readonly permissionError = signal<LobbyError | null>(null);
  readonly hasBlockingLobbyError = computed(() => {
    const error = this.permissionError();
    return !!error && error.kind !== 'video-denied-but-audio-ok';
  });
  readonly micLevel = signal<Signal<number>>(signal(0).asReadonly());
  readonly error = signal<string | null>(null);
  readonly status = signal('');
  readonly knockingMessage = signal('Asking the host to admit you...');
  readonly waitExpiresAt = signal<number | null>(null);
  readonly waitRemainingSeconds = signal(0);
  readonly deviceFailureNotice = signal<string | null>(null);
  readonly remoteAudioBlocked = signal(false);
  readonly setupWarning = signal<string | null>(null);
  readonly joinPrereqPopout = signal<string | null>(null);
  readonly myId = signal<string | null>(null);
  readonly myParticipantId = signal<string | null>(null);
  readonly hostClientId = signal<string | null>(null);
  readonly isOwner = signal(false);
  readonly isHost = computed(() => this.isOwner() || (!!this.myId() && this.hostClientId() === this.myId()));
  readonly sidebarOpen = signal(false);
  readonly chatOpen = signal(false);
  readonly chatMessages = signal<ChatMessage[]>([]);
  readonly chatDraft = signal('');
  readonly chatUnreadCount = signal(0);
  readonly leaveDialogOpen = signal(false);
  readonly meetingEndedToastOpen = signal(false);
  readonly diagnosticsOpen = signal(false);
  readonly diagnosticsLoggingEnabled = signal(readDiagnosticsLoggingEnabled());
  readonly screenShareHelp = signal<string | null>(null);
  readonly warningDismissed = signal(false);
  readonly knockers = signal<Knocker[]>([]);
  readonly peers = this.webrtc.peerList;
  readonly isSfuMode = signal(this.route.snapshot.queryParamMap.get('sfu') === '1');
  readonly sfuPeers = computed<PeerState[]>(() => {
    const result: PeerState[] = [];
    const localPeer = this.peers().find((p) => p.isLocal);
    if (localPeer) result.push(localPeer);
    const streams = this.sfuClient.remoteStreams();
    for (const [clientId, publisher] of this.sfuClient.remotePublishers()) {
      const stream = streams.get(clientId) ?? null;
      result.push({
        id: clientId,
        participantId: publisher.participantId,
        name: clientId,
        pc: null,
        stream,
        connectionState: stream ? 'connected' : 'connecting',
        iceConnectionState: 'connected',
        iceGatheringState: 'complete',
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
        isHost: false,
        micEnabled: true,
        camEnabled: !!(stream?.getVideoTracks().length),
        screenOn: false,
        reconnecting: false,
        reconnectingSince: null,
        isMobile: false,
      });
    }
    return result;
  });
  readonly shareStripCollapsed = signal(false);
  readonly sharingPeer = computed(() => this.peers().find((peer) => peer.screenOn) ?? null);
  readonly shareLayoutActive = computed(() => !!this.sharingPeer());
  readonly anyScreenShareActive = computed(() => this.media.screenOn() || this.peers().some((peer) => peer.screenOn));
  readonly effectiveCameraOn = computed(() => this.media.cameraOn() && this.cameraVisibleDuringCurrentShare());
  readonly shareStream = computed(() => {
    const peer = this.sharingPeer();
    if (!peer) return null;
    return peer.isLocal ? this.media.screenStream() : peer.stream;
  });
  readonly orderedStripPeers = computed(() => this.peers());
  readonly showPeerWarning = computed(() => this.peers().length >= 6 && !this.warningDismissed());
  readonly weakAudioOnlyPeers = computed(() => this.peers().filter((peer) => !peer.isLocal && peer.audioOnlyReason === 'auto-poor'));
  readonly hostRecording = signal(false);
  readonly recordingStartedAt = signal<number | null>(null);
  readonly currentSessionId = signal<string | null>(null);
  readonly actionNotice = signal<string | null>(null);
  private readonly callStartMs = signal<number | null>(null);
  private readonly clockTick = signal(0);
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  private visibilityListenerInstalled = false;
  private camOnBeforeBackground = false;
  private preflightTimer: ReturnType<typeof setTimeout> | null = null;
  private waitingRoomTimer: ReturnType<typeof setInterval> | null = null;
  private diagnosticsLogTimer: ReturnType<typeof setInterval> | null = null;
  private lastDiagnosticsEventAt = 0;
  private diagnosticsLogInFlight = false;
  private shareCameraActive = false;
  private shareCameraPreShareOn: boolean | null = null;
  private readonly shareCameraManualOverride = signal(false);
  private shareCameraSyncRun = 0;
  private readonly pendingSignals = new Map<string, BufferedSignal[]>();
  private readonly reconnectToken = signal<string | null>(readReconnectToken(this.roomKey));
  private signalingResyncCount = 0;
  private pendingListInitialized = false;
  private lastDoorbellAt = 0;
  private deviceChangeListenerInstalled = false;
  private audioRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private videoRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private audioRecoveryInFlight = false;
  private videoRecoveryInFlight = false;
  private readonly displayNameInput = viewChild<ElementRef<HTMLInputElement>>('displayNameInput');
  private readonly chatMessageList = viewChild<ElementRef<HTMLElement>>('chatMessageList');
  private readonly remoteAudioMixer = viewChild<ElementRef<HTMLAudioElement>>('remoteAudioMixer');
  readonly formattedElapsed = computed(() => {
    this.clockTick();
    const start = this.callStartMs();
    if (!start) return '0:00';
    const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  });

  constructor() {
    addIcons({ micOffOutline, micOutline, videocamOffOutline, videocamOutline });
    this.installPageLifecycleCleanup();
    this.installDeviceChangeHandler();
    void this.bootstrap();
    effect(() => {
      const debug: NonNullable<Window['__meetDebug']> = {
        localStream: this.media.localStream(),
        peers: this.peers().map((peer) => {
          const audio = peer.stream?.getAudioTracks()[0];
          return {
            id: peer.id,
            participantId: peer.participantId,
            name: peer.name,
            state: peer.connectionState,
            reconnecting: peer.reconnecting,
            audioMuted: audio?.muted,
            audioReadyState: audio?.readyState,
            audioEnabled: audio?.enabled,
            micEnabled: peer.micEnabled,
            camEnabled: peer.camEnabled,
            screenOn: peer.screenOn,
            quality: peer.quality,
            audioOnlyReason: peer.audioOnlyReason,
            isMobile: peer.isMobile,
          };
        }),
        shareLayoutActive: this.shareLayoutActive(),
        shareStripCollapsed: this.shareStripCollapsed(),
        anyScreenShareActive: this.anyScreenShareActive(),
        effectiveCameraOn: this.effectiveCameraOn(),
        shareCameraManualOverride: this.shareCameraManualOverride(),
        isRecording: this.recorder.isRecording() || this.hostRecording(),
        screenShareAttempts: this.media.screenShareAttempts(),
        lastVideoConstraints: this.media.lastVideoConstraints(),
        audioContextActivated: this.media.audioContextActivated(),
        speakerTestCount: window.__meetDebug?.speakerTestCount ?? 0,
        doorbellCount: window.__meetDebug?.doorbellCount ?? 0,
        waitingKnockers: this.knockers().map((knocker) => ({ ...knocker })),
        diagnostics: this.webrtc.diagnostics(),
        forceRelay: this.webrtc.forceRelay(),
        manualAudioOnly: this.webrtc.manualAudioOnly(),
        lastPeerConnectionPolicy: this.webrtc.lastPeerConnectionPolicy(),
        lastPeerConnectionConfig: this.webrtc.lastPeerConnectionConfig(),
        wsConnected: this.ws.connected(),
        wsStatus: this.ws.status(),
        wsReconnectAttempts: this.ws.reconnectAttempts(),
        wsResyncCount: this.signalingResyncCount,
        reconnectTokenPresent: !!this.reconnectToken(),
        myClientId: this.myId(),
        myParticipantId: this.myParticipantId(),
        roomState: this.state(),
        diagnosticsLoggingEnabled: this.diagnosticsLoggingEnabled(),
        waitingRemainingSeconds: this.waitRemainingSeconds(),
        localAudioTrackId: this.media.localStream()?.getAudioTracks()[0]?.id,
        localVideoTrackId: this.media.localStream()?.getVideoTracks()[0]?.id,
        currentFacingMode: this.currentFacingMode(),
        lastRecordingMime: this.recorder.lastRecordingMime(),
        lastRecordingExtension: this.recorder.lastRecordingExtension(),
        lastRecorderTimeslice: this.recorder.lastRecorderTimeslice(),
        lastRecordingUpload: this.recorder.lastUpload(),
        lastMetadataUpload: this.recorder.lastMetadataUpload(),
        metadataWarning: this.recorder.metadataWarning(),
        recorderSourceCount: this.recorder.sourceCount(),
        activeSpeakerHz: this.activeSpeaker.activeSpeakerHz(),
        activeSpeakerId: this.activeSpeaker.activePeerId(),
        activeSpeakerAnalyzerCount: this.activeSpeaker.analyzerCount(),
        activeSpeakerLastMaxRms: this.activeSpeaker.lastMaxRms(),
        activeSpeakerContextState: this.activeSpeaker.contextState(),
        remoteAudioMixer: this.remoteAudio.debugSnapshot(),
        peerConnectionStates: () =>
          this.peers()
            .filter((peer) => !peer.isLocal && peer.pc)
            .map((peer) => ({
              id: peer.id,
              state: peer.pc?.connectionState ?? peer.connectionState,
              iceConnectionState: peer.pc?.iceConnectionState ?? peer.iceConnectionState,
              iceGatheringState: peer.pc?.iceGatheringState ?? peer.iceGatheringState,
              signalingState: peer.pc?.signalingState ?? peer.signalingState,
              selectedCandidateType: peer.selectedCandidateType,
            })),
        remoteMedia: () =>
          this.peers()
            .filter((peer) => !peer.isLocal)
            .map((peer) => ({
              id: peer.id,
              isMobile: peer.isMobile,
              audioTracks: peer.stream?.getAudioTracks().length ?? 0,
              videoTracks: peer.stream?.getVideoTracks().length ?? 0,
              hasVideoSrcObject: !!peer.stream?.getVideoTracks().length,
              hasRemoteAudioElement: !!document.querySelector(`article.tile[data-peer="${peer.id}"] audio[data-remote-audio]`),
              hasRemoteAudioMixer: !!document.querySelector('audio[data-remote-audio-mixer]'),
              remoteAudioUsesPeerStream:
                (document.querySelector(`article.tile[data-peer="${peer.id}"] audio[data-remote-audio]`) as HTMLAudioElement | null)?.srcObject === peer.stream,
            })),
        isMobile: () => this.viewport.isMobile(),
        isIOS: () => this.platform.isIOS(),
        isAndroid: () => this.platform.isAndroid(),
        closeSignalingForTest: () => this.ws.debugDropForReconnect(),
        sampleConnectionQualityForTest: (quality?: 'good' | 'weak' | 'poor' | 'critical') => this.webrtc.sampleQualityNowForTest(quality),
        senderSnapshot: () => this.webrtc.debugSenderSnapshot(),
        sfuPublishState: this.sfuClient.localPublishState(),
        sfuRemoteStreams: this.sfuClient.remoteStreams(),
      };
      if (window.location.hostname === 'localhost') {
        debug.diagnosticSnapshot = () => this.webrtc.diagnosticSnapshot();
        debug.injectActiveSpeakerStream = (id: string, stream: MediaStream) => this.activeSpeaker.injectDebugStream(id, stream);
        debug.forceActiveSpeakerForTest = (id: string | null) => this.activeSpeaker.forceActivePeerForTest(id);
        debug.markPeerReconnectingForTest = (id: string) => this.webrtc.markPeerReconnecting(id);
        debug.markPeerRecoveredForTest = (id: string) => this.webrtc.debugMarkPeerRecoveredForTest(id);
        debug.forceTerminalRecoveryForTest = (id?: string) => this.webrtc.debugForceTerminalRecoveryForTest(id);
        debug.forceNegotiationDeadlockForTest = (id?: string) => this.webrtc.debugForceNegotiationDeadlockForTest(id);
        debug.recoverySnapshot = (id?: string) => this.webrtc.debugRecoverySnapshot(id);
        debug.replaceRemoteAudioTrackForTest = (id: string) => this.replaceRemoteAudioTrackForTest(id);
        debug.sfuGetStats = () => this.sfuClient.getStats();
      }
      window.__meetDebug = debug;
    });
    effect(() => {
      this.activeSpeaker.observe(this.peers());
    });
    effect(() => {
      this.remoteAudio.attachOutputElement(this.remoteAudioMixer()?.nativeElement ?? null);
    });
    effect(() => {
      this.remoteAudio.syncPeers(this.peers());
      if (this.state() !== 'in-call') return;
      window.setTimeout(() => {
        void this.unlockAudioFromGesture(false).catch((err) => console.debug('[media] remote audio sync failed', err));
      }, 0);
    });
    effect(() => {
      this.webrtc.setActiveSpeakerPeer(this.activeSpeaker.activeFrame().id);
    });
    effect(() => {
      void this.syncShareCameraCut(this.anyScreenShareActive(), this.media.screenOn(), this.shareCameraManualOverride());
    });
    effect(() => {
      const deviceId = this.selectedAudioOutputId();
      this.peers();
      if (this.state() !== 'in-call' || !deviceId) return;
      window.setTimeout(() => {
        void this.applySpeakerDevice(deviceId).catch((err) => console.debug('[devices] speaker routing refresh failed', err));
      }, 0);
    });
    // SFU subscribe: react to remotePublishers changes, but only after local publish is done.
    // The sfu-roster can arrive mid-admitted handler (between awaits) before sfuClient.publish()
    // is called, so we guard on 'published' status and let the effect re-fire when it transitions.
    effect(() => {
      if (!this.isSfuMode()) return;
      if (this.sfuClient.localPublishState()?.status !== 'published') return;
      const publishers = this.sfuClient.remotePublishers();
      const myId = this.myId();
      for (const [clientId, publisher] of publishers) {
        if (clientId === myId) continue;
        this.sfuClient.subscribeIfNeeded(publisher);
      }
    });
    effect(() => {
      const activePeerIds = new Set<string>();
      for (const peer of this.peers()) {
        if (peer.isLocal) continue;
        activePeerIds.add(peer.id);
        this.recorder.addPeerStream(peer.id, peer.stream);
      }
      for (const peer of this.peers()) {
        if (!peer.isLocal && !activePeerIds.has(peer.id)) this.recorder.removePeerStream(peer.id);
      }
    });
  }

  async bootstrap(): Promise<void> {
    await this.auth.checkSession();
    const user = this.auth.user();
    if (user && !this.displayName()) this.displayName.set(user.email.split('@')[0] || user.email);
    try {
      const info = await this.rooms.exists(this.roomKey);
      if (!info.exists) {
        this.roomTitle.set('Room not found');
        this.state.set('not-found');
        return;
      }
      this.roomId = info.id ?? this.roomKey;
      this.roomSlug.set(info.slug ?? this.roomId);
      this.roomTitle.set(info.title ?? 'Untitled room');
      this.roomOpen.set(!!info.isOpen);
      this.state.set('lobby');
      this.prepareLobbyDeviceCheck();
    } catch {
      this.error.set('Room could not be loaded');
      this.state.set('error');
    }
  }

  async join(): Promise<void> {
    const name = this.displayName().trim();
    if (this.state() === 'connecting') return;

    const initialMissing = this.missingJoinPrereqs();
    if (initialMissing.includes('name')) {
      this.showJoinPrereqPopout(initialMissing);
      return;
    }

    await this.unlockAudioFromGesture(false);
    if (!this.hasMicAccess()) await this.startLobbyPreflight();
    const missing = this.missingJoinPrereqs();
    if (missing.length > 0) {
      this.showJoinPrereqPopout(missing);
      return;
    }

    await this.unlockAudioFromGesture(false);
    this.joinPrereqPopout.set(null);
    this.nameError.set(null);
    this.error.set(null);
    this.status.set('Connecting...');
    this.state.set('connecting');
    if (!this.media.localStream()) {
      await this.startLobbyPreflight();
    }
    if (!this.media.localStream()) {
      this.state.set('lobby');
      return;
    }
    await this.ensureSelectedAudioDevice('join');
    if (!this.media.localStream()) {
      this.state.set('lobby');
      return;
    }
    this.applyLobbyMicPreference();
    await this.checkIceConfigForJoin();
    this.ws.connect(
      this.roomId,
      (msg) => void this.handleMessage(msg),
      () => this.resyncSignalingState(name),
      () => {
        if (this.state() !== 'in-call') {
          this.error.set('Signaling connection error.');
          this.state.set('lobby');
        } else {
          this.status.set('Disconnected from signaling.');
          this.queueDiagnosticsLog('error', 'signaling disconnected');
        }
      },
    );
  }

  updateDisplayName(value: string): void {
    this.displayName.set(value);
    if (value.trim()) {
      this.nameError.set(null);
      if (this.joinPrereqPopout()?.includes('name')) this.joinPrereqPopout.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  dismissJoinPrereqPopout(): void {
    this.joinPrereqPopout.set(null);
  }

  cancelKnock(): void {
    this.stopWaitingRoomCountdown();
    this.ws.close();
    this.media.stopLocal();
    this.state.set('lobby');
    this.status.set('');
    this.error.set(null);
    void this.startLobbyPreflight();
  }

  async retryPreflight(): Promise<void> {
    await this.startLobbyPreflight();
  }

  async continueDeviceSetup(): Promise<void> {
    await this.startLobbyPreflight();
  }

  async toggleLobbyDeviceDialog(): Promise<void> {
    this.lobbyDeviceDialogOpen.update((open) => !open);
    this.devicePermissionIntro.set(false);
    if (this.lobbyDeviceDialogOpen()) {
      this.deviceDialogError.set(null);
      await this.refreshDevices();
    }
  }

  async setLobbyMicEnabled(value: boolean): Promise<void> {
    this.microphoneRequested.set(value);
    const stream = this.media.localStream();
    if (!stream) {
      await this.startLobbyPreflight();
      return;
    }
    this.applyLobbyMicPreference(stream);
  }

  async setCameraRequested(value: boolean): Promise<void> {
    this.cameraRequested.set(value);
    if (this.state() === 'lobby') await this.reacquireLobbyStream();
  }

  async changeAudioDevice(deviceId: string): Promise<void> {
    this.selectedAudioId.set(deviceId);
    storeDevice(DEVICE_STORAGE.audioInput, deviceId);
    if (this.state() === 'in-call') {
      await this.replaceInCallAudio(deviceId);
      return;
    }
    await this.reacquireLobbyStream();
  }

  async changeVideoDevice(deviceId: string): Promise<void> {
    this.selectedVideoId.set(deviceId);
    this.videoDevicePinned.set(!!deviceId);
    storeDevice(DEVICE_STORAGE.videoInput, deviceId);
    if (this.state() === 'in-call') {
      await this.replaceInCallVideo(deviceId);
      return;
    }
    await this.reacquireLobbyStream();
  }

  async changeAudioOutputDevice(deviceId: string): Promise<void> {
    this.selectedAudioOutputId.set(deviceId);
    storeDevice(DEVICE_STORAGE.audioOutput, deviceId);
    await this.applySpeakerDevice(deviceId);
  }

  handleRemoteAudioBlocked(): void {
    if (this.state() === 'in-call') this.remoteAudioBlocked.set(true);
  }

  async enableRemoteAudio(): Promise<void> {
    await this.unlockAudioFromGesture(true);
  }

  async testSpeaker(): Promise<void> {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 440;
    gain.gain.value = 0.2;
    oscillator.connect(gain);
    gain.connect(context.destination);
    await context.resume();
    oscillator.start();
    if (window.__meetDebug) window.__meetDebug.speakerTestCount = (window.__meetDebug.speakerTestCount ?? 0) + 1;
    window.setTimeout(() => {
      oscillator.stop();
      void context.close();
    }, 1000);
  }

  openInCallDeviceDialog(): void {
    this.deviceDialogError.set(null);
    this.inCallDeviceDialogOpen.set(true);
    void this.refreshDevices();
  }

  async enableMicPreview(): Promise<void> {
    await this.media.activateMicPreview(this.localStream());
  }

  async flipCamera(): Promise<void> {
    const videoEnabled = this.state() === 'in-call' ? this.media.cameraOn() : this.cameraRequested();
    if (!this.viewport.isMobile() || !videoEnabled) return;
    this.videoDevicePinned.set(false);
    this.selectedVideoId.set('');
    storeDevice(DEVICE_STORAGE.videoInput, '');
    this.currentFacingMode.update((mode) => (mode === 'user' ? 'environment' : 'user'));
    if (this.state() === 'in-call') {
      await this.replaceInCallVideo('');
      return;
    }
    await this.reacquireLobbyStream();
  }

  async toggleMic(): Promise<void> {
    const mic = this.media.toggleMic();
    this.updateLocalMediaState();
    this.broadcastMediaState(mic, this.media.cameraOn());
  }

  async toggleCamera(): Promise<void> {
    if (this.anyScreenShareActive()) {
      await this.toggleCameraDuringShare();
      return;
    }
    try {
      const cam = await this.media.toggleCamera((track) => this.webrtc.replaceVideoTrack(track), {
        videoDeviceId: this.selectedVideoDeviceIdForRequest(),
        facingMode: this.videoFacingModeForRequest(true),
      });
      this.updateLocalMediaState();
      this.broadcastMediaState(this.media.micOn(), cam);
    } catch (err) {
      this.status.set(`Camera access failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async toggleScreen(): Promise<void> {
    try {
      await this.media.toggleScreen((track) => this.webrtc.replaceVideoTrack(track));
      this.screenShareHelp.set(null);
      this.updateLocalMediaState();
      this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
      this.status.set(this.media.screenOn() ? 'Screen sharing.' : 'Screen sharing stopped.');
    } catch (err) {
      if (isDisplayMediaPermissionError(err)) {
        this.screenShareHelp.set(
          'Enable Screen Recording for Chrome in macOS System Settings, then fully quit and reopen Chrome with Cmd+Q before sharing again.',
        );
        this.status.set('Screen sharing needs macOS Screen Recording permission.');
        return;
      }
      this.screenShareHelp.set(null);
      this.status.set(`Screen share failed: ${err instanceof Error ? err.message : 'not available'}`);
    }
  }

  private async toggleCameraDuringShare(): Promise<void> {
    if (this.media.screenOn()) {
      this.status.set('Camera stays off while your screen is shared.');
      return;
    }
    try {
      const nextOverride = !this.shareCameraManualOverride();
      this.shareCameraManualOverride.set(nextOverride);
      if (nextOverride) {
        const enabled = await this.media.setCameraTrackEnabled({
          enabled: true,
          videoDeviceId: this.selectedVideoDeviceIdForRequest(),
          facingMode: this.videoFacingModeForRequest(true),
        });
        await this.webrtc.replaceVideoTrack(enabled ? this.media.localStream()?.getVideoTracks()[0] ?? null : null);
        await this.webrtc.setShareCameraPolicy({ suppressCamera: false, localScreenShareActive: false });
        this.status.set('Camera on during screen share.');
      } else {
        await this.media.setCameraTrackEnabled({ enabled: false });
        await this.webrtc.replaceVideoTrack(null);
        await this.webrtc.setShareCameraPolicy({ suppressCamera: true, localScreenShareActive: false });
        this.status.set('Camera hidden during screen share.');
      }
      this.updateLocalMediaState();
      this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
    } catch (err) {
      this.status.set(`Camera access failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async toggleRecording(): Promise<void> {
    if (!this.isHost()) return;
    const localStream = this.media.localStream();
    if (!localStream) return;
    try {
      if (!this.recorder.isRecording()) {
        this.recorder.start(localStream, this.remoteStreams(), {
          sessionId: this.currentSessionId() || '',
          roomId: this.roomId,
          participants: this.participantSnapshot(),
        });
        this.ws.send({ type: 'recording-state', state: 'started' });
        this.status.set('Recording (audio mix: you + admitted peers).');
        return;
      }
      const blob = await this.recorder.stop();
      this.ws.send({ type: 'recording-state', state: 'stopped' });
      this.status.set(`Uploading recording (${Math.round(blob.size / 1024)} KB)...`);
      const upload = await this.recorder.upload(blob, this.roomId);
      this.status.set(`Recording saved: ${upload.file}`);
    } catch (err) {
      this.status.set(`Recording failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      this.recorder.discard();
    }
  }

  admit(clientId: string): void {
    void this.unlockAudioFromGesture(false);
    this.ws.send({ type: 'admit', clientId });
    this.removeKnocker(clientId);
  }

  reject(clientId: string): void {
    this.ws.send({ type: 'reject', clientId });
    this.removeKnocker(clientId);
  }

  muteParticipant(clientId: string): void {
    this.ws.send({ type: 'mute-target', clientId });
  }

  removeParticipant(clientId: string): void {
    this.ws.send({ type: 'remove-peer', clientId });
  }

  toggleSidebar(): void {
    const nextOpen = !this.sidebarOpen();
    this.sidebarOpen.set(nextOpen);
    if (nextOpen) this.chatOpen.set(false);
  }

  toggleChat(): void {
    const nextOpen = !this.chatOpen();
    this.chatOpen.set(nextOpen);
    if (nextOpen) {
      this.sidebarOpen.set(false);
      this.chatUnreadCount.set(0);
      this.scrollChatToBottom();
    }
  }

  toggleDiagnostics(): void {
    this.diagnosticsOpen.update((open) => !open);
  }

  sendChat(event?: Event): void {
    event?.preventDefault();
    const text = this.chatDraft().trim().slice(0, 2000);
    if (!text) {
      this.chatDraft.set('');
      return;
    }
    const id = localMessageId();
    const clientId = this.myId() || 'local';
    const sender = this.displayName().trim() || 'Anon';
    this.appendChatMessage({ id, clientId, sender, text, sentAt: Date.now(), mine: true });
    this.chatDraft.set('');
    this.ws.send({ type: 'chat', text, clientMessageId: id });
  }

  chatTime(sentAt: number): string {
    return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date(sentAt));
  }

  chatDateTime(sentAt: number): string {
    return new Date(sentAt).toISOString();
  }

  async setForceRelay(enabled: boolean): Promise<void> {
    await this.webrtc.setForceRelay(enabled);
    this.status.set(enabled ? 'Force relay enabled. Recreated peer connections through TURN only.' : 'Force relay disabled. Recreated peer connections with default ICE.');
    this.queueDiagnosticsLog('state-change');
  }

  setDiagnosticsLogging(enabled: boolean): void {
    this.diagnosticsLoggingEnabled.set(enabled);
    storeDiagnosticsLoggingEnabled(enabled);
    if (!enabled) {
      this.stopDiagnosticsLogger();
      return;
    }
    if (this.state() === 'in-call' && this.currentSessionId()) {
      this.startDiagnosticsLogger();
      this.queueDiagnosticsLog('sample');
    }
  }

  async toggleAudioOnly(): Promise<void> {
    await this.webrtc.setManualAudioOnly(!this.webrtc.manualAudioOnly());
    this.status.set(this.webrtc.manualAudioOnly() ? 'Audio-only mode on.' : 'Audio-only mode off.');
    this.queueDiagnosticsLog('state-change');
  }

  toggleShareStrip(): void {
    this.shareStripCollapsed.update((collapsed) => !collapsed);
  }

  async leave(): Promise<void> {
    if (this.isHost()) {
      this.leaveDialogOpen.set(true);
      return;
    }
    await this.directLeave(true);
  }

  async justLeave(): Promise<void> {
    this.leaveDialogOpen.set(false);
    await this.directLeave(true);
  }

  async endForAll(): Promise<void> {
    try {
      if (this.recorder.isRecording()) {
        try {
          const blob = await withTimeout(this.recorder.stop(), 8000, null);
          this.ws.send({ type: 'recording-state', state: 'stopped' });
          if (blob) await withTimeout(this.recorder.upload(blob, this.roomId), 8000, null);
        } catch (err) {
          console.warn('[end-for-all] recorder flush failed', err);
        }
      }
      this.ws.send({ type: 'meeting-ended-by-host' });
      await delay(1000);
    } finally {
      this.leaveDialogOpen.set(false);
      await this.directLeave(false);
    }
  }

  async dismissMeetingEnded(): Promise<void> {
    this.meetingEndedToastOpen.set(false);
    await this.directLeave(false);
  }

  private async directLeave(sendLeaveMessage: boolean): Promise<void> {
    this.cleanupCall(sendLeaveMessage);
    await this.router.navigate([this.auth.user() ? '/app/rooms' : '/']);
  }

  ngOnDestroy(): void {
    this.uninstallPageLifecycleCleanup();
    this.uninstallDeviceChangeHandler();
    this.sfuClient.destroy();
    this.cleanupCall();
    delete window.__meetDebug;
  }

  private async handleMessage(msg: SignalingMessage): Promise<void> {
    if (msg.type === 'reconnect-token') {
      this.reconnectToken.set(msg.token);
      storeReconnectToken(this.roomKey, msg.token);
      return;
    }
    if (msg.type === 'knocking') {
      this.stopWaitingRoomCountdown();
      this.myId.set(msg.clientId);
      if (msg.roomTitle) this.roomTitle.set(msg.roomTitle);
      this.state.set('knocking');
      const message = this.roomOpen() ? 'The host is available — please wait to be admitted.' : 'Asking the host to admit you...';
      this.knockingMessage.set(message);
      this.status.set(message);
      return;
    }
    if (msg.type === 'waiting-room') {
      this.myId.set(msg.clientId);
      if (msg.roomTitle) this.roomTitle.set(msg.roomTitle);
      if (msg.isOpen) {
        this.roomOpen.set(true);
        this.stopWaitingRoomCountdown();
        const message = 'The host is available — please wait to be admitted.';
        this.knockingMessage.set(message);
        this.status.set(message);
        this.state.set('knocking');
        return;
      }
      this.error.set(null);
      this.state.set('waiting-room');
      this.status.set("This room hasn't been opened by the host yet.");
      this.startWaitingRoomCountdown(msg.expiresAt);
      return;
    }
    if (msg.type === 'waiting-timeout') {
      this.stopWaitingRoomCountdown();
      this.ws.close();
      this.error.set(msg.message);
      this.state.set('error');
      return;
    }
    if (msg.type === 'rejected') {
      this.cleanupCall();
      this.error.set(msg.reason ? `Host: ${msg.reason}` : 'The host rejected your request.');
      this.state.set('rejected');
      return;
    }
    if (msg.type === 'admitted') {
      const wasInCall = this.state() === 'in-call';
      this.myId.set(msg.clientId);
      this.myParticipantId.set(msg.participantId || null);
      this.isOwner.set(!!msg.isOwner);
      this.currentSessionId.set(msg.sessionId || this.currentSessionId());
      this.recorder.setSessionId(msg.sessionId || this.currentSessionId());
      if (msg.roomTitle) this.roomTitle.set(msg.roomTitle);
      const stream = this.media.localStream();
      if (stream) {
        this.webrtc.configure(stream, (to, data) => this.ws.send({ type: 'signal', to, data }), { isMobile: this.viewport.isMobile() });
        this.hostClientId.set(msg.hostClientId || (msg.isOwner ? msg.clientId : null));
        if (wasInCall) {
          this.pendingSignals.clear();
          this.webrtc.resetRemotePeers();
        }
        this.webrtc.setLocalPeer(msg.clientId, this.displayName().trim() || 'Anon', {
          participantId: msg.participantId,
          isHost: msg.isOwner,
          micEnabled: this.media.micOn(),
          camEnabled: this.media.cameraOn(),
          screenOn: this.media.screenOn(),
        });
      }
      this.state.set('in-call');
      this.installMobileVisibilityPause();
      if (!this.callStartMs()) this.startClock();
      this.status.set(wasInCall ? 'Reconnected to signaling. Syncing peers...' : `You are ${this.displayName().trim() || 'Anon'}${msg.isOwner ? ' (host)' : ''}.`);
      for (const peer of msg.peers) {
        await this.webrtc.addPeer(peer.id, peer.name, true, {
          participantId: peer.participantId,
          isHost: !!peer.host || peer.id === this.hostClientId(),
          isMobile: !!peer.isMobile,
        });
        await this.drainPendingSignals(peer.id);
      }
      this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
      if (this.route.snapshot.queryParamMap.get('sfu') === '1' && msg.participantId && msg.sessionId) {
        void this.sfuClient
          .publish({ clientKey: readClientKey(), participantId: msg.participantId, sessionId: msg.sessionId, localStream: this.media.localStream() })
          .then(() => {
            const state = this.sfuClient.localPublishState();
            if (state?.status === 'published') {
              this.ws.send({
                type: 'sfu-publish',
                cfSessionId: state.cfSessionId,
                tracks: state.tracks.filter((t) => t.status === 'live').map((t) => ({ trackName: t.trackName, kind: t.kind })),
              });
            }
          })
          .catch((err: unknown) => console.error('[sfu-client] publish failed', err));
      }
      this.startDiagnosticsLogger();
      this.queueDiagnosticsLog('state-change');
      if (wasInCall) this.status.set('Reconnected.');
      return;
    }
    if (msg.type === 'pending-list') {
      this.syncKnockers(msg.knockers || []);
      return;
    }
    if (msg.type === 'knock') {
      const wasKnown = this.knockers().some((knocker) => knocker.id === msg.clientId);
      this.upsertKnocker({ id: msg.clientId, name: msg.name });
      if (!wasKnown) this.playDoorbellForNewKnock();
      this.status.set(`${msg.name} is asking to join.`);
      return;
    }
    if (msg.type === 'knock-cancelled') {
      this.removeKnocker(msg.clientId);
      return;
    }
    if (msg.type === 'peer-joined') {
      this.status.set(`${msg.name} joined.`);
      await this.webrtc.addPeer(msg.clientId, msg.name, false, {
        participantId: msg.participantId,
        isHost: !!msg.host || msg.clientId === this.hostClientId(),
        isMobile: !!msg.isMobile,
      });
      this.recorder.notifyParticipantJoined({
        clientId: msg.clientId,
        displayName: msg.name,
        isHost: !!msg.host || msg.clientId === this.hostClientId(),
      });
      await this.drainPendingSignals(msg.clientId);
      this.queueDiagnosticsLog('state-change');
      return;
    }
    if (msg.type === 'peer-reconnecting') {
      this.status.set(`${msg.name} is reconnecting.`);
      this.webrtc.markPeerReconnecting(msg.clientId);
      this.queueDiagnosticsLog('reconnect');
      return;
    }
    if (msg.type === 'peer-resumed') {
      this.status.set(`${msg.name} reconnected.`);
      await this.webrtc.resumePeer(msg.oldClientId, msg.clientId, msg.name, false, {
        participantId: msg.participantId,
        isHost: !!msg.host || msg.clientId === this.hostClientId(),
        isMobile: !!msg.isMobile,
      });
      const queued = this.pendingSignals.get(msg.oldClientId);
      if (queued?.length) {
        this.pendingSignals.delete(msg.oldClientId);
        this.pendingSignals.set(msg.clientId, queued);
      }
      this.recorder.notifyParticipantJoined({
        clientId: msg.clientId,
        displayName: msg.name,
        isHost: !!msg.host || msg.clientId === this.hostClientId(),
      });
      await this.drainPendingSignals(msg.clientId);
      this.queueDiagnosticsLog('reconnect');
      return;
    }
    if (msg.type === 'media-state') {
      const patch = { micEnabled: msg.mic, camEnabled: msg.cam, screenOn: !!msg.screenOn, ...(msg.isMobile === undefined ? {} : { isMobile: !!msg.isMobile }) };
      this.webrtc.updatePeer(msg.clientId, patch);
      this.queueDiagnosticsLog('state-change');
      return;
    }
    if (msg.type === 'chat') {
      if (msg.clientId === this.myId()) return;
      this.appendChatMessage({ ...msg, mine: false });
      if (!this.chatOpen()) this.chatUnreadCount.update((count) => Math.min(99, count + 1));
      return;
    }
    if (msg.type === 'mute-request') {
      this.media.muteMic();
      this.updateLocalMediaState();
      this.broadcastMediaState(false, this.media.cameraOn());
      this.actionNotice.set('Host muted you.');
      return;
    }
    if (msg.type === 'peer-removed') {
      this.actionNotice.set('You were removed by the host.');
      setTimeout(() => {
        void this.directLeave(false);
      }, 600);
      return;
    }
    if (msg.type === 'meeting-ended') {
      this.flushDiagnosticsLog('call-end', { useBeacon: true });
      this.ws.close();
      if (!this.isHost()) {
        this.meetingEndedToastOpen.set(true);
      }
      return;
    }
    if (msg.type === 'recording-started') {
      this.hostRecording.set(true);
      this.recordingStartedAt.set(Date.now());
      this.currentSessionId.set(msg.sessionId || this.currentSessionId());
      this.recorder.setSessionId(msg.sessionId);
      return;
    }
    if (msg.type === 'recording-stopped') {
      this.hostRecording.set(false);
      this.recordingStartedAt.set(null);
      return;
    }
    if (msg.type === 'peer-left') {
      this.recorder.notifyParticipantLeft(msg.clientId);
      this.webrtc.removePeer(msg.clientId);
      this.sfuClient.removePeer(msg.clientId);
      this.pendingSignals.delete(msg.clientId);
      this.removeKnocker(msg.clientId);
      this.queueDiagnosticsLog('state-change');
      return;
    }
    if (msg.type === 'sfu-presence') {
      this.sfuClient.handleSfuPresence(msg);
      return;
    }
    if (msg.type === 'sfu-roster') {
      this.sfuClient.handleSfuRoster(msg.publishers);
      return;
    }
    if (msg.type === 'signal') {
      if (!this.hasPeerConnection(msg.from)) {
        this.bufferSignal(msg);
        return;
      }
      await this.webrtc.handleSignal(msg.from, msg.data);
      return;
    }
    if (msg.type === 'error') {
      this.error.set(msg.error === 'room full' ? 'Room full (max 8)' : msg.error);
      this.state.set(this.state() === 'in-call' ? 'in-call' : 'lobby');
      this.queueDiagnosticsLog('error', msg.error);
    }
  }

  private upsertKnocker(knocker: Knocker): void {
    const next = this.knockers().filter((item) => item.id !== knocker.id);
    next.push(knocker);
    this.knockers.set(next);
  }

  private syncKnockers(knockers: Knocker[]): void {
    const known = new Set(this.knockers().map((knocker) => knocker.id));
    const next = knockers.map((knocker) => ({ id: knocker.id, name: knocker.name }));
    const hasNewKnocker = next.some((knocker) => !known.has(knocker.id));
    const callAgeMs = this.callStartMs() ? Date.now() - this.callStartMs()! : 0;
    const initialSnapshot = !this.pendingListInitialized && callAgeMs < 2000;
    this.knockers.set(next);
    if (hasNewKnocker && !initialSnapshot) this.playDoorbellForNewKnock();
    this.pendingListInitialized = true;
  }

  private removeKnocker(clientId: string): void {
    this.knockers.set(this.knockers().filter((item) => item.id !== clientId));
  }

  private startWaitingRoomCountdown(expiresAt: number | null): void {
    this.stopWaitingRoomCountdown();
    this.waitExpiresAt.set(expiresAt);
    const tick = () => {
      const remaining = expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)) : 0;
      this.waitRemainingSeconds.set(remaining);
    };
    tick();
    this.waitingRoomTimer = setInterval(tick, 1000);
  }

  private stopWaitingRoomCountdown(): void {
    if (this.waitingRoomTimer) clearInterval(this.waitingRoomTimer);
    this.waitingRoomTimer = null;
    this.waitExpiresAt.set(null);
    this.waitRemainingSeconds.set(0);
  }

  private playDoorbellForNewKnock(): void {
    if (!this.isHost()) return;
    const now = Date.now();
    if (now - this.lastDoorbellAt < 1500) return;
    this.lastDoorbellAt = now;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (window.__meetDebug) window.__meetDebug.doorbellCount = (window.__meetDebug.doorbellCount ?? 0) + 1;
    if (!AudioContextCtor) return;
    try {
      const context = new AudioContextCtor();
      const gain = context.createGain();
      const first = context.createOscillator();
      const second = context.createOscillator();
      gain.gain.value = 0.035;
      first.frequency.value = 660;
      second.frequency.value = 880;
      first.connect(gain);
      second.connect(gain);
      gain.connect(context.destination);
      void context.resume();
      first.start();
      first.stop(context.currentTime + 0.11);
      second.start(context.currentTime + 0.13);
      second.stop(context.currentTime + 0.26);
      window.setTimeout(() => {
        void context.close();
      }, 380);
    } catch (err) {
      console.debug('[doorbell] chime failed', err);
    }
  }

  private remoteStreams(): Map<string, MediaStream> {
    const streams = new Map<string, MediaStream>();
    for (const peer of this.peers()) {
      if (!peer.isLocal && peer.stream) streams.set(peer.id, peer.stream);
    }
    return streams;
  }

  private participantSnapshot(): ParticipantSnapshot[] {
    return this.peers().map((peer) => ({
      clientId: peer.id,
      displayName: peer.isLocal ? this.displayName().trim() || peer.name.replace(/\s+\(you\)$/, '') || 'Anon' : peer.name,
      isHost: peer.isHost,
    }));
  }

  private async startLobbyPreflight(): Promise<void> {
    this.clearPreflightTimer();
    this.devicePermissionIntro.set(false);
    this.deviceDialogBusy.set(true);
    this.deviceDialogError.set(null);
    this.permissionError.set(null);
    this.setupWarning.set(null);
    this.error.set(null);
    try {
      const stream = await this.media.preflight({
        audio: true,
        video: this.cameraRequested(),
        audioDeviceId: this.selectedAudioId() || undefined,
        videoDeviceId: this.selectedVideoDeviceIdForRequest(),
        facingMode: this.videoFacingModeForRequest(this.cameraRequested()),
      });
      this.attachLocalTrackFailureHandlers(stream);
      this.applyLobbyMicPreference(stream);
      this.micLevel.set(this.media.getMicLevel(stream));
      await this.refreshDevices();
      await this.ensureSelectedAudioDevice('lobby-preflight');
    } catch (err) {
      await this.handleLobbyMediaError(err, this.cameraRequested());
      this.deviceDialogError.set((err as MediaError).message || 'Device setup failed');
    } finally {
      this.deviceDialogBusy.set(false);
    }
  }

  private async reacquireLobbyStream(): Promise<void> {
    if (this.state() !== 'lobby') return;
    this.clearPreflightTimer();
    this.devicePermissionIntro.set(false);
    this.deviceDialogBusy.set(true);
    this.deviceDialogError.set(null);
    this.permissionError.set(null);
    this.setupWarning.set(null);
    this.error.set(null);
    try {
      const stream = await this.media.reacquire({
        audioDeviceId: this.selectedAudioId() || undefined,
        videoDeviceId: this.selectedVideoDeviceIdForRequest(),
        facingMode: this.videoFacingModeForRequest(this.cameraRequested()),
        video: this.cameraRequested(),
      });
      this.attachLocalTrackFailureHandlers(stream);
      this.applyLobbyMicPreference(stream);
      this.micLevel.set(this.media.getMicLevel(stream));
      await this.refreshDevices();
      await this.ensureSelectedAudioDevice('lobby-reacquire');
    } catch (err) {
      await this.handleLobbyMediaError(err, this.cameraRequested());
      this.deviceDialogError.set((err as MediaError).message || 'Device change failed');
    } finally {
      this.deviceDialogBusy.set(false);
    }
  }

  private prepareLobbyDeviceCheck(): void {
    const manualSetup = this.route.snapshot.queryParamMap.get('manualDeviceSetup') === '1';
    this.lobbyDeviceDialogOpen.set(manualSetup);
    this.devicePermissionIntro.set(manualSetup);
    this.clearPreflightTimer();
    if (manualSetup) return;
    this.preflightTimer = window.setTimeout(() => {
      if (this.state() === 'lobby' && !this.media.localStream()) void this.startLobbyPreflight();
    }, 650);
  }

  private clearPreflightTimer(): void {
    if (this.preflightTimer) clearTimeout(this.preflightTimer);
    this.preflightTimer = null;
  }

  private applyLobbyMicPreference(stream = this.media.localStream()): void {
    const track = stream?.getAudioTracks()[0];
    if (!track) {
      this.media.micOn.set(false);
      return;
    }
    track.enabled = this.microphoneRequested();
    this.media.micOn.set(track.enabled);
  }

  private missingJoinPrereqs(): ('name' | 'mic')[] {
    const missing: ('name' | 'mic')[] = [];
    if (!this.displayName().trim()) missing.push('name');
    if (!this.hasMicAccess()) missing.push('mic');
    return missing;
  }

  private hasMicAccess(): boolean {
    const audioTrack = this.media.localStream()?.getAudioTracks()[0];
    return !!audioTrack && audioTrack.readyState === 'live';
  }

  private showJoinPrereqPopout(missing: ('name' | 'mic')[]): void {
    if (missing.includes('name')) {
      this.nameError.set('Enter your name to join');
      this.displayNameInput()?.nativeElement.focus();
    } else {
      this.nameError.set(null);
    }
    if (missing.includes('name') && missing.includes('mic')) {
      this.joinPrereqPopout.set('Please add your name and enable your microphone');
    } else if (missing.includes('name')) {
      this.joinPrereqPopout.set('Please add your name');
    } else {
      this.joinPrereqPopout.set('Please enable your microphone');
    }
  }

  private async checkIceConfigForJoin(): Promise<void> {
    await this.iceConfig.getIceServers();
    const fetchError = this.iceConfig.lastFetchError();
    this.setupWarning.set(
      fetchError
        ? 'Connection relay configuration could not be loaded. The call will use fallback STUN servers; if joining fails, retry or contact support.'
        : null,
    );
  }

  private async handleLobbyMediaError(err: unknown, videoRequested: boolean): Promise<void> {
    const mediaError = err as MediaError;
    if (videoRequested && mediaError.code === 'denied') {
      try {
        const stream = await this.media.preflight({ audio: true, video: false, audioDeviceId: this.selectedAudioId() || undefined });
        this.cameraRequested.set(false);
        this.permissionError.set({ kind: 'video-denied-but-audio-ok' });
        this.error.set(null);
        this.attachLocalTrackFailureHandlers(stream);
        this.applyLobbyMicPreference(stream);
        this.micLevel.set(this.media.getMicLevel(stream));
        await this.refreshDevices();
        return;
      } catch (fallbackErr) {
        this.permissionError.set(toLobbyError(fallbackErr as MediaError));
        this.error.set((fallbackErr as MediaError).message || 'Media access failed');
        return;
      }
    }
    this.permissionError.set(toLobbyError(mediaError));
    this.error.set(mediaError.message || 'Media access failed');
  }

  private async refreshDevices(): Promise<void> {
    const devices = await this.media.enumerateDevices();
    this.audioInputs.set(devices.audioInputs);
    this.audioOutputs.set(devices.audioOutputs);
    this.videoInputs.set(devices.videoInputs);
    if (!this.selectedAudioId() || !devices.audioInputs.some((device) => device.deviceId === this.selectedAudioId())) {
      this.selectedAudioId.set(preferredDeviceId(DEVICE_STORAGE.audioInput, devices.audioInputs, this.selectedAudioId()));
    }
    if (!this.selectedVideoId() || !devices.videoInputs.some((device) => device.deviceId === this.selectedVideoId())) {
      this.selectedVideoId.set(preferredDeviceId(DEVICE_STORAGE.videoInput, devices.videoInputs, this.selectedVideoId()));
    }
    if (!this.selectedAudioOutputId() || !devices.audioOutputs.some((device) => device.deviceId === this.selectedAudioOutputId())) {
      this.selectedAudioOutputId.set(preferredDeviceId(DEVICE_STORAGE.audioOutput, devices.audioOutputs, this.selectedAudioOutputId()));
    }
  }

  private selectedVideoDeviceIdForRequest(): string | undefined {
    return this.videoDevicePinned() ? this.selectedVideoId() || undefined : undefined;
  }

  private videoFacingModeForRequest(video: boolean): 'user' | 'environment' | undefined {
    return this.viewport.isMobile() && video && !this.selectedVideoDeviceIdForRequest() ? this.currentFacingMode() : undefined;
  }

  private async ensureSelectedAudioDevice(reason: string): Promise<void> {
    const stream = this.media.localStream();
    const selectedDeviceId = this.selectedAudioId();
    if (!stream || !selectedDeviceId) return;
    const currentDeviceId = audioTrackDeviceId(stream.getAudioTracks()[0]);
    if (currentDeviceId === selectedDeviceId) return;

    console.info(`[devices] reconciling selected microphone for ${reason}; selected=${selectedDeviceId} current=${currentDeviceId || 'unknown'}`);
    if (this.state() === 'in-call') {
      await this.replaceInCallAudio(selectedDeviceId);
      return;
    }
    await this.reacquireLobbyAudioDevice(selectedDeviceId);
  }

  private async reacquireLobbyAudioDevice(deviceId: string): Promise<void> {
    try {
      const stream = await this.media.reacquire({
        audioDeviceId: deviceId,
        videoDeviceId: this.selectedVideoDeviceIdForRequest(),
        facingMode: this.videoFacingModeForRequest(this.cameraRequested()),
        video: this.cameraRequested(),
      });
      this.attachLocalTrackFailureHandlers(stream);
      this.applyLobbyMicPreference(stream);
      this.micLevel.set(this.media.getMicLevel(stream));
    } catch (err) {
      console.warn('[devices] selected microphone unavailable; falling back to default audio', err);
      await this.reacquireDefaultLobbyAudio();
    }
  }

  private async reacquireDefaultLobbyAudio(): Promise<void> {
    try {
      const stream = await this.media.reacquire({
        audioDeviceId: undefined,
        videoDeviceId: this.selectedVideoDeviceIdForRequest(),
        facingMode: this.videoFacingModeForRequest(this.cameraRequested()),
        video: this.cameraRequested(),
      });
      this.attachLocalTrackFailureHandlers(stream);
      this.applyLobbyMicPreference(stream);
      this.micLevel.set(this.media.getMicLevel(stream));
      this.syncSelectedAudioIdToTrack(stream.getAudioTracks()[0]);
      this.setupWarning.set('Selected microphone is unavailable. Using the system default microphone.');
    } catch (fallbackErr) {
      await this.handleLobbyMediaError(fallbackErr, this.cameraRequested());
      this.deviceDialogError.set((fallbackErr as MediaError).message || 'Device setup failed');
    }
  }

  private cleanupCall(sendLeaveMessage = false): void {
    if (this.state() === 'in-call') this.flushDiagnosticsLog('call-end', { useBeacon: true });
    this.stopDiagnosticsLogger();
    this.clearLocalTrackRecoveryTimers();
    this.clearPreflightTimer();
    this.stopWaitingRoomCountdown();
    if (sendLeaveMessage && (this.state() === 'in-call' || this.state() === 'knocking' || this.state() === 'waiting-room')) this.ws.send({ type: 'leave' });
    this.ws.close();
    this.recorder.discard();
    this.media.stopLocal();
    this.webrtc.reset();
    this.pendingSignals.clear();
    this.knockers.set([]);
    this.pendingListInitialized = false;
    clearReconnectToken(this.roomKey);
    this.reconnectToken.set(null);
    this.isOwner.set(false);
    this.myId.set(null);
    this.myParticipantId.set(null);
    this.hostClientId.set(null);
    this.currentSessionId.set(null);
    this.sidebarOpen.set(false);
    this.chatOpen.set(false);
    this.chatMessages.set([]);
    this.chatDraft.set('');
    this.chatUnreadCount.set(0);
    this.shareStripCollapsed.set(false);
    this.leaveDialogOpen.set(false);
    this.meetingEndedToastOpen.set(false);
    this.deviceFailureNotice.set(null);
    this.actionNotice.set(null);
    this.screenShareHelp.set(null);
    this.shareCameraActive = false;
    this.shareCameraPreShareOn = null;
    this.shareCameraManualOverride.set(false);
    this.diagnosticsOpen.set(false);
    this.setupWarning.set(null);
    this.nameError.set(null);
    this.hostRecording.set(false);
    this.recordingStartedAt.set(null);
    this.currentFacingMode.set('user');
    this.activeSpeaker.reset();
    this.remoteAudio.reset();
    this.stopClock();
    this.uninstallMobileVisibilityPause();
  }

  private async replaceInCallAudio(deviceId: string): Promise<void> {
    this.deviceDialogBusy.set(true);
    this.deviceDialogError.set(null);
    try {
      const track = await this.media.replaceAudioTrack(deviceId || undefined, (nextTrack) => this.webrtc.replaceLocalSenderTrack('audio', nextTrack));
      if (track) {
        this.attachLocalTrackFailureHandlers(this.media.localStream() ?? new MediaStream([track]));
        this.micLevel.set(this.media.getMicLevel(this.media.localStream() ?? new MediaStream([track])));
        this.updateLocalMediaState();
        this.broadcastMediaState(track.enabled, this.media.cameraOn());
        this.queueDiagnosticsLog('state-change');
      }
    } catch (err) {
      if (deviceId) {
        try {
          const fallbackTrack = await this.media.replaceAudioTrack(undefined, (nextTrack) => this.webrtc.replaceLocalSenderTrack('audio', nextTrack));
          if (fallbackTrack) {
            this.syncSelectedAudioIdToTrack(fallbackTrack);
            this.attachLocalTrackFailureHandlers(this.media.localStream() ?? new MediaStream([fallbackTrack]));
            this.micLevel.set(this.media.getMicLevel(this.media.localStream() ?? new MediaStream([fallbackTrack])));
            this.updateLocalMediaState();
            this.broadcastMediaState(fallbackTrack.enabled, this.media.cameraOn());
            this.queueDiagnosticsLog('state-change', 'selected microphone unavailable; using default audio');
            this.deviceDialogError.set('Selected microphone is unavailable. Using the system default microphone.');
            return;
          }
        } catch (fallbackErr) {
          this.deviceDialogError.set(`Microphone switch failed: ${fallbackErr instanceof Error ? fallbackErr.message : 'unknown error'}`);
          return;
        }
      }
      this.deviceDialogError.set(`Microphone switch failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      this.deviceDialogBusy.set(false);
    }
  }

  private syncSelectedAudioIdToTrack(track: MediaStreamTrack | null | undefined): void {
    const actualDeviceId = audioTrackDeviceId(track);
    this.selectedAudioId.set(actualDeviceId);
    storeDevice(DEVICE_STORAGE.audioInput, actualDeviceId);
  }

  private syncSelectedVideoIdToTrack(track: MediaStreamTrack | null | undefined): void {
    const actualDeviceId = mediaTrackDeviceId(track);
    this.selectedVideoId.set(actualDeviceId);
    this.videoDevicePinned.set(!!actualDeviceId);
    storeDevice(DEVICE_STORAGE.videoInput, actualDeviceId);
  }

  private installDeviceChangeHandler(): void {
    if (this.deviceChangeListenerInstalled || !navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);
    this.deviceChangeListenerInstalled = true;
  }

  private uninstallDeviceChangeHandler(): void {
    if (!this.deviceChangeListenerInstalled || !navigator.mediaDevices?.removeEventListener) return;
    navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange);
    this.deviceChangeListenerInstalled = false;
  }

  private readonly handleDeviceChange = (): void => {
    void this.handleDeviceChangeAsync();
  };

  private async handleDeviceChangeAsync(): Promise<void> {
    try {
      await this.refreshDevices();
      if (this.state() === 'lobby' || this.state() === 'in-call') await this.ensureSelectedAudioDevice('devicechange');
    } catch (err) {
      console.debug('[devices] devicechange handling failed', err);
    }
  }

  private async replaceInCallVideo(deviceId: string): Promise<void> {
    this.deviceDialogBusy.set(true);
    this.deviceDialogError.set(null);
    try {
      const track = await this.media.replaceVideoTrack(
        this.selectedVideoDeviceIdForRequest(),
        (nextTrack) => this.webrtc.replaceLocalSenderTrack('video', nextTrack),
        this.videoFacingModeForRequest(true),
      );
      if (track) {
        this.updateLocalMediaState();
        this.broadcastMediaState(this.media.micOn(), true);
        this.queueDiagnosticsLog('state-change');
      }
    } catch (err) {
      this.deviceDialogError.set(`Camera switch failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      this.deviceDialogBusy.set(false);
    }
  }

  private async applySpeakerDevice(deviceId: string): Promise<void> {
    const mediaElements = Array.from(document.querySelectorAll('video, audio')) as HTMLMediaElement[];
    await Promise.all(
      mediaElements.map(async (element) => {
        const withSink = element as HTMLMediaElement & { setSinkId?: (sinkId: string) => Promise<void> };
        if (withSink.setSinkId) await withSink.setSinkId(deviceId);
      }),
    );
    await this.remoteAudio.applyOutputDevice(deviceId);
  }

  private async unlockAudioFromGesture(showPromptOnFailure: boolean): Promise<boolean> {
    this.activeSpeaker.unlock();
    const micPreviewUnlock = this.media.activateMicPreview().catch((err) => {
      console.debug('[media] mic preview unlock failed', err);
      return false;
    });
    const remoteAudioUnlock = this.remoteAudio.unlockAndPlayRemoteSinks(this.selectedAudioOutputId() || undefined);
    await micPreviewUnlock;
    const allPlayable = await remoteAudioUnlock;
    if (this.state() === 'in-call') this.remoteAudioBlocked.set(!allPlayable);
    else if (showPromptOnFailure && !allPlayable) this.remoteAudioBlocked.set(true);
    return allPlayable;
  }

  private async replaceRemoteAudioTrackForTest(id: string): Promise<{ oldTrackId: string | null; newTrackId: string } | null> {
    const peer = this.peers().find((candidate) => candidate.id === id && !candidate.isLocal);
    if (!peer) return null;
    const remoteStream = peer.stream ?? new MediaStream();
    const oldTrack = remoteStream.getAudioTracks()[0] ?? null;
    const replacement = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const nextTrack = replacement.getAudioTracks()[0];
    if (!nextTrack) return null;
    if (oldTrack) {
      remoteStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    remoteStream.addTrack(nextTrack);
    this.webrtc.updatePeer(id, { stream: remoteStream });
    return { oldTrackId: oldTrack?.id ?? null, newTrackId: nextTrack.id };
  }

  private installPageLifecycleCleanup(): void {
    window.addEventListener('pagehide', this.handlePageLifecycleLeave);
    window.addEventListener('beforeunload', this.handlePageLifecycleLeave);
  }

  private uninstallPageLifecycleCleanup(): void {
    window.removeEventListener('pagehide', this.handlePageLifecycleLeave);
    window.removeEventListener('beforeunload', this.handlePageLifecycleLeave);
  }

  private readonly handlePageLifecycleLeave = (): void => {
    this.cleanupCall();
  };

  private attachLocalTrackFailureHandlers(stream: MediaStream): void {
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.onended = () => this.handleLocalTrackFailure('audio', audioTrack, 'ended');
      audioTrack.onmute = () => this.handleLocalTrackFailure('audio', audioTrack, 'mute');
      audioTrack.onunmute = () => this.clearLocalTrackRecoveryTimer('audio', audioTrack);
    }
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => this.handleLocalTrackFailure('video', videoTrack, 'ended');
      videoTrack.onmute = () => this.handleLocalTrackFailure('video', videoTrack, 'mute');
      videoTrack.onunmute = () => this.clearLocalTrackRecoveryTimer('video', videoTrack);
    }
  }

  private handleLocalTrackFailure(kind: 'audio' | 'video', track: MediaStreamTrack, event: 'ended' | 'mute'): void {
    if (this.state() !== 'in-call' || !this.isCurrentLocalTrack(kind, track)) return;
    this.clearLocalTrackRecoveryTimer(kind);
    if (event === 'mute' && track.readyState === 'live') {
      const timer = window.setTimeout(() => {
        if (!this.isCurrentLocalTrack(kind, track)) return;
        if (track.muted || track.readyState === 'ended') void this.recoverLocalTrack(kind, 'persistent-mute');
      }, LOCAL_TRACK_MUTE_DEBOUNCE_MS);
      if (kind === 'audio') this.audioRecoveryTimer = timer;
      else this.videoRecoveryTimer = timer;
      return;
    }
    void this.recoverLocalTrack(kind, 'ended');
  }

  private clearLocalTrackRecoveryTimer(kind: 'audio' | 'video', track?: MediaStreamTrack): void {
    if (track && !this.isCurrentLocalTrack(kind, track)) return;
    const timer = kind === 'audio' ? this.audioRecoveryTimer : this.videoRecoveryTimer;
    if (timer) window.clearTimeout(timer);
    if (kind === 'audio') this.audioRecoveryTimer = null;
    else this.videoRecoveryTimer = null;
  }

  private clearLocalTrackRecoveryTimers(): void {
    this.clearLocalTrackRecoveryTimer('audio');
    this.clearLocalTrackRecoveryTimer('video');
    this.audioRecoveryInFlight = false;
    this.videoRecoveryInFlight = false;
  }

  private isCurrentLocalTrack(kind: 'audio' | 'video', track: MediaStreamTrack): boolean {
    const current = kind === 'audio' ? this.media.localStream()?.getAudioTracks()[0] : this.media.localStream()?.getVideoTracks()[0];
    return current === track;
  }

  private async recoverLocalTrack(kind: 'audio' | 'video', trigger: 'ended' | 'persistent-mute'): Promise<void> {
    if (kind === 'audio') {
      if (this.audioRecoveryInFlight) return;
      this.audioRecoveryInFlight = true;
    } else {
      if (this.videoRecoveryInFlight) return;
      this.videoRecoveryInFlight = true;
    }
    this.deviceFailureNotice.set(null);
    this.actionNotice.set(kind === 'audio' ? 'Microphone disconnected. Reconnecting...' : 'Camera disconnected. Reconnecting...');
    this.queueDiagnosticsLog('error', `local ${kind} track ${trigger}; attempting device recovery`);
    try {
      if (kind === 'audio') await this.recoverLocalAudioTrack();
      else await this.recoverLocalVideoTrack();
    } finally {
      if (kind === 'audio') this.audioRecoveryInFlight = false;
      else this.videoRecoveryInFlight = false;
    }
  }

  private async recoverLocalAudioTrack(): Promise<void> {
    for (let attempt = 0; attempt < DEVICE_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await delay(DEVICE_RECOVERY_BACKOFF_MS * attempt);
      const devices = await this.media.enumerateDevices();
      this.audioInputs.set(devices.audioInputs);
      this.audioOutputs.set(devices.audioOutputs);
      this.videoInputs.set(devices.videoInputs);
      if (!devices.audioInputs.length) break;
      const candidates = this.deviceCandidates(this.selectedAudioId(), devices.audioInputs);
      for (const candidate of candidates) {
        try {
          const track = await this.media.replaceAudioTrack(candidate.deviceId, (nextTrack) => this.webrtc.replaceLocalSenderTrack('audio', nextTrack));
          if (!track) continue;
          this.syncSelectedAudioIdToTrack(track);
          this.attachLocalTrackFailureHandlers(this.media.localStream() ?? new MediaStream([track]));
          this.micLevel.set(this.media.getMicLevel(this.media.localStream() ?? new MediaStream([track])));
          this.updateLocalMediaState();
          this.broadcastMediaState(track.enabled, this.media.cameraOn());
          this.actionNotice.set(this.recoveryNotice('microphone', candidate, track));
          this.queueDiagnosticsLog('state-change', 'local audio track recovered via replaceTrack');
          return;
        } catch (err) {
          console.debug('[devices] microphone recovery candidate failed', candidate.deviceId || 'default', err);
        }
      }
    }
    await this.webrtc.replaceLocalSenderTrack('audio', null);
    this.media.removeAudioTrack();
    this.updateLocalMediaState();
    this.broadcastMediaState(false, this.media.cameraOn());
    this.actionNotice.set(null);
    this.deviceFailureNotice.set('No microphone available. Connect a microphone, then choose it from devices.');
    this.queueDiagnosticsLog('error', 'local audio recovery failed; no microphone available');
  }

  private async recoverLocalVideoTrack(): Promise<void> {
    for (let attempt = 0; attempt < DEVICE_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await delay(DEVICE_RECOVERY_BACKOFF_MS * attempt);
      const devices = await this.media.enumerateDevices();
      this.audioInputs.set(devices.audioInputs);
      this.audioOutputs.set(devices.audioOutputs);
      this.videoInputs.set(devices.videoInputs);
      if (!devices.videoInputs.length) break;
      const candidates = this.deviceCandidates(this.selectedVideoId(), devices.videoInputs);
      for (const candidate of candidates) {
        try {
          const track = await this.media.replaceVideoTrack(candidate.deviceId, (nextTrack) => this.webrtc.replaceLocalSenderTrack('video', nextTrack));
          if (!track) continue;
          this.syncSelectedVideoIdToTrack(track);
          this.attachLocalTrackFailureHandlers(this.media.localStream() ?? new MediaStream([track]));
          this.updateLocalMediaState();
          this.broadcastMediaState(this.media.micOn(), true);
          this.actionNotice.set(this.recoveryNotice('camera', candidate, track));
          this.queueDiagnosticsLog('state-change', 'local video track recovered via replaceTrack');
          return;
        } catch (err) {
          console.debug('[devices] camera recovery candidate failed', candidate.deviceId || 'default', err);
        }
      }
    }
    await this.webrtc.replaceVideoTrack(null);
    this.media.removeVideoTrack();
    this.updateLocalMediaState();
    this.broadcastMediaState(this.media.micOn(), false);
    this.actionNotice.set(null);
    this.deviceFailureNotice.set('No camera available. Camera is off.');
    this.queueDiagnosticsLog('error', 'local video recovery failed; camera switched off');
  }

  private deviceCandidates(
    selectedDeviceId: string,
    devices: MediaDeviceInfo[],
  ): { deviceId: string | undefined; label: string; fallback: boolean }[] {
    const availableIds = new Set(devices.map((device) => device.deviceId).filter(Boolean));
    const selected = selectedDeviceId && availableIds.has(selectedDeviceId) ? devices.find((device) => device.deviceId === selectedDeviceId) : null;
    const candidates: { deviceId: string | undefined; label: string; fallback: boolean }[] = [];
    if (selected) candidates.push({ deviceId: selected.deviceId, label: selected.label, fallback: false });
    candidates.push({ deviceId: undefined, label: devices[0]?.label || '', fallback: !selected });
    for (const device of devices) {
      if (device.deviceId === selected?.deviceId) continue;
      candidates.push({ deviceId: device.deviceId, label: device.label, fallback: true });
    }
    return candidates.filter((candidate, index, all) => all.findIndex((entry) => entry.deviceId === candidate.deviceId) === index);
  }

  private recoveryNotice(kind: 'microphone' | 'camera', candidate: { label: string; fallback: boolean }, track: MediaStreamTrack): string {
    const label = candidate.label || track.label || '';
    if (candidate.fallback) return label ? `Using fallback ${kind}: ${label}.` : `Using fallback ${kind}.`;
    return label ? `Switched to ${label}.` : `${kind[0].toUpperCase()}${kind.slice(1)} reconnected.`;
  }

  private async syncShareCameraCut(shareActive: boolean, localScreenShareActive: boolean, manualOverride: boolean): Promise<void> {
    const run = ++this.shareCameraSyncRun;
    if (shareActive && !this.shareCameraActive) {
      this.shareCameraActive = true;
      this.shareCameraPreShareOn = this.media.cameraOn();
      this.shareCameraManualOverride.set(false);
      await this.setCameraTrackForShare(false, false);
    } else if (!shareActive && this.shareCameraActive) {
      const restoreCamera = this.shareCameraPreShareOn === true;
      this.shareCameraActive = false;
      this.shareCameraPreShareOn = null;
      this.shareCameraManualOverride.set(false);
      await this.setCameraTrackForShare(restoreCamera, true);
      manualOverride = false;
    }
    if (run !== this.shareCameraSyncRun) return;
    await this.webrtc.setShareCameraPolicy({
      suppressCamera: shareActive && !localScreenShareActive && !manualOverride,
      localScreenShareActive,
    });
    this.updateLocalMediaState();
  }

  private async setCameraTrackForShare(enabled: boolean, updateSender: boolean): Promise<void> {
    const nextEnabled = await this.media.setCameraTrackEnabled({
      enabled,
      videoDeviceId: enabled ? this.selectedVideoDeviceIdForRequest() : undefined,
      facingMode: enabled ? this.videoFacingModeForRequest(true) : undefined,
    });
    if (updateSender && !this.media.screenOn()) {
      await this.webrtc.replaceVideoTrack(nextEnabled ? this.media.localStream()?.getVideoTracks()[0] ?? null : null);
    }
    this.updateLocalMediaState();
    this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
  }

  private cameraVisibleDuringCurrentShare(): boolean {
    if (!this.anyScreenShareActive()) return true;
    if (this.media.screenOn()) return false;
    return this.shareCameraManualOverride();
  }

  private effectiveCameraState(cam: boolean): boolean {
    return cam && this.cameraVisibleDuringCurrentShare();
  }

  private broadcastMediaState(mic: boolean, cam: boolean, screenOn = this.media.screenOn()): void {
    this.ws.send({ type: 'media-state', mic, cam: this.effectiveCameraState(cam), screenOn });
    this.queueDiagnosticsLog('state-change');
  }

  private startDiagnosticsLogger(): void {
    if (this.diagnosticsLogTimer || !this.currentSessionId() || !this.diagnosticsLoggingEnabled()) return;
    this.diagnosticsLogTimer = window.setInterval(() => {
      void this.flushDiagnosticsLog('sample');
    }, DIAGNOSTICS_LOG_INTERVAL_MS);
  }

  private stopDiagnosticsLogger(): void {
    if (this.diagnosticsLogTimer) clearInterval(this.diagnosticsLogTimer);
    this.diagnosticsLogTimer = null;
    this.lastDiagnosticsEventAt = 0;
    this.diagnosticsLogInFlight = false;
  }

  private queueDiagnosticsLog(kind: DiagnosticsPayload['kind'], error?: string): void {
    if (this.state() !== 'in-call' || !this.currentSessionId() || !this.diagnosticsLoggingEnabled()) return;
    this.startDiagnosticsLogger();
    if (kind === 'sample') {
      void this.flushDiagnosticsLog(kind, { error });
      return;
    }
    const now = Date.now();
    if (now - this.lastDiagnosticsEventAt < DIAGNOSTICS_EVENT_THROTTLE_MS) return;
    this.lastDiagnosticsEventAt = now;
    void this.flushDiagnosticsLog(kind, { error });
  }

  private async flushDiagnosticsLog(
    kind: DiagnosticsPayload['kind'],
    options: { error?: string; useBeacon?: boolean } = {},
  ): Promise<void> {
    const sessionId = this.currentSessionId();
    if (!sessionId || !this.diagnosticsLoggingEnabled()) return;
    const payload = this.buildDiagnosticsPayload(kind, options.error);
    if (options.useBeacon && this.meetingSessions.sendDiagnosticsBeacon(sessionId, payload)) return;
    if (this.diagnosticsLogInFlight) return;
    this.diagnosticsLogInFlight = true;
    try {
      await this.meetingSessions.appendDiagnostics(sessionId, payload);
    } catch (err) {
      console.debug('[diagnostics-log] append failed', err);
    } finally {
      this.diagnosticsLogInFlight = false;
    }
  }

  private buildDiagnosticsPayload(kind: DiagnosticsPayload['kind'], error?: string): DiagnosticsPayload {
    const diagnostics = this.webrtc.diagnosticSnapshot();
    const payload: DiagnosticsPayload = {
      kind,
      roomId: this.roomId,
      roomTitle: this.roomTitle(),
      clientId: this.myId(),
      participantId: this.myParticipantId(),
      clientKey: readClientKey(),
      clientName: this.displayName().trim() || 'Anon',
      createdAt: Date.now(),
      wsStatus: this.ws.status(),
      wsReconnectAttempts: this.ws.reconnectAttempts(),
      wsHealth: this.ws.diagnosticsSnapshot(),
      forceRelay: this.webrtc.forceRelay(),
      manualAudioOnly: this.webrtc.manualAudioOnly(),
      outboundAudioLevel: diagnostics.outboundAudioLevel,
      outboundAudioEnergy: diagnostics.outboundAudioEnergy,
      micSilent: diagnostics.micSilent,
      peers: diagnostics.peers.map((peer) => ({
        ...peer,
        diagnosticLabels: [
          ...(peer.diagnosticLabels ?? []),
          ...(diagnostics.micSilent === true && peer.isLocal ? ['sender-silent'] : []),
          ...(this.remoteAudioBlocked() && !peer.isLocal ? ['autoplay-blocked'] : []),
        ],
      })),
    };
    if (error) payload.error = error;
    return payload;
  }

  private appendChatMessage(message: ChatMessage): void {
    this.chatMessages.update((messages) => [...messages, message]);
    this.scrollChatToBottom();
  }

  private scrollChatToBottom(): void {
    window.setTimeout(() => {
      const list = this.chatMessageList()?.nativeElement;
      if (list) list.scrollTop = list.scrollHeight;
    });
  }

  private installMobileVisibilityPause(): void {
    if (this.visibilityListenerInstalled || !this.shouldEnableBgPause()) return;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.visibilityListenerInstalled = true;
  }

  private uninstallMobileVisibilityPause(): void {
    if (!this.visibilityListenerInstalled) return;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.visibilityListenerInstalled = false;
    this.camOnBeforeBackground = false;
  }

  // Best-effort: mobile browsers, especially iOS, can throttle background JS/WS delivery.
  private readonly handleVisibilityChange = (): void => {
    if (!this.shouldEnableBgPause() || this.state() !== 'in-call') return;
    const track = this.media.localStream()?.getVideoTracks()[0] ?? null;
    if (!track) return;
    if (document.visibilityState === 'hidden') {
      this.camOnBeforeBackground = track.enabled;
      if (track.enabled) {
        track.enabled = false;
        this.media.cameraOn.set(false);
        this.updateLocalMediaState();
        this.broadcastMediaState(this.media.micOn(), false);
      }
      return;
    }
    if (document.visibilityState === 'visible' && this.camOnBeforeBackground) {
      track.enabled = true;
      this.media.cameraOn.set(true);
      this.camOnBeforeBackground = false;
      this.updateLocalMediaState();
      this.broadcastMediaState(this.media.micOn(), true);
    }
  };

  private updateLocalMediaState(): void {
    const id = this.myId();
    if (!id) return;
    this.webrtc.updatePeer(id, { micEnabled: this.media.micOn(), camEnabled: this.effectiveCameraOn(), screenOn: this.media.screenOn() });
  }

  private shouldEnableBgPause(): boolean {
    return this.viewport.isMobile() && this.platform.isMobileUA();
  }

  private hasPeerConnection(clientId: string): boolean {
    return !!this.webrtc.peers().get(clientId)?.pc;
  }

  private bufferSignal(msg: Extract<SignalingMessage, { type: 'signal' }>): void {
    const queue = this.pendingSignals.get(msg.from) ?? [];
    if (queue.length >= 20) queue.shift();
    queue.push({ from: msg.from, data: msg.data });
    this.pendingSignals.set(msg.from, queue);
    console.debug(`[signaling] buffered ${signalKind(msg.data)} from ${msg.from} (queue=${queue.length})`);
  }

  private async drainPendingSignals(clientId: string): Promise<void> {
    const queue = this.pendingSignals.get(clientId);
    if (!queue?.length) return;
    this.pendingSignals.delete(clientId);
    console.debug(`[signaling] drained ${queue.length} queued signals for ${clientId}`);
    for (const msg of queue) {
      await this.webrtc.handleSignal(msg.from, msg.data);
    }
  }

  private sendJoin(name: string): void {
    this.ws.send({
      type: 'join',
      room: this.roomId,
      name,
      mobile: this.viewport.isMobile(),
      supportsReconnect: true,
      reconnectToken: this.reconnectToken() || undefined,
      clientKey: readClientKey(),
    });
  }

  private resyncSignalingState(name: string): void {
    if (this.state() === 'in-call') {
      this.signalingResyncCount += 1;
      this.status.set('Reconnected to signaling. Resyncing room state...');
      this.queueDiagnosticsLog('reconnect', 'signaling websocket reopened; resyncing room state');
    }
    this.sendJoin(name);
  }

  private startClock(): void {
    this.stopClock();
    this.callStartMs.set(Date.now());
    this.clockTick.set(0);
    this.clockInterval = setInterval(() => this.clockTick.update((tick) => tick + 1), 1000);
  }

  private stopClock(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
    this.clockInterval = null;
    this.callStartMs.set(null);
    this.clockTick.set(0);
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function localMessageId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toLobbyError(error: MediaError): LobbyError {
  if (error.code === 'denied') return { kind: 'denied' };
  if (error.code === 'no-devices') return { kind: 'no-devices' };
  return { kind: 'unknown', message: error.message || 'Media access failed' };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T | null): Promise<T | null> {
  return Promise.race([promise, new Promise<T | null>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

function signalKind(data: unknown): string {
  const payload = data as { sdp?: { type?: string }; ice?: unknown };
  if (payload?.sdp?.type) return payload.sdp.type;
  if (payload?.ice) return 'ice';
  return 'unknown';
}

function isDisplayMediaPermissionError(err: unknown): boolean {
  if (!(err instanceof Error || err instanceof DOMException)) return false;
  const name = err.name || '';
  const message = err.message || '';
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError', 'NotReadableError'].includes(name)) return true;
  return /(permission|screen recording|system settings|denied|blocked|restart chrome|not allowed)/i.test(message);
}

const DEVICE_STORAGE = {
  audioInput: 'meet-poc.device.audioInput',
  audioOutput: 'meet-poc.device.audioOutput',
  videoInput: 'meet-poc.device.videoInput',
} as const;

function reconnectTokenKey(roomKey: string): string {
  return `meet-poc.reconnect.${roomKey}`;
}

function readClientKey(): string {
  const storageKey = 'meet-poc.clientKey';
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const generated =
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function readDiagnosticsLoggingEnabled(): boolean {
  try {
    return window.localStorage.getItem(DIAGNOSTICS_LOGGING_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function storeDiagnosticsLoggingEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.removeItem(DIAGNOSTICS_LOGGING_STORAGE_KEY);
    else window.localStorage.setItem(DIAGNOSTICS_LOGGING_STORAGE_KEY, '0');
  } catch {
    // Best effort only; diagnostics logging still follows the in-memory toggle.
  }
}

function readReconnectToken(roomKey: string): string | null {
  try {
    return window.sessionStorage.getItem(reconnectTokenKey(roomKey));
  } catch {
    return null;
  }
}

function storeReconnectToken(roomKey: string, token: string): void {
  try {
    window.sessionStorage.setItem(reconnectTokenKey(roomKey), token);
  } catch {
    // Best effort only; in-memory token still handles normal WS reconnects.
  }
}

function clearReconnectToken(roomKey: string): void {
  try {
    window.sessionStorage.removeItem(reconnectTokenKey(roomKey));
  } catch {
    // Best effort only.
  }
}

function readStoredDevice(key: string): string {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function storeDevice(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Best effort only; device persistence should not block joining.
  }
}

function preferredDeviceId(key: string, devices: MediaDeviceInfo[], current: string): string {
  const stored = readStoredDevice(key);
  if (stored && devices.some((device) => device.deviceId === stored)) return stored;
  if (current && devices.some((device) => device.deviceId === current)) return current;
  return devices[0]?.deviceId || '';
}

function audioTrackDeviceId(track: MediaStreamTrack | null | undefined): string {
  return mediaTrackDeviceId(track);
}

function mediaTrackDeviceId(track: MediaStreamTrack | null | undefined): string {
  if (!track || typeof track.getSettings !== 'function') return '';
  const deviceId = track.getSettings().deviceId;
  return typeof deviceId === 'string' ? deviceId : '';
}

function canSetSinkId(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

declare global {
  interface Window {
    __meetDebug?: {
      localStream: MediaStream | null;
      peers: {
        id: string;
        participantId: string;
        name: string;
        state: string;
        reconnecting: boolean;
        audioMuted?: boolean;
        audioReadyState?: MediaStreamTrackState;
        audioEnabled?: boolean;
        micEnabled?: boolean;
        camEnabled?: boolean;
        screenOn?: boolean;
        quality?: 'good' | 'weak' | 'poor';
        audioOnlyReason?: 'auto-poor' | 'manual-audio-only' | 'remote-request' | null;
        isMobile?: boolean;
      }[];
      shareLayoutActive?: boolean;
      shareStripCollapsed?: boolean;
      anyScreenShareActive?: boolean;
      effectiveCameraOn?: boolean;
      shareCameraManualOverride?: boolean;
      screenShareAttempts: number;
      lastVideoConstraints?: MediaStreamConstraints | null;
      audioContextActivated?: boolean;
      speakerTestCount?: number;
      doorbellCount?: number;
      waitingKnockers?: { id: string; name: string }[];
      diagnostics?: {
        id: string;
        name: string;
        connectionState: string;
        iceConnectionState: string;
        iceGatheringState: string;
        signalingState: string;
        selectedCandidateType: string | null;
        quality: 'good' | 'weak' | 'poor';
        packetLossPct: number | null;
        jitterMs: number | null;
        rttMs: number | null;
        availableOutgoingBitrateKbps: number | null;
        audioOnlyReason: 'auto-poor' | 'manual-audio-only' | 'remote-request' | null;
        updatedAt: number;
      }[];
      diagnosticSnapshot?: () => Pick<DiagnosticsPayload, 'outboundAudioLevel' | 'outboundAudioEnergy' | 'micSilent' | 'peers'>;
      forceRelay?: boolean;
      manualAudioOnly?: boolean;
      lastPeerConnectionPolicy?: RTCIceTransportPolicy | 'all';
      lastPeerConnectionConfig?: RTCConfiguration | null;
      wsConnected?: boolean;
      wsStatus?: string;
      wsReconnectAttempts?: number;
      wsResyncCount?: number;
      reconnectTokenPresent?: boolean;
      myClientId?: string | null;
      myParticipantId?: string | null;
      diagnosticsLoggingEnabled?: boolean;
      roomState?: string;
      waitingRemainingSeconds?: number;
      localAudioTrackId?: string;
      localVideoTrackId?: string;
      currentFacingMode?: 'user' | 'environment';
      lastRecordingMime?: string | null;
      lastRecordingExtension?: string;
      lastRecorderTimeslice?: number | null;
      lastRecordingUpload?: { ok: true; file: string; bytes: number } | null;
      lastMetadataUpload?: { ok: true; metaFile: string; bytes: number } | null;
      metadataWarning?: string | null;
      recorderSourceCount?: number;
      isRecording: boolean;
      activeSpeakerHz?: number;
      activeSpeakerId?: string | null;
      activeSpeakerAnalyzerCount?: number;
      activeSpeakerLastMaxRms?: number;
      activeSpeakerContextState?: string;
      remoteAudioMixer?: {
        mixerEnabled: boolean;
        contextState: AudioContextState | 'none';
        outputAttached: boolean;
        outputPaused: boolean;
        mixedPeerIds: string[];
        mixedTrackIds: string[];
      };
      peerConnectionStates?: () => {
        id: string;
        state: RTCPeerConnectionState | 'local';
        iceConnectionState: RTCIceConnectionState | 'local';
        iceGatheringState: RTCIceGatheringState | 'local';
        signalingState: RTCSignalingState | 'local';
        selectedCandidateType: string | null;
      }[];
      remoteMedia?: () => {
        id: string;
        isMobile: boolean;
        audioTracks: number;
        videoTracks: number;
        hasVideoSrcObject: boolean;
        hasRemoteAudioElement: boolean;
        hasRemoteAudioMixer: boolean;
        remoteAudioUsesPeerStream: boolean;
      }[];
      isMobile?: () => boolean;
      isIOS?: () => boolean;
      isAndroid?: () => boolean;
      closeSignalingForTest?: () => void;
      sampleConnectionQualityForTest?: (quality?: 'good' | 'weak' | 'poor' | 'critical') => Promise<void>;
      senderSnapshot?: () => {
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
      }[];
      injectActiveSpeakerStream?: (id: string, stream: MediaStream) => void;
      forceActiveSpeakerForTest?: (id: string | null) => void;
      markPeerReconnectingForTest?: (id: string) => void;
      markPeerRecoveredForTest?: (id: string) => void;
      forceTerminalRecoveryForTest?: (id?: string) => Promise<void>;
      forceNegotiationDeadlockForTest?: (id?: string) => Promise<void>;
      replaceRemoteAudioTrackForTest?: (id: string) => Promise<{ oldTrackId: string | null; newTrackId: string } | null>;
      recoverySnapshot?: (id?: string) => {
        id: string;
        participantId: string;
        pcPresent: boolean;
        pcRecreateAttempts: number;
        restartAttempts: number;
        autoRecoveryOutcome: 'recovered' | 'failed' | null;
        rollbackCount: number;
        forceRelay: boolean;
      }[];
      sfuPublishState?: LocalPublishState | null;
      sfuRemoteStreams?: Map<string, MediaStream>;
      sfuGetStats?: () => Promise<RTCStatsReport | null>;
    };
  }
}
