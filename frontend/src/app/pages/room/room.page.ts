import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, HostListener, OnDestroy, Signal, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { colorWandOutline, micOffOutline, micOutline, videocamOffOutline, videocamOutline } from 'ionicons/icons';
import { BackgroundPickerComponent } from '../../components/background-picker/background-picker.component';
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
import { BackgroundEffectsService } from '../../services/background-effects.service';
import { MediaError, MediaService, ScreenShareUnsupportedError } from '../../services/media.service';
import { MeetingSessionsService } from '../../services/meeting-sessions.service';
import type { DiagnosticsPayload, SfuDiagnosticsSnapshot } from '../../services/meeting-sessions.service';
import { IceConfigService } from '../../services/ice-config.service';
import { PlatformService } from '../../services/platform.service';
import { PeerState } from '../../services/peer-state';
import { ParticipantSnapshot, RecorderService } from '../../services/recorder.service';
import { RemoteAudioService } from '../../services/remote-audio.service';
import { RoomsService } from '../../services/rooms.service';
import { ViewportService } from '../../services/viewport.service';
import { ReactionKind, SignalingMessage, WsService } from '../../services/ws.service';
import { SfuClientService, type LocalPublishState } from '../../services/sfu-client.service';

const DIAGNOSTICS_LOG_INTERVAL_MS = 7_500;
const DIAGNOSTICS_EVENT_THROTTLE_MS = 2_000;
const DIAGNOSTICS_LOGGING_STORAGE_KEY = 'meet-poc.diagnosticsLogging';
const LOCAL_TRACK_MUTE_DEBOUNCE_MS = 1_200;
const DEVICE_RECOVERY_MAX_ATTEMPTS = 3;
const DEVICE_RECOVERY_BACKOFF_MS = 650;
const GUEST_DISPLAY_NAME_KEY = 'guestDisplayName';
const CHAT_EVERYONE_THREAD = 'everyone';

type RoomState = 'checking' | 'not-found' | 'lobby' | 'connecting' | 'waiting-room' | 'knocking' | 'in-call' | 'rejected' | 'error';
type ChatMessage = { id: string; clientId: string; sender: string; text: string; sentAt: number; mine: boolean; toClientId?: string };
type ChatRecipientTab = { id: string; name: string; online: boolean };
type ShareRequest = { clientId: string; name: string };
type TransientReaction = { id: string; clientId: string; kind: Exclude<ReactionKind, 'raise-hand'>; timestamp: number };
type LobbyError =
  | { kind: 'denied' }
  | { kind: 'no-devices' }
  | { kind: 'video-denied-but-audio-ok' }
  | { kind: 'unknown'; message: string };

// Identity fields tracked per remote peer via signaling messages.
// Streams are merged in from sfuClient in the peers computed.
interface PeerIdentity {
  name: string;
  participantId: string;
  isHost: boolean;
  isMobile: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  screenOn: boolean;
  reconnecting: boolean;
}

@Component({
  selector: 'app-room',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    FormsModule,
    RouterLink,
    BackgroundPickerComponent,
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
  readonly activeSpeaker = inject(ActiveSpeakerService);
  private readonly remoteAudio = inject(RemoteAudioService);
  private readonly platform = inject(PlatformService);
  private readonly viewport = inject(ViewportService);
  readonly sfuClient = inject(SfuClientService);
  readonly backgroundEffects = inject(BackgroundEffectsService);

  readonly roomKey = this.route.snapshot.paramMap.get('slug') ?? this.route.snapshot.paramMap.get('id') ?? '';
  roomId = this.roomKey;
  readonly roomSlug = signal('');
  readonly roomOpen = signal(false);
  private readonly joinRouteMode = this.route.snapshot.routeConfig?.path === 'join/:slug';
  readonly state = signal<RoomState>('checking');
  readonly roomTitle = signal('Checking room...');
  readonly displayName = signal('');
  readonly guestNameOverlayOpen = signal(false);
  readonly guestDisplayNameDraft = signal(readGuestDisplayName());
  readonly guestNameError = signal<string | null>(null);
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
  readonly backgroundPickerOpen = signal(false);
  readonly lobbyDeviceDialogOpen = signal(true);
  readonly devicePermissionIntro = signal(true);
  readonly inCallDeviceDialogOpen = signal(false);
  readonly deviceDialogBusy = signal(false);
  readonly deviceDialogError = signal<string | null>(null);
  readonly canSelectAudioOutput = signal(canSetSinkId());
  readonly canFlipCamera = computed(() => this.viewport.isMobile() && (this.state() === 'in-call' ? this.media.cameraOn() : this.cameraRequested()));
  readonly remoteAudioMixerEnabled = computed(() => true);
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
  readonly chatThreads = signal<Map<string, ChatMessage[]>>(new Map([[CHAT_EVERYONE_THREAD, []]]));
  readonly activeChatRecipient = signal<string>(CHAT_EVERYONE_THREAD);
  readonly chatUnreadByThread = signal<Map<string, number>>(new Map());
  readonly chatRecipientNames = signal<Map<string, string>>(new Map());
  readonly chatDraft = signal('');
  readonly chatUnreadCount = computed(() => {
    let total = 0;
    for (const count of this.chatUnreadByThread().values()) total += count;
    return Math.min(99, total);
  });
  readonly leaveDialogOpen = signal(false);
  readonly meetingEndedToastOpen = signal(false);
  readonly diagnosticsLoggingEnabled = signal(readDiagnosticsLoggingEnabled());
  readonly screenShareHelp = signal<string | null>(null);
  readonly pendingShareRequests = signal<ShareRequest[]>([]);
  readonly myShareRequestPending = signal(false);
  readonly peersWithShareGrant = signal<Set<string>>(new Set());
  readonly warningDismissed = signal(false);
  readonly knockers = signal<Knocker[]>([]);
  readonly raisedHands = signal<Set<string>>(new Set());
  readonly transientReactions = signal<TransientReaction[]>([]);
  readonly myRaisedHand = computed(() => {
    const myId = this.myId();
    return !!myId && this.raisedHands().has(myId);
  });

  // Identity map: clientId → PeerIdentity (name, participantId, media state, flags).
  // The local peer is NOT stored here — it's always derived from media signals in peers computed.
  private readonly peerIdentities = signal<Map<string, PeerIdentity>>(new Map());

  // The ONE peer list: local peer + remote peers (identity merged with SFU streams).
  readonly peers = computed<PeerState[]>(() => {
    const result: PeerState[] = [];
    const myId = this.myId();
    if (this.state() === 'in-call' && myId) {
      result.push({
        id: myId,
        participantId: this.myParticipantId() ?? myId,
        name: this.displayName().trim() || 'Anon',
        stream: this.effectiveLocalStream(),
        pc: null,
        connectionState: 'local',
        isLocal: true,
        isHost: this.isHost(),
        micEnabled: this.media.micOn(),
        camEnabled: this.effectiveCameraOn(),
        screenOn: this.media.screenOn(),
        reconnecting: false,
        isMobile: false,
        quality: 'good',
        audioOnlyReason: null,
      });
    }
    const identities = this.peerIdentities();
    const streams = this.sfuClient.remoteStreams();
    const screenStreams = this.sfuClient.remoteScreenStreams();
    for (const [clientId, identity] of identities) {
      if (clientId === myId) continue;
      const stream = streams.get(clientId) ?? null;
      result.push({
        id: clientId,
        participantId: identity.participantId,
        name: identity.name,
        stream,
        pc: null,
        connectionState: stream ? 'connected' : 'connecting',
        isLocal: false,
        isHost: identity.isHost,
        micEnabled: identity.micEnabled,
        camEnabled: identity.camEnabled,
        screenOn: identity.screenOn || screenStreams.has(clientId),
        reconnecting: identity.reconnecting,
        isMobile: identity.isMobile,
        quality: 'good',
        audioOnlyReason: null,
      });
    }
    return result;
  });
  readonly chatRecipientTabs = computed<ChatRecipientTab[]>(() => {
    const myId = this.myId();
    const names = this.chatRecipientNames();
    const onlinePeers = new Map<string, PeerState>();
    for (const peer of this.peers()) {
      if (!peer.isLocal) onlinePeers.set(peer.id, peer);
    }
    const recipientIds = new Set<string>();
    for (const id of onlinePeers.keys()) recipientIds.add(id);
    for (const id of this.chatThreads().keys()) {
      if (id !== CHAT_EVERYONE_THREAD && id !== myId) recipientIds.add(id);
    }
    const tabs: ChatRecipientTab[] = [];
    for (const id of recipientIds) {
      const peer = onlinePeers.get(id);
      tabs.push({ id, name: peer?.name || names.get(id) || 'Peer', online: !!peer });
    }
    return tabs.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  });
  readonly activeChatMessages = computed(() => this.chatThreads().get(this.activeChatRecipient()) ?? []);
  readonly activeChatRecipientName = computed(() => this.chatRecipientName(this.activeChatRecipient()));
  readonly activeChatRecipientOnline = computed(() => {
    const recipient = this.activeChatRecipient();
    return recipient === CHAT_EVERYONE_THREAD || this.peers().some((peer) => !peer.isLocal && peer.id === recipient);
  });
  readonly activeChatEmptyText = computed(() => {
    const recipient = this.activeChatRecipient();
    if (recipient === CHAT_EVERYONE_THREAD) return 'No messages yet. Say hi to everyone.';
    return `No messages with @${this.activeChatRecipientName()} yet.`;
  });
  readonly canSendChat = computed(() => {
    const recipient = this.activeChatRecipient();
    if (!this.chatDraft().trim()) return false;
    if (recipient === CHAT_EVERYONE_THREAD) return true;
    return recipient !== this.myId() && this.activeChatRecipientOnline();
  });

  readonly shareStripCollapsed = signal(false);

  // anyScreenShareActive reads sfuClient directly — avoids circular dep with peers computed
  readonly anyScreenShareActive = computed(
    () => this.media.screenOn() || this.sfuClient.remoteScreenStreams().size > 0,
  );

  readonly sharingPeer = computed<PeerState | null>(() => {
    if (this.media.screenOn()) {
      return this.peers().find((p) => p.isLocal) ?? null;
    }
    const screenStreams = this.sfuClient.remoteScreenStreams();
    for (const [clientId] of screenStreams) {
      const peer = this.peers().find((p) => p.id === clientId);
      if (peer) return peer;
    }
    return null;
  });

  readonly shareLayoutActive = computed(() => !!this.sharingPeer());
  readonly effectiveCameraOn = computed(() => this.media.cameraOn() && this.cameraVisibleDuringCurrentShare());
  readonly shareStream = computed(() => {
    const peer = this.sharingPeer();
    if (!peer) return null;
    if (peer.isLocal) return this.media.screenStream();
    return this.sfuClient.remoteScreenStreams().get(peer.id) ?? null;
  });
  readonly orderedStripPeers = computed(() => this.peers());
  readonly effectiveLocalStream = computed(() => this.effectiveStreamForSourceTrack());
  readonly showPeerWarning = computed(() => this.peers().length >= 6 && !this.warningDismissed());
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
  private readonly reconnectToken = signal<string | null>(readReconnectToken(this.roomKey));
  private signalingResyncCount = 0;
  private pendingListInitialized = false;
  private lastDoorbellAt = 0;
  private deviceChangeListenerInstalled = false;
  private audioRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private videoRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private audioRecoveryInFlight = false;
  private videoRecoveryInFlight = false;
  private lastSfuVideoTrack: MediaStreamTrack | null = null;
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
    addIcons({ colorWandOutline, micOffOutline, micOutline, videocamOffOutline, videocamOutline });
    this.installPageLifecycleCleanup();
    this.installDeviceChangeHandler();
    void this.bootstrap();
    effect(() => {
      const debug: NonNullable<Window['__meetDebug']> = {
        localStream: this.media.localStream(),
        effectiveLocalStream: this.effectiveLocalStream(),
        peers: this.peers().map((peer) => ({
          id: peer.id,
          participantId: peer.participantId,
          name: peer.name,
          state: peer.connectionState,
          reconnecting: peer.reconnecting,
          audioMuted: peer.stream?.getAudioTracks()[0]?.muted,
          audioReadyState: peer.stream?.getAudioTracks()[0]?.readyState,
          audioEnabled: peer.stream?.getAudioTracks()[0]?.enabled,
          micEnabled: peer.micEnabled,
          camEnabled: peer.camEnabled,
          screenOn: peer.screenOn,
          quality: peer.quality,
          audioOnlyReason: peer.audioOnlyReason,
          isMobile: peer.isMobile,
        })),
        shareLayoutActive: this.shareLayoutActive(),
        shareStripCollapsed: this.shareStripCollapsed(),
        anyScreenShareActive: this.anyScreenShareActive(),
        effectiveCameraOn: this.effectiveCameraOn(),
        shareCameraManualOverride: this.shareCameraManualOverride(),
        pendingShareRequests: this.pendingShareRequests().map((request) => ({ ...request })),
        myShareRequestPending: this.myShareRequestPending(),
        peersWithShareGrant: [...this.peersWithShareGrant()],
        raisedHands: [...this.raisedHands()],
        transientReactions: this.transientReactions().map((reaction) => ({ ...reaction })),
        activeChatRecipient: this.activeChatRecipient(),
        chatThreads: Object.fromEntries([...this.chatThreads()].map(([id, messages]) => [id, messages.map((message) => ({ ...message }))])),
        chatUnreadByThread: Object.fromEntries(this.chatUnreadByThread()),
        isRecording: this.recorder.isRecording() || this.hostRecording(),
        screenShareAttempts: this.media.screenShareAttempts(),
        lastVideoConstraints: this.media.lastVideoConstraints(),
        audioContextActivated: this.media.audioContextActivated(),
        speakerTestCount: window.__meetDebug?.speakerTestCount ?? 0,
        doorbellCount: window.__meetDebug?.doorbellCount ?? 0,
        waitingKnockers: this.knockers().map((knocker) => ({ ...knocker })),
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
        sfuPublishState: this.sfuClient.localPublishState(),
        sfuRemoteStreams: this.sfuClient.remoteStreams(),
        sfuRemoteScreenStreams: this.sfuClient.remoteScreenStreams(),
        closeSignalingForTest: () => this.ws.debugDropForReconnect(),
        isMobile: () => this.viewport.isMobile(),
        isIOS: () => this.platform.isIOS(),
        isAndroid: () => this.platform.isAndroid(),
      };
      if (window.location.hostname === 'localhost') {
        debug.injectActiveSpeakerStream = (id: string, stream: MediaStream) => this.activeSpeaker.injectDebugStream(id, stream);
        debug.forceActiveSpeakerForTest = (id: string | null) => this.activeSpeaker.forceActivePeerForTest(id);
        debug.sfuGetStats = () => this.sfuClient.getStats();
        debug.sfuVideoEncodings = () => this.sfuClient.getVideoEncodings();
        debug.sfuUpdateCameraLayer = () => this.sfuClient.updateCameraLayer();
        debug.sfuSubscribedTracks = () => Object.fromEntries(this.sfuClient.subscribedTracks());
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
    effect(() => {
      if (this.sfuClient.localPublishState()?.status !== 'published') return;
      this.sfuClient.subscribeRetryVersion();
      const publishers = this.sfuClient.remotePublishers();
      const myId = this.myId();
      for (const [clientId, publisher] of publishers) {
        if (clientId === myId) continue;
        this.sfuClient.subscribeIfNeeded(publisher);
      }
    });
    // Update camera simulcast layer when screen share activity changes
    effect(() => {
      const _active = this.anyScreenShareActive();
      void this.sfuClient.updateCameraLayer();
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
    effect(() => {
      const publishStatus = this.sfuClient.localPublishState()?.status ?? null;
      const state = this.state();
      const cameraOn = this.media.cameraOn();
      const screenOn = this.media.screenOn();
      const localStream = this.media.localStream();
      this.backgroundEffects.mode();
      this.backgroundEffects.modelReady();
      if (state !== 'in-call' || publishStatus !== 'published' || screenOn) return;
      const sourceTrack = cameraOn ? localStream?.getVideoTracks()[0] ?? null : null;
      void this.replaceSfuVideoTrackIfChanged(this.effectiveVideoTrackForSource(sourceTrack)).catch((err) => {
        console.warn('[background-effects] unable to sync SFU video track', err);
      });
    });
  }

  async bootstrap(): Promise<void> {
    await this.auth.checkSession();
    const user = this.auth.user();
    const storedName = readGuestDisplayName();
    if (storedName && !this.displayName()) {
      this.displayName.set(storedName);
    } else if (user && !this.displayName()) {
      this.displayName.set(user.email.split('@')[0] || user.email);
    }
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
      if (this.joinRouteMode && !user) {
        if (!info.isOpen) {
          this.error.set('Room is not available.');
          this.state.set('error');
          return;
        }
        this.guestDisplayNameDraft.set(readGuestDisplayName());
        this.guestNameOverlayOpen.set(true);
        return;
      }
      this.prepareLobbyDeviceCheck();
    } catch {
      this.error.set('Room could not be loaded');
      this.state.set('error');
    }
  }

  continueAsGuest(): void {
    const name = this.guestDisplayNameDraft().trim();
    if (!name) {
      this.guestNameError.set('Enter your name to continue.');
      return;
    }
    storeGuestDisplayName(name);
    this.displayName.set(name);
    this.nameError.set(null);
    this.guestNameError.set(null);
    this.guestNameOverlayOpen.set(false);
    this.prepareLobbyDeviceCheck();
  }

  async join(): Promise<void> {
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
      () => this.resyncSignalingState(this.displayName().trim() || 'Anon'),
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
    storeGuestDisplayName(value.trim());
    if (value.trim()) {
      this.nameError.set(null);
      if (this.joinPrereqPopout()?.includes('name')) this.joinPrereqPopout.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  dismissJoinPrereqPopout(): void {
    this.backgroundPickerOpen.set(false);
    this.joinPrereqPopout.set(null);
  }

  toggleBackgroundPicker(event: Event): void {
    event.stopPropagation();
    this.backgroundPickerOpen.update((open) => !open);
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
    this.broadcastMediaState(mic, this.media.cameraOn());
  }

  async toggleCamera(): Promise<void> {
    if (this.anyScreenShareActive()) {
      await this.toggleCameraDuringShare();
      return;
    }
    try {
      const cam = await this.media.toggleCamera(
        (track: MediaStreamTrack | null) => this.replaceEffectiveVideoTrack(track),
        {
          videoDeviceId: this.selectedVideoDeviceIdForRequest(),
          facingMode: this.videoFacingModeForRequest(true),
        },
      );
      this.broadcastMediaState(this.media.micOn(), cam);
    } catch (err) {
      this.status.set(`Camera access failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async toggleScreen(): Promise<void> {
    if (!this.media.screenOn() && !this.isHost()) {
      if (this.myShareRequestPending()) return;
      this.myShareRequestPending.set(true);
      this.actionNotice.set(null);
      this.status.set('Requesting permission to share screen...');
      this.ws.send({ type: 'share-request' });
      return;
    }
    await this.executeScreenToggle();
  }

  private async executeScreenToggle(): Promise<void> {
    try {
      await this.media.toggleScreen(async (track) => {
        const hasScreenNow = this.sfuClient.localPublishState()?.tracks.some((t) => t.kind === 'screen' && t.status === 'live') ?? false;
        try {
          if (!hasScreenNow && track) {
            await this.sfuClient.publishScreen(track);
          } else if (hasScreenNow) {
            await this.sfuClient.stopScreen();
          }
        } finally {
          this.announceSfuPublishState();
        }
      });
      this.screenShareHelp.set(null);
      this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
      this.status.set(this.media.screenOn() ? 'Screen sharing.' : 'Screen sharing stopped.');
    } catch (err) {
      if (err instanceof ScreenShareUnsupportedError) {
        this.screenShareHelp.set(null);
        this.actionNotice.set(err.message);
        this.status.set(err.message);
        return;
      }
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

  approveShare(clientId: string): void {
    this.pendingShareRequests.set(this.pendingShareRequests().filter((request) => request.clientId !== clientId));
    this.peersWithShareGrant.update((ids) => new Set(ids).add(clientId));
    this.ws.send({ type: 'share-decision', clientId, approved: true });
  }

  denyShare(clientId: string): void {
    this.pendingShareRequests.set(this.pendingShareRequests().filter((request) => request.clientId !== clientId));
    this.ws.send({ type: 'share-decision', clientId, approved: false, reason: 'Host denied screen share.' });
  }

  revokeShareGrant(clientId: string): void {
    this.peersWithShareGrant.update((ids) => {
      const next = new Set(ids);
      next.delete(clientId);
      return next;
    });
    this.ws.send({ type: 'share-revoke', clientId });
  }

  sendReaction(kind: ReactionKind): void {
    if (kind === 'raise-hand') {
      this.toggleRaiseHand();
      return;
    }
    const myId = this.myId();
    if (!myId) return;
    this.addTransientReaction(myId, kind);
    this.ws.send({ type: 'reaction', kind });
  }

  toggleRaiseHand(): void {
    const myId = this.myId();
    if (!myId) return;
    const nextState = this.raisedHands().has(myId) ? 'off' : 'on';
    this.setRaisedHand(myId, nextState === 'on');
    this.ws.send({ type: 'reaction', kind: 'raise-hand', state: nextState });
  }

  tileReactions(clientId: string): TransientReaction[] {
    return this.transientReactions().filter((reaction) => reaction.clientId === clientId);
  }

  private announceSfuPublishState(): void {
    const state = this.sfuClient.localPublishState();
    if (state?.status === 'published') {
      this.ws.send({
        type: 'sfu-publish',
        cfSessionId: state.cfSessionId,
        tracks: state.tracks.filter((t) => t.status === 'live').map((t) => ({ trackName: t.trackName, kind: t.kind })),
      });
    }
  }

  private effectiveStreamForSourceTrack(sourceTrack?: MediaStreamTrack | null): MediaStream | null {
    const rawStream = this.media.localStream();
    if (!rawStream) return null;
    const rawVideoTrack = rawStream.getVideoTracks()[0] ?? null;
    const selectedVideoTrack = sourceTrack === undefined ? rawVideoTrack : sourceTrack;
    if (!selectedVideoTrack) return rawStream;

    const sourceStream =
      selectedVideoTrack === rawVideoTrack
        ? rawStream
        : new MediaStream([...rawStream.getAudioTracks(), selectedVideoTrack]);
    if (this.backgroundEffects.mode() === 'none' || !this.backgroundEffects.modelReady()) {
      return sourceStream;
    }

    const processedVideoStream = this.backgroundEffects.processStream(sourceStream);
    if (processedVideoStream === sourceStream) return sourceStream;
    return new MediaStream([...sourceStream.getAudioTracks(), ...processedVideoStream.getVideoTracks()]);
  }

  private effectiveVideoTrackForSource(sourceTrack: MediaStreamTrack | null): MediaStreamTrack | null {
    if (!sourceTrack || !sourceTrack.enabled) return null;
    return this.effectiveStreamForSourceTrack(sourceTrack)?.getVideoTracks()[0] ?? null;
  }

  private async replaceEffectiveVideoTrack(sourceTrack: MediaStreamTrack | null): Promise<void> {
    if (this.state() !== 'in-call' || this.sfuClient.localPublishState()?.status !== 'published' || this.media.screenOn()) return;
    await this.replaceSfuVideoTrackIfChanged(this.effectiveVideoTrackForSource(sourceTrack));
  }

  private async replaceSfuVideoTrackIfChanged(nextTrack: MediaStreamTrack | null): Promise<void> {
    if (this.lastSfuVideoTrack === nextTrack) return;
    this.lastSfuVideoTrack = nextTrack;
    await this.sfuClient.replaceVideoTrack(nextTrack);
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
        await this.replaceEffectiveVideoTrack(enabled ? this.media.localStream()?.getVideoTracks()[0] ?? null : null);
        this.status.set('Camera on during screen share.');
      } else {
        await this.media.setCameraTrackEnabled({ enabled: false });
        await this.replaceEffectiveVideoTrack(null);
        this.status.set('Camera hidden during screen share.');
      }
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

  admitAll(): void {
    for (const knocker of this.knockers()) {
      this.admit(knocker.id);
    }
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
      this.clearChatUnreadFor(this.activeChatRecipient());
      this.scrollChatToBottom();
    }
  }

  setActiveChatRecipient(id: string): void {
    const myId = this.myId();
    const recipient = id === CHAT_EVERYONE_THREAD || id !== myId ? id : CHAT_EVERYONE_THREAD;
    if (recipient !== CHAT_EVERYONE_THREAD) this.ensureChatThread(recipient);
    this.activeChatRecipient.set(recipient);
    this.clearChatUnreadFor(recipient);
    this.scrollChatToBottom();
  }

  unreadFor(id: string): number {
    return this.chatUnreadByThread().get(id) ?? 0;
  }

  chatRecipientName(id: string): string {
    if (id === CHAT_EVERYONE_THREAD) return 'Everyone';
    return this.peers().find((peer) => peer.id === id)?.name || this.chatRecipientNames().get(id) || 'Peer';
  }

  sendChat(event?: Event): void {
    event?.preventDefault();
    const text = this.chatDraft().trim().slice(0, 2000);
    if (!text) {
      this.chatDraft.set('');
      return;
    }
    const recipient = this.activeChatRecipient();
    if (recipient !== CHAT_EVERYONE_THREAD && !this.canSendChat()) return;
    const id = localMessageId();
    const clientId = this.myId() || 'local';
    const sender = this.displayName().trim() || 'Anon';
    const sentAt = Date.now();
    if (recipient === CHAT_EVERYONE_THREAD) {
      this.appendChatMessage(CHAT_EVERYONE_THREAD, { id, clientId, sender, text, sentAt, mine: true });
      this.ws.send({ type: 'chat', text, clientMessageId: id });
    } else {
      this.rememberChatRecipient(recipient, this.chatRecipientName(recipient));
      this.appendChatMessage(recipient, { id, clientId, sender, toClientId: recipient, text, sentAt, mine: true });
      this.ws.send({ type: 'chat-direct', toClientId: recipient, text, clientMessageId: id });
    }
    this.chatDraft.set('');
  }

  chatTime(sentAt: number): string {
    return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date(sentAt));
  }

  chatDateTime(sentAt: number): string {
    return new Date(sentAt).toISOString();
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
      this.ws.send({ type: 'close-room' });
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
    this.cleanupCall();
    this.sfuClient.destroy();
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
      this.hostClientId.set(msg.hostClientId || (msg.isOwner ? msg.clientId : null));
      if (wasInCall) this.sfuClient.resetForReconnect();
      // Populate peer identities BEFORE setting state so the in-call view renders
      // with the correct peer list on the first frame.
      const newIdentities = new Map<string, PeerIdentity>();
      const chatNames = new Map(this.chatRecipientNames());
      for (const peer of msg.peers) {
        newIdentities.set(peer.id, {
          name: peer.name,
          participantId: peer.participantId ?? peer.id,
          isHost: !!peer.host || peer.id === (msg.hostClientId ?? null),
          isMobile: !!peer.isMobile,
          micEnabled: true,
          camEnabled: false,
          screenOn: false,
          reconnecting: false,
        });
        chatNames.set(peer.id, peer.name);
      }
      this.peerIdentities.set(newIdentities);
      this.chatRecipientNames.set(chatNames);
      this.state.set('in-call');
      this.installMobileVisibilityPause();
      if (!this.callStartMs()) this.startClock();
      this.status.set(wasInCall ? 'Reconnected to signaling. Syncing peers...' : `You are ${this.displayName().trim() || 'Anon'}${msg.isOwner ? ' (host)' : ''}.`);
      this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
      if (msg.participantId && msg.sessionId) {
        const participantId = msg.participantId;
        const sessionId = msg.sessionId;
        void (async () => {
          const deadline = Date.now() + 1500;
          let stream = this.media.localStream();
          while (!stream?.getAudioTracks().some((t) => t.readyState !== 'ended') && Date.now() < deadline) {
            await new Promise<void>((r) => setTimeout(r, 100));
            stream = this.media.localStream();
          }
          if (!stream?.getAudioTracks().some((t) => t.readyState !== 'ended')) {
            console.warn('[sfu] publish proceeding without live audio track — mic may be unavailable');
          }
          const publishStream = this.effectiveLocalStream() ?? stream;
          await this.sfuClient.publish({ clientKey: readClientKey(), participantId, sessionId, localStream: publishStream });
          this.lastSfuVideoTrack = publishStream?.getVideoTracks()[0] ?? null;
          const state = this.sfuClient.localPublishState();
          if (state?.status === 'published') {
            this.ws.send({
              type: 'sfu-publish',
              cfSessionId: state.cfSessionId,
              tracks: state.tracks.filter((t) => t.status === 'live').map((t) => ({ trackName: t.trackName, kind: t.kind })),
            });
          }
        })().catch((err: unknown) => {
          console.error('[sfu-client] publish failed', err);
          this.actionNotice.set('Unable to start your audio/video. Please refresh the page.');
        });
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
    if (msg.type === 'share-request-incoming') {
      if (!this.isHost()) return;
      this.pendingShareRequests.update((requests) => {
        const next = requests.filter((request) => request.clientId !== msg.clientId);
        next.push({ clientId: msg.clientId, name: msg.name });
        return next;
      });
      this.status.set(`${msg.name} wants to share screen.`);
      return;
    }
    if (msg.type === 'share-request-cancelled') {
      this.pendingShareRequests.set(this.pendingShareRequests().filter((request) => request.clientId !== msg.clientId));
      return;
    }
    if (msg.type === 'share-decision') {
      this.myShareRequestPending.set(false);
      if (msg.approved) {
        this.status.set('Screen share approved.');
        await this.executeScreenToggle();
        return;
      }
      this.actionNotice.set(msg.reason || 'Host denied screen share');
      this.status.set(msg.reason || 'Screen share request denied.');
      return;
    }
    if (msg.type === 'share-revoked') {
      this.actionNotice.set("Host revoked your screen-share permission. Your current share continues; next time you'll need to ask again.");
      return;
    }
    if (msg.type === 'peer-joined') {
      this.status.set(`${msg.name} joined.`);
      this.rememberChatRecipient(msg.clientId, msg.name);
      const next = new Map(this.peerIdentities());
      next.set(msg.clientId, {
        name: msg.name,
        participantId: msg.participantId ?? msg.clientId,
        isHost: !!msg.host || msg.clientId === this.hostClientId(),
        isMobile: !!msg.isMobile,
        micEnabled: true,
        camEnabled: false,
        screenOn: false,
        reconnecting: false,
      });
      this.peerIdentities.set(next);
      if (this.state() === 'in-call') {
        this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
      }
      this.recorder.notifyParticipantJoined({
        clientId: msg.clientId,
        displayName: msg.name,
        isHost: !!msg.host || msg.clientId === this.hostClientId(),
      });
      this.queueDiagnosticsLog('state-change');
      return;
    }
    if (msg.type === 'peer-reconnecting') {
      this.status.set(`${msg.name} is reconnecting.`);
      const identity = this.peerIdentities().get(msg.clientId);
      if (identity) {
        const next = new Map(this.peerIdentities());
        next.set(msg.clientId, { ...identity, reconnecting: true });
        this.peerIdentities.set(next);
      }
      this.queueDiagnosticsLog('reconnect');
      return;
    }
    if (msg.type === 'peer-resumed') {
      this.status.set(`${msg.name} reconnected.`);
      this.sfuClient.removePeer(msg.oldClientId);
      this.rekeyChatThread(msg.oldClientId, msg.clientId, msg.name);
      this.peersWithShareGrant.update((ids) => {
        const next = new Set(ids);
        next.delete(msg.oldClientId);
        next.delete(msg.clientId);
        return next;
      });
      const next = new Map(this.peerIdentities());
      next.delete(msg.oldClientId);
      next.set(msg.clientId, {
        name: msg.name,
        participantId: msg.participantId ?? msg.clientId,
        isHost: !!msg.host || msg.clientId === this.hostClientId(),
        isMobile: !!msg.isMobile,
        micEnabled: true,
        camEnabled: false,
        screenOn: false,
        reconnecting: false,
      });
      this.peerIdentities.set(next);
      if (this.state() === 'in-call') {
        this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
      }
      this.recorder.notifyParticipantJoined({
        clientId: msg.clientId,
        displayName: msg.name,
        isHost: !!msg.host || msg.clientId === this.hostClientId(),
      });
      this.queueDiagnosticsLog('reconnect');
      return;
    }
    if (msg.type === 'media-state') {
      if (msg.clientId === this.myId()) return;
      const identity = this.peerIdentities().get(msg.clientId);
      if (identity) {
        const patch: Partial<PeerIdentity> = { micEnabled: msg.mic, camEnabled: msg.cam, screenOn: !!msg.screenOn };
        if (msg.isMobile !== undefined) patch.isMobile = !!msg.isMobile;
        const next = new Map(this.peerIdentities());
        next.set(msg.clientId, { ...identity, ...patch });
        this.peerIdentities.set(next);
      }
      this.queueDiagnosticsLog('state-change');
      return;
    }
    if (msg.type === 'chat') {
      if (msg.clientId === this.myId()) return;
      this.rememberChatRecipient(msg.clientId, msg.sender);
      this.appendChatMessage(CHAT_EVERYONE_THREAD, { ...msg, mine: false });
      if (!this.chatOpen() || this.activeChatRecipient() !== CHAT_EVERYONE_THREAD) this.incrementChatUnread(CHAT_EVERYONE_THREAD);
      return;
    }
    if (msg.type === 'chat-direct') {
      if (msg.clientId === this.myId()) return;
      this.rememberChatRecipient(msg.clientId, msg.sender);
      this.appendChatMessage(msg.clientId, { ...msg, mine: false });
      if (!this.chatOpen() || this.activeChatRecipient() !== msg.clientId) this.incrementChatUnread(msg.clientId);
      return;
    }
    if (msg.type === 'reaction') {
      if (msg.clientId === this.myId()) return;
      if (msg.kind === 'raise-hand') this.setRaisedHand(msg.clientId, msg.state !== 'off');
      else this.addTransientReaction(msg.clientId, msg.kind);
      return;
    }
    if (msg.type === 'mute-request') {
      this.media.muteMic();
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
    if (msg.type === 'room-closed') {
      const wasHost = this.isHost();
      this.flushDiagnosticsLog('call-end', { useBeacon: true });
      this.stopDiagnosticsLogger();
      this.ws.close();
      this.leaveDialogOpen.set(false);
      if (wasHost) {
        await this.directLeave(false);
        return;
      }
      const message = this.state() === 'knocking' || this.state() === 'waiting-room' ? 'Room has been closed.' : 'Room has been closed by the host.';
      this.actionNotice.set(message);
      this.status.set(message);
      this.error.set(message);
      setTimeout(() => {
        void this.directLeave(false);
      }, 900);
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
      this.sfuClient.removePeer(msg.clientId);
      const leavingName = this.peerIdentities().get(msg.clientId)?.name;
      if (leavingName) this.rememberChatRecipient(msg.clientId, leavingName);
      const next = new Map(this.peerIdentities());
      next.delete(msg.clientId);
      this.peerIdentities.set(next);
      this.removeKnocker(msg.clientId);
      this.pendingShareRequests.set(this.pendingShareRequests().filter((request) => request.clientId !== msg.clientId));
      this.peersWithShareGrant.update((ids) => {
        const nextGrants = new Set(ids);
        nextGrants.delete(msg.clientId);
        return nextGrants;
      });
      this.setRaisedHand(msg.clientId, false);
      this.transientReactions.set(this.transientReactions().filter((reaction) => reaction.clientId !== msg.clientId));
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
      // SFU-only: no WebRTC mesh signaling
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

  private setRaisedHand(clientId: string, raised: boolean): void {
    const next = new Set(this.raisedHands());
    if (raised) next.add(clientId);
    else next.delete(clientId);
    this.raisedHands.set(next);
  }

  private addTransientReaction(clientId: string, kind: Exclude<ReactionKind, 'raise-hand'>): void {
    const reaction: TransientReaction = { id: `${clientId}-${Date.now()}-${Math.random().toString(16).slice(2)}`, clientId, kind, timestamp: Date.now() };
    this.transientReactions.update((reactions) => [...reactions, reaction]);
    window.setTimeout(() => {
      this.transientReactions.set(this.transientReactions().filter((item) => item.id !== reaction.id));
    }, 3000);
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
      displayName: peer.isLocal ? this.displayName().trim() || peer.name || 'Anon' : peer.name,
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
    this.sfuClient.closeLiveTracksForExit();
    this.ws.close();
    this.recorder.discard();
    this.backgroundEffects.dispose();
    this.lastSfuVideoTrack = null;
    this.media.stopLocal();
    this.peerIdentities.set(new Map());
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
    this.chatThreads.set(new Map([[CHAT_EVERYONE_THREAD, []]]));
    this.activeChatRecipient.set(CHAT_EVERYONE_THREAD);
    this.chatUnreadByThread.set(new Map());
    this.chatRecipientNames.set(new Map());
    this.chatDraft.set('');
    this.pendingShareRequests.set([]);
    this.myShareRequestPending.set(false);
    this.peersWithShareGrant.set(new Set());
    this.raisedHands.set(new Set());
    this.transientReactions.set([]);
    this.shareStripCollapsed.set(false);
    this.leaveDialogOpen.set(false);
    this.meetingEndedToastOpen.set(false);
    this.deviceFailureNotice.set(null);
    this.actionNotice.set(null);
    this.screenShareHelp.set(null);
    this.shareCameraActive = false;
    this.shareCameraPreShareOn = null;
    this.shareCameraManualOverride.set(false);
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
      const track = await this.media.replaceAudioTrack(deviceId || undefined, (nextTrack) => this.sfuClient.replaceAudioTrack(nextTrack));
      if (track) {
        this.attachLocalTrackFailureHandlers(this.media.localStream() ?? new MediaStream([track]));
        this.micLevel.set(this.media.getMicLevel(this.media.localStream() ?? new MediaStream([track])));
        this.broadcastMediaState(track.enabled, this.media.cameraOn());
        this.queueDiagnosticsLog('state-change');
      }
    } catch (err) {
      if (deviceId) {
        try {
          const fallbackTrack = await this.media.replaceAudioTrack(undefined, (nextTrack) => this.sfuClient.replaceAudioTrack(nextTrack));
          if (fallbackTrack) {
            this.syncSelectedAudioIdToTrack(fallbackTrack);
            this.attachLocalTrackFailureHandlers(this.media.localStream() ?? new MediaStream([fallbackTrack]));
            this.micLevel.set(this.media.getMicLevel(this.media.localStream() ?? new MediaStream([fallbackTrack])));
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

  private async replaceInCallVideo(deviceId: string): Promise<void> {
    this.deviceDialogBusy.set(true);
    this.deviceDialogError.set(null);
    try {
      const track = await this.media.replaceVideoTrack(
        this.selectedVideoDeviceIdForRequest(),
        (nextTrack) => this.replaceEffectiveVideoTrack(nextTrack),
        this.videoFacingModeForRequest(true),
      );
      if (track) {
        this.broadcastMediaState(this.media.micOn(), true);
        this.queueDiagnosticsLog('state-change');
      }
    } catch (err) {
      this.deviceDialogError.set(`Camera switch failed: ${err instanceof Error ? err.message : 'unknown error'}`);
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
          const track = await this.media.replaceAudioTrack(candidate.deviceId, (nextTrack) => this.sfuClient.replaceAudioTrack(nextTrack));
          if (!track) continue;
          this.syncSelectedAudioIdToTrack(track);
          this.attachLocalTrackFailureHandlers(this.media.localStream() ?? new MediaStream([track]));
          this.micLevel.set(this.media.getMicLevel(this.media.localStream() ?? new MediaStream([track])));
          this.broadcastMediaState(track.enabled, this.media.cameraOn());
          this.actionNotice.set(this.recoveryNotice('microphone', candidate, track));
          this.queueDiagnosticsLog('state-change', 'local audio track recovered via replaceTrack');
          return;
        } catch (err) {
          console.debug('[devices] microphone recovery candidate failed', candidate.deviceId || 'default', err);
        }
      }
    }
    await this.sfuClient.replaceAudioTrack(null);
    this.media.removeAudioTrack();
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
          const track = await this.media.replaceVideoTrack(candidate.deviceId, (nextTrack) => this.replaceEffectiveVideoTrack(nextTrack));
          if (!track) continue;
          this.syncSelectedVideoIdToTrack(track);
          this.attachLocalTrackFailureHandlers(this.media.localStream() ?? new MediaStream([track]));
          this.broadcastMediaState(this.media.micOn(), true);
          this.actionNotice.set(this.recoveryNotice('camera', candidate, track));
          this.queueDiagnosticsLog('state-change', 'local video track recovered via replaceTrack');
          return;
        } catch (err) {
          console.debug('[devices] camera recovery candidate failed', candidate.deviceId || 'default', err);
        }
      }
    }
    await this.replaceEffectiveVideoTrack(null);
    this.media.removeVideoTrack();
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
    // SFU-only: no mesh share-camera policy needed
    void manualOverride;
    void localScreenShareActive;
  }

  private async setCameraTrackForShare(enabled: boolean, updateSender: boolean): Promise<void> {
    const nextEnabled = await this.media.setCameraTrackEnabled({
      enabled,
      videoDeviceId: enabled ? this.selectedVideoDeviceIdForRequest() : undefined,
      facingMode: enabled ? this.videoFacingModeForRequest(true) : undefined,
    });
    if (updateSender && !this.media.screenOn()) {
      await this.replaceEffectiveVideoTrack(nextEnabled ? this.media.localStream()?.getVideoTracks()[0] ?? null : null);
    }
    this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
  }

  private cameraVisibleDuringCurrentShare(): boolean {
    if (!this.anyScreenShareActive()) return true;
    if (this.media.screenOn()) return false;
    return this.shareCameraManualOverride();
  }

  private broadcastMediaState(mic: boolean, cam: boolean, screenOn = this.media.screenOn()): void {
    this.ws.send({ type: 'media-state', mic, cam, screenOn });
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
    const sfuDiagnostics = (await this.sfuClient.collectDiagnostics()) ?? undefined;
    const payload = this.buildDiagnosticsPayload(kind, options.error, sfuDiagnostics);
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

  private buildDiagnosticsPayload(kind: DiagnosticsPayload['kind'], error?: string, sfuDiagnostics?: SfuDiagnosticsSnapshot): DiagnosticsPayload {
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
      forceRelay: false,
      manualAudioOnly: false,
      outboundAudioLevel: null,
      outboundAudioEnergy: null,
      micSilent: null,
      peers: [],
    };
    if (sfuDiagnostics) payload.sfuDiagnostics = sfuDiagnostics;
    if (error) payload.error = error;
    return payload;
  }

  private appendChatMessage(threadId: string, message: ChatMessage): void {
    this.chatThreads.update((threads) => {
      const next = new Map(threads);
      next.set(threadId, [...(next.get(threadId) ?? []), message]);
      return next;
    });
    if (this.chatOpen() && this.activeChatRecipient() === threadId) this.scrollChatToBottom();
  }

  private ensureChatThread(threadId: string): void {
    if (this.chatThreads().has(threadId)) return;
    this.chatThreads.update((threads) => {
      const next = new Map(threads);
      next.set(threadId, []);
      return next;
    });
  }

  private incrementChatUnread(threadId: string): void {
    this.chatUnreadByThread.update((counts) => {
      const next = new Map(counts);
      next.set(threadId, Math.min(99, (next.get(threadId) ?? 0) + 1));
      return next;
    });
  }

  private clearChatUnreadFor(threadId: string): void {
    if (!this.chatUnreadByThread().has(threadId)) return;
    this.chatUnreadByThread.update((counts) => {
      const next = new Map(counts);
      next.delete(threadId);
      return next;
    });
  }

  private rememberChatRecipient(clientId: string, name: string): void {
    if (!clientId || clientId === this.myId()) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;
    this.chatRecipientNames.update((names) => {
      const next = new Map(names);
      next.set(clientId, trimmedName);
      return next;
    });
  }

  private rekeyChatThread(oldClientId: string, newClientId: string, name: string): void {
    this.rememberChatRecipient(newClientId, name);
    this.chatThreads.update((threads) => {
      if (!threads.has(oldClientId)) return threads;
      const next = new Map(threads);
      const oldMessages = next.get(oldClientId) ?? [];
      const newMessages = next.get(newClientId) ?? [];
      next.set(newClientId, [...newMessages, ...oldMessages]);
      next.delete(oldClientId);
      return next;
    });
    this.chatUnreadByThread.update((counts) => {
      if (!counts.has(oldClientId)) return counts;
      const next = new Map(counts);
      next.set(newClientId, Math.min(99, (next.get(newClientId) ?? 0) + (next.get(oldClientId) ?? 0)));
      next.delete(oldClientId);
      return next;
    });
    this.chatRecipientNames.update((names) => {
      const next = new Map(names);
      next.delete(oldClientId);
      if (name.trim()) next.set(newClientId, name.trim());
      return next;
    });
    if (this.activeChatRecipient() === oldClientId) this.activeChatRecipient.set(newClientId);
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

  private readonly handleVisibilityChange = (): void => {
    if (!this.shouldEnableBgPause() || this.state() !== 'in-call') return;
    const track = this.media.localStream()?.getVideoTracks()[0] ?? null;
    if (!track) return;
    if (document.visibilityState === 'hidden') {
      this.camOnBeforeBackground = track.enabled;
      if (track.enabled) {
        track.enabled = false;
        this.media.cameraOn.set(false);
        this.broadcastMediaState(this.media.micOn(), false);
      }
      return;
    }
    if (document.visibilityState === 'visible' && this.camOnBeforeBackground) {
      track.enabled = true;
      this.media.cameraOn.set(true);
      this.camOnBeforeBackground = false;
      this.broadcastMediaState(this.media.micOn(), true);
    }
  };

  private shouldEnableBgPause(): boolean {
    return this.viewport.isMobile() && this.platform.isMobileUA();
  }

  private resyncSignalingState(name: string): void {
    if (this.state() === 'in-call') {
      this.signalingResyncCount += 1;
      this.status.set('Reconnected to signaling. Resyncing room state...');
      this.queueDiagnosticsLog('reconnect', 'signaling websocket reopened; resyncing room state');
    }
    this.sendJoin(name);
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
    // Best effort only.
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

function readGuestDisplayName(): string {
  try {
    return window.localStorage.getItem(GUEST_DISPLAY_NAME_KEY) || '';
  } catch {
    return '';
  }
}

function storeGuestDisplayName(name: string): void {
  try {
    window.localStorage.setItem(GUEST_DISPLAY_NAME_KEY, name);
  } catch {
    // Best effort only.
  }
}

function storeDevice(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Best effort only.
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
      effectiveLocalStream?: MediaStream | null;
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
        quality?: string;
        audioOnlyReason?: string | null;
        isMobile?: boolean;
      }[];
      shareLayoutActive?: boolean;
      shareStripCollapsed?: boolean;
      anyScreenShareActive?: boolean;
      effectiveCameraOn?: boolean;
      shareCameraManualOverride?: boolean;
      pendingShareRequests?: { clientId: string; name: string }[];
      myShareRequestPending?: boolean;
      peersWithShareGrant?: string[];
      raisedHands?: string[];
      transientReactions?: { id: string; clientId: string; kind: string; timestamp: number }[];
      activeChatRecipient?: string;
      chatThreads?: Record<string, ChatMessage[]>;
      chatUnreadByThread?: Record<string, number>;
      screenShareAttempts: number;
      lastVideoConstraints?: MediaStreamConstraints | null;
      audioContextActivated?: boolean;
      speakerTestCount?: number;
      doorbellCount?: number;
      waitingKnockers?: { id: string; name: string }[];
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
      sfuPublishState?: LocalPublishState | null;
      sfuRemoteStreams?: Map<string, MediaStream>;
      sfuRemoteScreenStreams?: Map<string, MediaStream>;
      sfuGetStats?: () => Promise<RTCStatsReport | null>;
      sfuVideoEncodings?: () => RTCRtpEncodingParameters[];
      sfuUpdateCameraLayer?: () => Promise<void>;
      sfuSubscribedTracks?: () => Record<string, import('../../services/sfu-client.service').SubscribedTrackEntry>;
      closeSignalingForTest?: () => void;
      isMobile?: () => boolean;
      isIOS?: () => boolean;
      isAndroid?: () => boolean;
      injectActiveSpeakerStream?: (id: string, stream: MediaStream) => void;
      forceActiveSpeakerForTest?: (id: string | null) => void;
    };
  }
}
