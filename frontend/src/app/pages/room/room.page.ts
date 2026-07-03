import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, HostListener, OnDestroy, Signal, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { arrowBackOutline, colorWandOutline, desktopOutline, micOffOutline, micOutline, videocamOffOutline, videocamOutline } from 'ionicons/icons';
import { BackgroundPickerComponent } from '../../components/background-picker/background-picker.component';
import { restoreBackgroundFromStorage } from '../../components/background-picker/background-restore';
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
import { BackgroundLibraryService } from '../../services/background-library.service';
import { MediaError, MediaService, ScreenShareUnsupportedError } from '../../services/media.service';
import { MeetingSessionsService } from '../../services/meeting-sessions.service';
import type { DiagnosticsPayload, DiagnosticsPeerSample, DiagnosticsPostPayload, DiagnosticsTrackInfo, SfuConnectionQuality, SfuDiagnosticsSnapshot, SfuInboundTrackStats } from '../../services/meeting-sessions.service';
import {
  classifyMicCapture,
  deriveOutboundAudioFields,
  nextMicWarningState,
  INITIAL_SWEEP_GATE_STATE,
  MIC_SWEEP_RETRY_INTERVAL_MS,
  nextSweepGate,
  orderedMicCandidates,
  runMicSweep,
  type EnergySample,
  type SweepGateState,
  type SweepHooks,
} from '../../services/mic-energy';
import { diagnosticsGumError } from '../../services/diagnostics-gum-error';
import { buildLayerDiagnostics } from '../../services/diagnostics-layer-snapshot';
import { computeEffectiveDiagnosticsEnabled, readDiagnosticsLoggingEnabled } from '../../services/diagnostics-prefs';
import { isGenericAudioDeviceId, resolveSelectedAudioId } from '../../services/device-selection';
import { resolvedAcquiredDeviceId, type MediaAcquireStage } from '../../services/media-acquisition';
import { localAudioRecoveryTerminalMessage } from '../../services/local-media-recovery';
import { permissionBlockHint } from '../../services/media-toggle';
import { IceConfigService, type TurnHealthResult } from '../../services/ice-config.service';
import { PlatformService } from '../../services/platform.service';
import { isBuiltinBackgroundId, PeerBackground, PeerState } from '../../services/peer-state';
import { ParticipantSnapshot, RecorderService } from '../../services/recorder.service';
import {
  AUDIO_OUTPUT_DEVICE_STORAGE_KEY,
  applyMediaElementSinkWithDefaultFallback,
  combineSinkApplyResults,
  RemoteAudioService,
  type RemoteAudioDebugSnapshot,
  type SinkApplyResult,
  type VoiceRecoverySample,
} from '../../services/remote-audio.service';
import { RoomsService } from '../../services/rooms.service';
import { ViewportService } from '../../services/viewport.service';
import { ReactionKind, SignalingMessage, WsService } from '../../services/ws.service';
import { SfuClientService, type LocalPublishState } from '../../services/sfu-client.service';
import { planInitialPublishRetry } from '../../services/sfu-roster-utils';
import {
  classifyPeerAudioHealth,
  decideLocalTrackFailureRecovery,
  decideRemoteVoiceWatchdogAction,
  missingPreflightPrereqs,
  nextMicWorkingState,
  shouldAcquireMicTrackForToggle,
  shouldOpenDeviceDialogOnAudioFail,
  shouldReconcileAudioOutputAfterRefresh,
  shouldClearVideoPinAfterRefresh,
  shouldPromptGuestPassword,
  shouldRearmLobbySelfTest,
  shouldShowAudioFailNotice,
  shouldSubmitChat,
  shouldSurfacePublishFailure,
  storedDeviceAfterSelectionAttempt,
  type PeerAudioHealthInput,
  type PreflightGateStatus,
} from './room-decisions';
import { collectWithTimeout, DiagnosticsPostGate } from './room-diagnostics';
import { decideRoomLifecycleLeave } from './room-lifecycle';
import { recordPeerResumed, syncRecorderPeerStreams } from './room-recording';

const DIAGNOSTICS_LOG_INTERVAL_MS = 7_500;
const DIAGNOSTICS_EVENT_THROTTLE_MS = 2_000;
const CONNECTION_QUALITY_SAMPLE_INTERVAL_MS = 5_000;
const CONNECTION_QUALITY_EPISODE_SAMPLES = 3;
const EQUAL_SIZE_TILES_STORAGE_KEY = 'meet-poc.layout.equalSizeTiles';
const LOCAL_TRACK_MUTE_DEBOUNCE_MS = 1_200;
const DEVICE_RECOVERY_MAX_ATTEMPTS = 3;
const DEVICE_RECOVERY_BACKOFF_MS = 650;
// B2a post-publish capture-energy gate: ~500ms warm-up, then ~5 samples @700ms
// (≈3s window); ~3 re-samples @700ms (≈1.5-2s) after a relaxed re-acquire.
const CAPTURE_ENERGY_GATE_INITIAL_DELAY_MS = 500;
const CAPTURE_ENERGY_GATE_INTERVAL_MS = 700;
const CAPTURE_ENERGY_GATE_SAMPLES = 5;
const CAPTURE_ENERGY_GATE_RESAMPLES = 3;
// B2b in-call silent-mic watchdog: its OWN ~1s interval (the 7.5s diagnostics
// logger is too coarse to fill a sustained window). 6 samples ≈ a ~5-6s window.
const MIC_SILENCE_WATCHDOG_POLL_MS = 1_000;
const MIC_SILENCE_WATCHDOG_WINDOW = 6;
const REMOTE_AUDIO_KEEPALIVE_MS = 15_000;
const REMOTE_VOICE_WATCHDOG_POLL_MS = 1_500;
const PEER_AUDIO_GRACE_MS = 7_000;
const INITIAL_PUBLISH_RETRY_CAP = 3;
const INITIAL_PUBLISH_RETRY_BASE_BACKOFF_MS = 500;
const INITIAL_PUBLISH_RETRY_MAX_BACKOFF_MS = 2000;
// B5 — lobby self-test poller (R8): mirrors the in-call watchdog ~1s cadence on a
// SEPARATE lobbySelfTestFlag, reading the SAME classifyMicCapture verdict off the
// lobby capture window so a mic that publishes silence cannot show a false pass.
const LOBBY_SELF_TEST_POLL_MS = 1_000;
const GUEST_DISPLAY_NAME_KEY = 'guestDisplayName';
const ROOM_PASSWORD_PREFIX = 'meet-poc.roompw.';
const CHAT_EVERYONE_THREAD = 'everyone';

type RoomState = 'checking' | 'not-found' | 'lobby' | 'connecting' | 'waiting-room' | 'knocking' | 'in-call' | 'rejected' | 'error';
type ChatMessage = { id: string; clientId: string; sender: string; text: string; sentAt: number; mine: boolean; toClientId?: string };
type ChatRecipientTab = { id: string; name: string; online: boolean };
type ShareRequest = { clientId: string; name: string };
type TransientReaction = { id: string; clientId: string; kind: Exclude<ReactionKind, 'raise-hand'>; timestamp: number };
type ConnectionQualityTone = 'good' | 'fair' | 'poor' | 'relayed';
type LobbyError =
  | { kind: 'denied' }
  | { kind: 'no-devices' }
  | { kind: 'in-use' }
  | { kind: 'video-denied-but-audio-ok' }
  | { kind: 'unknown'; message: string };

type RemoteVoiceWatchdogPeerState = {
  samples: VoiceRecoverySample[];
  attemptsThisWindow: number;
};

type LocalTrackKind = 'audio' | 'video';
type LocalTrackFailureEvent = 'ended' | 'mute';
type LocalTrackFailureHandlerRefs = {
  track: MediaStreamTrack;
  onEnded: () => void;
  onMute: () => void;
  onUnmute: () => void;
};

class InitialPublishPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InitialPublishPermanentError';
  }
}

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
  background?: PeerBackground;
  /** Broadcast thumbnail for a peer's custom/account background (R8b) — cleared whenever their background switches away from a non-builtin image. */
  backgroundImage?: string | null;
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
  private readonly backgroundLibrary = inject(BackgroundLibraryService);

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
  readonly passwordPromptOpen = signal(false);
  readonly passwordDraft = signal('');
  readonly passwordError = signal<string | null>(null);
  readonly passwordBusy = signal(false);
  private readonly joinRoutePasswordRequired = signal(false);
  private readonly joinRouteIsOwner = signal(false);
  private verifiedRoomPassword: string | null = null;
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
  readonly remoteAudioUnhealthyIds = signal<ReadonlySet<string>>(new Set<string>());
  readonly deviceDialogBusy = signal(false);
  readonly deviceDialogError = signal<string | null>(null);
  readonly selectedSpeakerUnavailable = signal(false);
  // Non-blocking device issues (e.g. speaker fell back to system default) are NOT
  // shown as red in-call banners. They are recorded here, logged to diagnostics,
  // and surfaced to the host once, at end-of-call (the leave dialog).
  readonly callIssues = signal<readonly string[]>([]);
  readonly canSelectAudioOutput = signal(canSetSinkId());
  readonly canFlipCamera = computed(() => this.viewport.isMobile() && (this.state() === 'in-call' ? this.media.cameraOn() : this.cameraRequested()));
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
  // B2b — the single silent-mic warn surface (R2). Driven by both the continuous
  // in-call watchdog and B2a's post-publish one-shot fallback; auto-clears when
  // audio energy returns.
  readonly micSilentWarning = signal(false);
  // B2c — the message rendered in the single micSilentWarning surface. Default is
  // the B2b copy; the multi-device sweep swaps in the terminal "no working
  // microphone" copy when NO available mic produces energy (R10).
  readonly micSilentWarningMessage = signal("We can't detect sound from your microphone");
  // B5 — pre-call lobby self-test WARNING flag (R8). Driven by the lobby self-test
  // poller via classifyMicCapture + nextMicWarningState. true = mic is SILENT (bad);
  // false = working or untested. Feeds the "No sound detected" copy in both surfaces.
  // NOT used as the gate signal — see micWorking below.
  readonly lobbySelfTestFlag = signal(false);
  // CR-FIX-2: POSITIVE "mic confirmed energy" signal. true only when classifyMicCapture
  // returns 'working'; false on 'silent', mic-off, or untested (init). Gate signal.
  readonly micWorking = signal(false);
  // CR-FIX-2: true only when the user explicitly confirmed they heard the speaker tone
  // ("Did you hear it? → Yes"). Replaces speakerTestCount > 0 as the gate signal.
  readonly speakerVerified = signal(false);
  // CR-FIX-2: true while awaiting user Yes/No after the speaker tone plays.
  readonly speakerTestPending = signal(false);
  // Preflight gate status: tracks the pre-join device check + post-admit publish phase.
  readonly preflightGateStatus = signal<PreflightGateStatus>('pending');
  // True when the device-dialog "Confirm" button should enable.
  // Access-only (R10 + red-team): a live mic track is enough — a silent user must still be able to join.
  readonly preflightConfirmReady = computed(() => {
    const t = this.media.localStream()?.getAudioTracks()[0];
    return !!t && t.readyState === 'live';
  });
  // The human device name for the flag copy: the selected mic's MediaDeviceInfo
  // label, falling back to a generic phrase when the label is empty/blank (labels
  // are empty before the user grants mic permission).
  readonly selectedAudioLabel = computed(() => {
    const id = this.selectedAudioId();
    const label = this.audioInputs().find((device) => device.deviceId === id)?.label;
    return label && label.trim() ? label : 'this microphone';
  });
  readonly remoteAudioBlocked = signal(false);
  readonly equalSizeTiles = signal(readEqualSizeTiles());
  readonly setupWarning = signal<string | null>(null);
  readonly relayUnavailableWarning = signal(false);
  readonly relayConfigRetrying = signal(false);
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
  // R5 (B3b): diagnostics collect+upload requires BOTH the per-device user
  // toggle AND the global admin kill-switch (surfaced via AuthService /api/me).
  readonly effectiveDiagnosticsEnabled = computed(() =>
    computeEffectiveDiagnosticsEnabled(this.diagnosticsLoggingEnabled(), this.auth.diagnosticsGloballyEnabled()),
  );
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
        background: this.backgroundEffects.backgroundDescriptor(),
        backgroundImageUrl: this.backgroundEffects.localBackgroundImageUrl(),
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
        background: identity.background,
        backgroundImageUrl: identity.backgroundImage ?? null,
      });
    }
    return result;
  });
  readonly remotePeerCount = computed(() => this.peers().filter((peer) => !peer.isLocal).length);
  readonly connectionQuality = computed(() => this.sfuClient.connectionQuality());
  readonly connectionQualityLabel = computed(() => {
    const quality = this.connectionQuality();
    if (!quality || quality.band === 'unknown') return null;
    if (quality.band === 'poor') return 'Poor connection';
    if (quality.route === 'relayed') return 'Relayed';
    if (quality.band === 'fair') return 'Fair';
    return 'Good';
  });
  readonly connectionQualityTone = computed<ConnectionQualityTone | null>(() => {
    const quality = this.connectionQuality();
    if (!quality || quality.band === 'unknown') return null;
    if (quality.band === 'poor') return 'poor';
    if (quality.route === 'relayed') return 'relayed';
    return quality.band;
  });
  readonly connectionQualityTitle = computed(() => {
    const quality = this.connectionQuality();
    if (!quality || quality.band === 'unknown') return null;
    return [
      `Route: ${quality.route}`,
      `RTT: ${formatMetric(quality.rttMs, 'ms')}`,
      `Loss: ${formatMetric(quality.packetLossPct, '%')}`,
      `Jitter: ${formatMetric(quality.jitterMs, 'ms')}`,
    ].join(' | ');
  });
  readonly remoteEmphasisActive = computed(() => this.remotePeerCount() > 0 && !this.equalSizeTiles());
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
  // Google-Meet-style anti-mirror (R7): the LOCAL presenter never renders their own live
  // screenStream() back to themselves — when the shared surface includes this tab, that
  // self-view feeds into itself. Remote viewers are unaffected: they still read from
  // remoteScreenStreams over the SFU (see room.page.html's "You're presenting" branch).
  readonly shareStream = computed(() => {
    const peer = this.sharingPeer();
    if (!peer) return null;
    if (peer.isLocal) return null;
    return this.sfuClient.remoteScreenStreams().get(peer.id) ?? null;
  });
  readonly orderedStripPeers = computed(() => this.peers());
  readonly effectiveLocalStream = computed(() => this.effectiveStreamForSourceTrack());
  readonly showPeerWarning = computed(() => this.peers().length >= 6 && !this.warningDismissed());
  readonly hostRecording = signal(false);
  readonly recordingStartedAt = signal<number | null>(null);
  readonly currentSessionId = signal<string | null>(null);
  readonly actionNotice = signal<string | null>(null);
  readonly initialPublishFailureNotice = signal<string | null>(null);
  readonly initialPublishRetrying = signal(false);
  // Rung-4 (B2b): visible "audio unrecovered" affordance once the rung-3 full-rejoin throttle
  // (<=1/15s, <=2/2min) is exceeded — never a silent latched guard.
  readonly sfuRejoinUnrecoveredNotice = computed(() =>
    this.sfuClient.sfuRejoinThrottled()
      ? 'Audio for one or more participants could not be restored automatically.'
      : null,
  );
  // R4/B4 (Glory case): distinct from the notice above — this is YOUR OWN publish that couldn't be
  // restored after an automatic retry+rejoin escalation. Host-agnostic on purpose: the affected user
  // is exactly who needs to see it, not just the host (unlike the interim initialPublishFailureNotice).
  readonly publishRecoveryUnrecoverableNotice = computed(() =>
    this.sfuClient.publishRecoveryFailed() ? "We couldn't restore your audio automatically. Please rejoin to reconnect." : null,
  );
  private readonly callStartMs = signal<number | null>(null);
  private readonly clockTick = signal(0);
  private clockInterval: number | null = null;
  private visibilityListenerInstalled = false;
  private camOnBeforeBackground = false;
  private preflightTimer: number | null = null;
  private waitingRoomTimer: number | null = null;
  private diagnosticsLogTimer: number | null = null;
  private connectionQualityTimer: number | null = null;
  private remoteVoiceWatchdogTimer: number | null = null;
  private remoteVoiceWatchdogInFlight = false;
  private readonly remoteVoiceWatchdogPeers = new Map<string, RemoteVoiceWatchdogPeerState>();
  // B2b — in-call silent-mic watchdog: its own ~1s interval + rolling window.
  private micSilenceWatchdogTimer: number | null = null;
  private micSilenceWindow: { audioLevel: number | null; totalAudioEnergy: number | null }[] = [];
  // B5 — lobby self-test poller: its own ~1s interval, gated on lobby + mic-on.
  private lobbySelfTestTimer: number | null = null;
  private lastDiagnosticsEventAt = 0;
  private readonly diagnosticsPostGate = new DiagnosticsPostGate();
  private connectionQualityInFlight = false;
  private relayedConnectionSamples = 0;
  private poorConnectionSamples = 0;
  private relayEpisodeNotified = false;
  private poorEpisodeNotified = false;
  private shareCameraActive = false;
  private shareCameraPreShareOn: boolean | null = null;
  private readonly shareCameraManualOverride = signal(false);
  private shareCameraSyncRun = 0;
  private readonly reconnectToken = signal<string | null>(readReconnectToken(this.roomKey));
  private signalingResyncCount = 0;
  private joinAckWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly JOIN_ACK_TIMEOUT_MS = 5_000;
  private readonly JOIN_ACK_MAX_RESENDS = 3;
  private pendingListInitialized = false;
  private lastDoorbellAt = 0;
  private deviceChangeListenerInstalled = false;
  private lifecycleResumeInFlight = false;
  private audioRecoveryTimer: number | null = null;
  private videoRecoveryTimer: number | null = null;
  private readonly localTrackFailureHandlers: Partial<Record<LocalTrackKind, LocalTrackFailureHandlerRefs>> = {};
  private remoteAudioKeepaliveTimer: number | null = null;
  private audioRecoveryInFlight = false;
  private videoRecoveryInFlight = false;
  private remoteAudioInteractionRecoveryInstalled = false;
  private lastSfuVideoTrack: MediaStreamTrack | null = null;
  private readonly lastGumError = signal<DiagnosticsPayload['lastGumError']>(null);
  private initialPublishRunId = 0;
  // Incremented at TOP of publishInitialSfuWithRetry (before any early-return) so
  // publishTriggerCount===0 after admit → PATH A (trigger never fired).
  private publishTriggerCount = 0;
  private audioConnectingTimeoutId: number | null = null;
  // R9 host-badge: previous inbound-rtp bytesReceived snapshot per remote clientId.
  private readonly prevInboundBytes = new Map<string, number | null>();
  // R9 host-badge: first-seen timestamp per admitted peer (for grace-period flicker suppression).
  private readonly peerFirstSeen = new Map<string, number>();
  private joinAnywayWithStunFallback = false;
  private readonly forceRelayDiagnostic = signal<TurnHealthResult | null>(null);
  private readonly forceRelayDiagnosticRequested = signal(false);
  // B2a one-shot guard: the post-publish capture-energy gate runs at most once
  // per call. Reset in cleanupCall() so a fresh join re-arms it.
  private initialCaptureEnergyChecked = false;
  // B2c multi-device sweep guards: re-entrancy lock + bounded retry gate state.
  // Both reset in cleanupCall(); micSweepGateState re-arms on energy-return /
  // mute / devicechange via the watchdog and handleDeviceChangeAsync.
  private micSweepInProgress = false;
  private micSweepGateState: SweepGateState = { ...INITIAL_SWEEP_GATE_STATE };
  private readonly displayNameInput = viewChild<ElementRef<HTMLInputElement>>('displayNameInput');
  private readonly chatMessageList = viewChild<ElementRef<HTMLElement>>('chatMessageList');
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
    addIcons({ arrowBackOutline, colorWandOutline, desktopOutline, micOffOutline, micOutline, videocamOffOutline, videocamOutline });
    this.sfuClient.setTransportRecoveryHandler(() => this.republishSfuAfterTransportRecovery());
    this.installPageLifecycleCleanup();
    this.installDeviceChangeHandler();
    void this.bootstrap();
    effect(() => {
      const debug: any = {
        localStream: this.media.localStream(),
        effectiveLocalStream: this.effectiveLocalStream(),
        peers: this.peers().map((peer) => ({
          id: peer.id,
          participantId: peer.participantId,
          name: peer.name,
          state: peer.connectionState,
          reconnecting: peer.reconnecting,
          isHost: peer.isHost,
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
        speakerVerified: this.speakerVerified(),
        micWorking: this.micWorking(),
        hasMicAccess: (() => { const t = this.media.localStream()?.getAudioTracks()[0]; return !!t && t.readyState === 'live'; })(),
        doorbellCount: window.__meetDebug?.doorbellCount ?? 0,
        publishTriggerCount: this.publishTriggerCount,
        preflightGateStatus: this.preflightGateStatus(),
        waitingKnockers: this.knockers().map((knocker) => ({ ...knocker })),
        wsConnected: this.ws.connected(),
        wsStatus: this.ws.status(),
        wsHealth: this.ws.diagnosticsSnapshot(),
        forceAdmit: (clientId: string) => this.admit(clientId),
        wsReconnectAttempts: this.ws.reconnectAttempts(),
        wsResyncCount: this.signalingResyncCount,
        reconnectTokenPresent: !!this.reconnectToken(),
        clientKeyHash: hashClientKey(readClientKey()),
        myClientId: this.myId(),
        myParticipantId: this.myParticipantId(),
        roomState: this.state(),
        diagnosticsLoggingEnabled: this.diagnosticsLoggingEnabled(),
        forceRelayDiagnostic: this.forceRelayDiagnostic(),
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
        remoteAudioMixer: {
          ...this.remoteAudio.debugSnapshot(),
          debugSnapshot: () => this.remoteAudio.debugSnapshot(),
        } as RemoteAudioMixerDebug,
        sfuPublishState: this.sfuClient.localPublishState(),
        sfuConnectionQuality: this.sfuClient.connectionQuality(),
        sfuRemoteStreams: this.sfuClient.remoteStreams(),
        sfuRemoteScreenStreams: this.sfuClient.remoteScreenStreams(),
        closeSignalingForTest: () => this.ws.debugDropForReconnect(),
        isMobile: () => this.viewport.isMobile(),
        isIOS: () => this.platform.isIOS(),
        isAndroid: () => this.platform.isAndroid(),
        forceRelayDiagnostics: () => this.runForceRelayDiagnostics(),
        // Always expose (including public DEV / remote joins) for diagnostics, E2E, and cross-machine ICE inspection (B1+)
        sfuGetStats: () => this.sfuClient.getStats(),
        sfuVideoEncodings: () => this.sfuClient.getVideoEncodings(),
        sfuUpdateCameraLayer: () => this.sfuClient.updateCameraLayer(),
        sfuSubscribedTracks: () => Object.fromEntries(this.sfuClient.subscribedTracks()),
        sfuLastRecoveryEvent: () => this.sfuClient.lastRecoveryEvent(),
        sfuRejoinThrottled: () => this.sfuClient.sfuRejoinThrottled(),
        sfuPublishRecoveryFailed: () => this.sfuClient.publishRecoveryFailed(),
        sfuPcStates: () => {
          const pc = (this.sfuClient as any)?.pc ?? null;
          return pc ? {
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            iceGatheringState: pc.iceGatheringState,
            signalingState: pc.signalingState,
          } : null;
        },
      };
      if (window.location.hostname === 'localhost') {
        debug.injectActiveSpeakerStream = (id: string, stream: MediaStream) => this.activeSpeaker.injectDebugStream(id, stream);
        debug.forceActiveSpeakerForTest = (id: string | null) => this.activeSpeaker.forceActivePeerForTest(id);
        // B2b test-only: force the rung-4 visible-unrecovered state so an e2e can render + screenshot
        // the banner deterministically, without driving a real rejoin-throttle exhaustion.
        debug.forceSfuRejoinThrottledForTest = () => this.sfuClient.debugForceRejoinThrottledForTest();
        // R4/B4 test-only: force the publish-recovery-unrecoverable notice so an e2e can render +
        // screenshot it deterministically, without driving a real escalate-then-throttle exhaustion.
        debug.forcePublishRecoveryFailedForTest = () => this.sfuClient.debugForcePublishRecoveryFailedForTest();
        // B1 test-only: drive the live remote-audio AudioContext into 'suspended' so
        // an e2e can model the autoplay-blocked / suspended-with-sources negative path.
        // Attached to the remoteAudioMixer debug object (next to debugSnapshot()).
        const mixerDebug = debug.remoteAudioMixer as RemoteAudioMixerDebug;
        mixerDebug.__suspendForTest = () => this.remoteAudio.suspendForTest();
        // Mount a synthetic remote audio source into the live mixer so e2e can exercise
        // the sources.size > 0 running-required branch without flaky cross-context ICE.
        mixerDebug.__injectRemoteSourceForTest = (id: string, stream: MediaStream) => this.remoteAudio.injectRemoteSourceForTest(id, stream);
        mixerDebug.__removeRemoteSourceForTest = (id: string) => this.remoteAudio.removeRemoteSourceForTest(id);
      }
      window.__meetDebug = debug;
    });
    effect(() => {
      this.activeSpeaker.observe(this.peers());
    });
    effect(() => {
      this.remoteAudio.setInCallActive(this.state() === 'in-call');
      this.remoteAudio.syncPeers(this.peers(), this.sfuClient.remoteTrackNames());
    });
    effect(() => {
      this.remoteAudio.sourcesVersion();
      this.peers();
      if (this.state() !== 'in-call') return;
      this.remoteAudioBlocked.set(this.remoteAudio.remoteAudioBlocked());
    });
    effect(() => {
      const state = this.state();
      this.remoteAudio.sourcesVersion();
      const hasSources = this.remoteAudio.hasSources();
      const blocked = this.remoteAudio.remoteAudioBlocked();
      if (state !== 'in-call') {
        this.stopRemoteAudioKeepalive();
        this.stopRemoteVoiceWatchdog();
        this.uninstallRemoteAudioInteractionRecovery();
        return;
      }
      this.startRemoteAudioKeepalive();
      this.startRemoteVoiceWatchdog();
      if (blocked) this.installRemoteAudioInteractionRecovery();
      else this.uninstallRemoteAudioInteractionRecovery();
      if (blocked || hasSources) {
        window.setTimeout(() => {
          void this.recoverRemoteAudio('effect').catch((err) => console.debug('[media] remote audio effect recovery failed', err));
        }, 0);
      }
    });
    effect(() => {
      void this.syncShareCameraCut(this.anyScreenShareActive(), this.media.screenOn(), this.shareCameraManualOverride());
    });
    effect(() => {
      const deviceId = this.selectedAudioOutputId();
      this.peers();
      if (this.state() !== 'in-call' || !deviceId) return;
      window.setTimeout(() => {
        void this.applySpeakerDevice(deviceId)
          .then((result) => {
            if (this.selectedAudioOutputId() !== deviceId) return;
            this.setSpeakerUnavailable(result === 'default-fallback' || result === 'failed');
            if (result === 'selected' || result === 'unsupported') this.deviceDialogError.set(null);
            if (result === 'failed') this.deviceDialogError.set('Selected speaker is unavailable. Using the system default speaker.');
          })
          .catch((err) => console.debug('[devices] speaker routing refresh failed', err));
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
      syncRecorderPeerStreams(this.peers(), this.recorder);
    });
    effect(() => {
      this.backgroundEffects.backgroundDescriptor();
      if (this.state() !== 'in-call') return;
      untracked(() => this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn()));
    });
    // Separate from media-state on purpose: the heavy thumbnail payload only goes out when it
    // actually changes (background set / cleared / join), never on mic/cam toggles.
    effect(() => {
      const image = this.backgroundEffects.broadcastImage();
      if (this.state() !== 'in-call' || !image) return;
      untracked(() => this.broadcastBackgroundImage(image));
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
    // R8a: apply the persisted background before join so it's already active for the lobby
    // preview and the first published frame — independent of whether the (lazily-mounted)
    // picker panel is ever opened. Fire-and-forget: must not block room lookup below.
    void restoreBackgroundFromStorage(this.backgroundEffects, this.backgroundLibrary, this.viewport.isMobile());
    await this.auth.checkSession();
    const user = this.auth.user();
    const storedName = readGuestDisplayName();
    if (user && !this.displayName()) {
      // Authenticated users default to their account username (R1).
      this.displayName.set(user.displayName || user.email.split('@')[0] || user.email);
    } else if (storedName && !this.displayName()) {
      this.displayName.set(storedName);
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
      this.joinRoutePasswordRequired.set(!!info.passwordRequired);
      this.joinRouteIsOwner.set(!!info.isOwner);
      this.state.set('lobby');
      // A password verified on the /join page is stashed by slug — pick it up
      // so we join without re-prompting (works for both guest + signed-in paths).
      if (info.passwordRequired && !info.isOwner) {
        const stashed = readStoredRoomPassword(this.roomSlug()) ?? readStoredRoomPassword(this.roomKey);
        if (stashed) {
          this.verifiedRoomPassword = stashed;
          clearStoredRoomPassword(this.roomSlug());
          clearStoredRoomPassword(this.roomKey);
        }
      }
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
      if (info.passwordRequired && !info.isOwner && !this.verifiedRoomPassword) {
        this.passwordDraft.set('');
        this.passwordError.set(null);
        this.passwordPromptOpen.set(true);
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
    if (
      shouldPromptGuestPassword({
        passwordRequired: this.joinRoutePasswordRequired(),
        isOwner: this.joinRouteIsOwner(),
        verifiedPassword: this.verifiedRoomPassword,
      })
    ) {
      this.passwordDraft.set('');
      this.passwordError.set(null);
      this.passwordPromptOpen.set(true);
      return;
    }
    this.prepareLobbyDeviceCheck();
  }

  async submitRoomPassword(): Promise<void> {
    if (this.passwordBusy()) return;
    const candidate = this.passwordDraft();
    if (!candidate) {
      this.passwordError.set('Enter the password.');
      return;
    }
    this.passwordBusy.set(true);
    this.passwordError.set(null);
    try {
      const ok = await this.rooms.verifyPassword(this.roomSlug() || this.roomId, candidate);
      if (!ok) {
        this.passwordError.set('Incorrect password.');
        return;
      }
      this.verifiedRoomPassword = candidate;
      this.passwordPromptOpen.set(false);
      this.passwordDraft.set('');
      this.prepareLobbyDeviceCheck();
    } catch {
      this.passwordError.set('Unable to verify password. Try again.');
    } finally {
      this.passwordBusy.set(false);
    }
  }

  async join(): Promise<void> {
    if (this.state() === 'connecting') return;

    const initialMissing = this.missingJoinPrereqs();
    console.log('[GATE] initial missingJoinPrereqs:', initialMissing, 'displayName:', this.displayName().trim());
    if (initialMissing.includes('name')) {
      this.showJoinPrereqPopout(initialMissing);
      return;
    }

    await this.unlockAudioFromGesture(false);
    if (!this.hasMicAccess()) await this.startLobbyPreflight();
    const missing = this.missingJoinPrereqs();
    console.log('[GATE] missing after unlock/preflight:', missing, 'hasMicAccess:', this.hasMicAccess(), 'localStream?', !!this.media.localStream());
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
    console.log('[GATE] localStream truthiness after preflight:', !!this.media.localStream());
    if (!this.media.localStream()) {
      this.state.set('lobby');
      return;
    }
    await this.ensureSelectedAudioDevice('join');
    console.log('[GATE] localStream after ensureSelectedAudioDevice:', !!this.media.localStream());
    if (!this.media.localStream()) {
      this.state.set('lobby');
      return;
    }
    this.applyLobbyMicPreference();
    const iceOk = await this.checkIceConfigForJoin();
    console.log('[GATE] checkIceConfigForJoin result:', iceOk, 'lastFetchError:', this.iceConfig.lastFetchError?.());
    if (!iceOk) {
      this.state.set('lobby');
      this.status.set('');
      return;
    }
    console.log('[GATE] all prereqs passed, calling ws.connect');
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

  openBackgroundPickerFromControls(): void {
    this.backgroundPickerOpen.set(true);
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

  onPreflightConfirm(): void {
    this.joinPrereqPopout.set(null);
    this.lobbyDeviceDialogOpen.set(false);
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
    const previousSelectedId = this.selectedAudioId();
    const previousStoredId = readStoredDevice(DEVICE_STORAGE.audioInput);
    this.selectedAudioId.set(deviceId);
    let acquired = false;
    if (this.state() === 'in-call') {
      acquired = await this.replaceInCallAudio(deviceId);
      if (!acquired) {
        this.selectedAudioId.set(previousSelectedId);
        storeDevice(
          DEVICE_STORAGE.audioInput,
          storedDeviceAfterSelectionAttempt({ attemptSucceeded: false, previousStoredId, acquiredDeviceId: deviceId }),
        );
      }
      return;
    }
    // B5 / CR-FIX-2 — clear the prior device's self-test verdict so it can't bleed
    // onto the newly selected mic; reacquireLobbyStream re-arms the poller.
    this.lobbySelfTestFlag.set(false);
    this.micWorking.set(false);
    acquired = await this.reacquireLobbyStream();
    if (!acquired) {
      this.selectedAudioId.set(previousSelectedId);
      storeDevice(
        DEVICE_STORAGE.audioInput,
        storedDeviceAfterSelectionAttempt({ attemptSucceeded: false, previousStoredId, acquiredDeviceId: deviceId }),
      );
    }
  }

  async changeVideoDevice(deviceId: string): Promise<void> {
    const previousSelectedId = this.selectedVideoId();
    const previousStoredId = readStoredDevice(DEVICE_STORAGE.videoInput);
    const previousPinned = this.videoDevicePinned();
    this.selectedVideoId.set(deviceId);
    this.videoDevicePinned.set(!!deviceId);
    let acquired = false;
    if (this.state() === 'in-call') {
      acquired = await this.replaceInCallVideo(deviceId);
      if (!acquired) {
        this.selectedVideoId.set(previousSelectedId);
        this.videoDevicePinned.set(previousPinned);
        storeDevice(
          DEVICE_STORAGE.videoInput,
          storedDeviceAfterSelectionAttempt({ attemptSucceeded: false, previousStoredId, acquiredDeviceId: deviceId }),
        );
      }
      return;
    }
    if (!this.cameraRequested()) {
      storeDevice(DEVICE_STORAGE.videoInput, deviceId);
      return;
    }
    acquired = await this.reacquireLobbyStream();
    if (!acquired) {
      this.selectedVideoId.set(previousSelectedId);
      this.videoDevicePinned.set(previousPinned);
      storeDevice(
        DEVICE_STORAGE.videoInput,
        storedDeviceAfterSelectionAttempt({ attemptSucceeded: false, previousStoredId, acquiredDeviceId: deviceId }),
      );
    }
  }

  async changeAudioOutputDevice(deviceId: string): Promise<void> {
    this.deviceDialogError.set(null);
    // CR-FIX-2: switching speaker invalidates the prior test — user must re-verify
    // the new output device before the gate passes.
    this.speakerVerified.set(false);
    this.speakerTestPending.set(false);
    const result = await this.applySpeakerDevice(deviceId);
    this.selectedAudioOutputId.set(deviceId);
    storeDevice(DEVICE_STORAGE.audioOutput, deviceId);
    if (result !== 'failed') {
      this.setSpeakerUnavailable(result === 'default-fallback');
      if (result === 'default-fallback' && deviceId) {
        this.deviceDialogError.set('Selected speaker is unavailable. Using the system default speaker.');
      }
      return;
    }

    await this.applySpeakerDevice('');
    this.setSpeakerUnavailable(!!deviceId);
    if (deviceId) this.deviceDialogError.set('Selected speaker is unavailable. Using the system default speaker.');
  }

  async enableRemoteAudio(): Promise<void> {
    await this.unlockAudioFromGesture(true);
  }

  async testSpeaker(): Promise<void> {
    // CR-FIX-2: play tone, then require explicit "Did you hear it?" confirm before
    // marking speakerVerified. On autoplay error or oscillator failure treat as
    // not-verified + show guidance — never pass the gate on a click alone.
    this.speakerVerified.set(false);
    this.speakerTestPending.set(false);
    this.deviceDialogError.set(null);
    try {
      const AudioContextCtor = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('AudioContext unavailable');
      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 440;
      gain.gain.value = 0.2;
      oscillator.connect(gain);
      gain.connect(context.destination);
      await context.resume();
      oscillator.start();
      window.setTimeout(() => {
        oscillator.stop();
        void context.close();
      }, 1000);
      this.speakerTestPending.set(true);
    } catch {
      this.deviceDialogError.set('Could not play the test tone. Try unmuting your device or selecting a different speaker.');
    }
  }

  confirmSpeakerHeard(): void {
    this.speakerTestPending.set(false);
    this.speakerVerified.set(true);
    this.deviceDialogError.set(null);
  }

  speakerNotHeard(): void {
    this.speakerTestPending.set(false);
    this.speakerVerified.set(false);
    this.deviceDialogError.set('No sound? Try unmuting your device, raising the volume, or selecting a different speaker above.');
  }

  openInCallDeviceDialog(): void {
    this.deviceDialogError.set(null);
    this.inCallDeviceDialogOpen.set(true);
    void this.refreshDevices();
  }

  async enableMicPreview(): Promise<void> {
    await this.media.activateMicPreview(this.localStream());
    // B5 — the meter (and its capture window) only starts once the AudioContext is
    // activated; start the lobby self-test poller alongside it.
    if (this.state() === 'lobby') this.startLobbySelfTest();
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
    try {
      const requestedAudioDeviceId = this.selectedAudioId();
      const currentTrack = this.media.localStream()?.getAudioTracks()[0] ?? null;
      if (shouldAcquireMicTrackForToggle({
        trackExists: !!currentTrack,
        trackReadyState: currentTrack?.readyState,
      })) {
        const acquired = await this.replaceInCallAudio(requestedAudioDeviceId);
        if (acquired) {
          this.actionNotice.set(null);
          this.broadcastMediaState(this.media.micOn(), this.media.cameraOn());
        }
        return;
      }
      const mic = await this.media.toggleMic(
        async (track) => {
          await this.replaceSfuAudioTrackAndAnnounce(track);
        },
        { audioDeviceId: requestedAudioDeviceId || undefined },
      );
      if (mic) this.syncSelectedAudioIdToTrack(this.media.localStream()?.getAudioTracks()[0], requestedAudioDeviceId);
      this.actionNotice.set(null);
      this.broadcastMediaState(mic, this.media.cameraOn());
    } catch (err) {
      this.handleInCallMediaPermission(err, 'audio');
    }
  }

  async toggleCamera(): Promise<void> {
    if (this.anyScreenShareActive()) {
      await this.toggleCameraDuringShare();
      return;
    }
    try {
      const requestedVideoDeviceId = this.selectedVideoDeviceIdForRequest() ?? '';
      const cam = await this.media.toggleCamera(
        (track: MediaStreamTrack | null) => this.replaceEffectiveVideoTrack(track),
        {
          videoDeviceId: requestedVideoDeviceId || undefined,
          facingMode: this.videoFacingModeForRequest(true),
        },
      );
      if (cam && requestedVideoDeviceId) this.syncSelectedVideoIdToTrack(this.media.localStream()?.getVideoTracks()[0], requestedVideoDeviceId);
      this.actionNotice.set(null);
      this.broadcastMediaState(this.media.micOn(), cam);
    } catch (err) {
      this.handleInCallMediaPermission(err, 'video');
    }
  }

  private handleInCallMediaPermission(err: unknown, kind: 'audio' | 'video'): void {
    this.recordLastGumError(err);
    const hint = permissionBlockHint(kind, err);
    if (hint) {
      this.actionNotice.set(hint);
      return;
    }
    this.status.set(`${kind === 'audio' ? 'Microphone' : 'Camera'} access failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  async toggleScreen(): Promise<void> {
    // HACK for E2E FINALE loud-transcribe: allow non-host to share directly (host approval flow not auto in headless)
    // if (!this.media.screenOn() && !this.isHost()) {
    if (false && !this.media.screenOn() && !this.isHost()) {
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

  private async replaceSfuAudioTrackAndAnnounce(nextTrack: MediaStreamTrack | null): Promise<void> {
    const publishStateChanged = await this.sfuClient.replaceAudioTrackAndPublishIfNeeded(nextTrack);
    if (publishStateChanged) this.announceSfuPublishState();
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
    const publishStateChanged = await this.sfuClient.replaceVideoTrackAndPublishIfNeeded(nextTrack);
    this.lastSfuVideoTrack = nextTrack;
    if (publishStateChanged) this.announceSfuPublishState();
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
        await this.recorder.start(localStream, this.remoteStreams(), {
          sessionId: this.currentSessionId() || '',
          roomId: this.roomId,
          participants: this.participantSnapshot(),
        });
        this.ws.send({ type: 'recording-state', state: 'started' });
        const startSessionId = this.currentSessionId();
        if (startSessionId) localStorage.setItem(`recording-pending-${startSessionId}`, '1');
        this.status.set('Recording (audio mix: you + admitted peers).');
        return;
      }
      const blob = await withTimeout(this.recorder.stop(), 8000, null);
      this.ws.send({ type: 'recording-state', state: 'stopped' });
      if (!blob) {
        this.recorder.discard();
        this.status.set('Recording stopped, but the browser did not finish the file.');
        return;
      }
      this.status.set(`Uploading recording (${Math.round(blob.size / 1024)} KB)...`);
      const upload = await withTimeout(this.recorder.upload(blob, this.roomId), 300_000, null);
      if (!upload) {
        this.status.set('Recording stopped, but upload timed out.');
        return;
      }
      const uploadSessionId = this.currentSessionId();
      if (uploadSessionId) localStorage.removeItem(`recording-pending-${uploadSessionId}`);
      this.status.set(`Recording saved: ${upload.file}`);
      await this.recorder.uploadPerUser(this.roomId);
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

  handleChatEnter(event: Event): void {
    if (!shouldSubmitChat(event as KeyboardEvent)) return;
    this.sendChat(event);
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

  setEqualSizeTiles(enabled: boolean): void {
    this.equalSizeTiles.set(enabled);
    storeEqualSizeTiles(enabled);
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
    const uploadFailed = await this.flushRecordingForExit();
    if (uploadFailed) {
      this.recordCallIssue('Recording could not be saved — upload failed or timed out.');
      queueMicrotask(() => this.leaveDialogOpen.set(true));
      return;
    }
    await this.directLeave(true);
  }

  async endForAll(): Promise<void> {
    let uploadFailed = false;
    try {
      // T2: flush recording (stop + await both uploads) BEFORE close-room.
      uploadFailed = await this.flushRecordingForExit();
      this.ws.send({ type: 'close-room' });
      await delay(1000);
    } finally {
      // Close dialog first to destroy the component (resets its internal busy flag).
      this.leaveDialogOpen.set(false);
      if (uploadFailed) {
        // T6: surface failure in the leave dialog so the host can acknowledge before leaving.
        this.recordCallIssue('Recording could not be saved — upload failed or timed out.');
        // queueMicrotask gives Angular one tick to destroy + flush the previous dialog
        // instance, so the re-opened dialog has a clean busy=false state.
        queueMicrotask(() => this.leaveDialogOpen.set(true));
      } else {
        await this.directLeave(false);
      }
    }
  }

  // Shared flush used by both justLeave and endForAll: stops the recorder, awaits
  // the main upload (5-min cap) and per-user uploads concurrently, then clears the
  // T7 reconciliation key on success. Returns true if the upload failed/timed out
  // so callers can surface the T6 host notice.
  private async flushRecordingForExit(): Promise<boolean> {
    if (!this.recorder.isRecording()) return false;
    this.status.set("Saving recording… don't close the tab.");
    try {
      const blob = await withTimeout(this.recorder.stop(), 8000, null);
      this.ws.send({ type: 'recording-state', state: 'stopped' });
      if (!blob) {
        // MediaRecorder timed out without producing data; T7 reconciliation key stays
        // set so the banner appears on the next rooms-page load.
        return false;
      }
      const [mainResult] = await Promise.allSettled([
        withTimeout(this.recorder.upload(blob, this.roomId), 300_000, null),
        this.recorder.uploadPerUser(this.roomId),
      ]);
      const upload = mainResult.status === 'fulfilled' ? mainResult.value : null;
      if (upload) {
        const sessionId = this.currentSessionId();
        if (sessionId) localStorage.removeItem(`recording-pending-${sessionId}`);
        return false;
      }
      return true; // upload failed or timed out
    } catch (err) {
      console.warn('[rec-flush] recorder flush failed', err);
      return true;
    }
  }

  async dismissMeetingEnded(): Promise<void> {
    this.meetingEndedToastOpen.set(false);
    await this.directLeave(false);
  }

  async retryInitialPublish(): Promise<void> {
    if (this.initialPublishRetrying()) return;
    if (this.state() !== 'in-call' || this.sfuClient.localPublishState()?.status === 'published') {
      this.initialPublishFailureNotice.set(null);
      return;
    }
    const participantId = this.myParticipantId();
    const sessionId = this.currentSessionId();
    if (!participantId || !sessionId) {
      this.initialPublishFailureNotice.set('Audio/video could not start because this call session is no longer available. Rejoin the call to recover.');
      return;
    }
    await this.publishInitialSfuWithRetry(participantId, sessionId);
  }

  async retryRelayConfigForJoin(): Promise<void> {
    if (this.relayConfigRetrying() || this.state() === 'connecting') return;
    this.relayConfigRetrying.set(true);
    this.joinAnywayWithStunFallback = false;
    this.setupWarning.set('Retrying relay configuration...');
    try {
      await this.iceConfig.forceRefresh();
      if (this.iceConfig.relayUnavailable()) {
        this.showRelayUnavailableWarning();
        return;
      }
      this.relayUnavailableWarning.set(false);
      this.setupWarning.set(null);
      await this.join();
    } finally {
      this.relayConfigRetrying.set(false);
    }
  }

  async joinAnywayWithoutRelay(): Promise<void> {
    if (this.state() === 'connecting') return;
    this.joinAnywayWithStunFallback = true;
    this.relayUnavailableWarning.set(false);
    this.setupWarning.set(null);
    await this.join();
  }

  // Rung-4 "Retry" affordance — re-runs the same coalescing/throttle-gated rung-3 trigger (still
  // throttle-safe against repeated clicks).
  retrySfuRejoin(): void {
    this.sfuClient.retryFullSfuRejoinNow();
  }

  async rejoinAfterInitialPublishFailure(): Promise<void> {
    if (this.state() !== 'in-call') return;
    this.initialPublishRunId += 1;
    this.initialPublishFailureNotice.set(null);
    this.initialPublishRetrying.set(false);
    this.cleanupCall(true);
    this.state.set('lobby');
    this.status.set('Rejoining...');
    await this.startLobbyPreflight();
    await this.join();
  }

  async retryPublishAudio(): Promise<void> {
    if (this.initialPublishRetrying()) return;
    if (this.state() !== 'in-call') return;
    const participantId = this.myParticipantId();
    const sessionId = this.currentSessionId();
    if (!participantId || !sessionId) {
      this.preflightGateStatus.set('audio-failed');
      if (shouldShowAudioFailNotice({ isHost: this.isHost() })) {
        this.initialPublishFailureNotice.set('Session unavailable — please rejoin the call.');
      }
      return;
    }
    this.initialPublishRunId += 1;
    this.initialPublishFailureNotice.set(null);
    await this.publishInitialSfuWithRetry(participantId, sessionId);
  }

  private startAudioConnectingTimeout(): void {
    this.clearAudioConnectingTimeout();
    this.audioConnectingTimeoutId = window.setTimeout(() => {
      if (this.preflightGateStatus() === 'audio-connecting') {
        this.preflightGateStatus.set('audio-failed');
        if (shouldShowAudioFailNotice({ isHost: this.isHost() })) {
          this.initialPublishFailureNotice.set("We couldn't connect your audio in time. Check your internet and try again.");
        }
        if (shouldOpenDeviceDialogOnAudioFail({ isHost: this.isHost() })) {
          this.inCallDeviceDialogOpen.set(true);
        }
      }
    }, 15_000);
  }

  private clearAudioConnectingTimeout(): void {
    if (this.audioConnectingTimeoutId !== null) window.clearTimeout(this.audioConnectingTimeoutId);
    this.audioConnectingTimeoutId = null;
  }

  private async directLeave(sendLeaveMessage: boolean): Promise<void> {
    this.cleanupCall(sendLeaveMessage);
    await this.router.navigate([this.auth.user() ? '/app/rooms' : '/']);
  }

  ngOnDestroy(): void {
    this.sfuClient.setTransportRecoveryHandler(null);
    this.uninstallPageLifecycleCleanup();
    this.uninstallDeviceChangeHandler();
    this.cleanupCall();
    this.sfuClient.destroy();
    delete window.__meetDebug;
  }

  private async publishInitialSfuWithRetry(participantId: string, sessionId: string): Promise<void> {
    // Count ALL trigger fires (PATH A detector: publishTriggerCount===0 after admit
    // means this function was never called — trigger never fired).
    this.publishTriggerCount += 1;

    if (this.state() !== 'in-call' || this.sfuClient.localPublishState()?.status === 'published') return;

    this.preflightGateStatus.set('audio-connecting');
    this.startAudioConnectingTimeout();

    const runId = ++this.initialPublishRunId;
    this.initialPublishRetrying.set(true);
    this.initialPublishFailureNotice.set(null);
    this.actionNotice.set(null);

    let publishSucceeded = false;
    try {
      for (let attempt = 1; attempt <= INITIAL_PUBLISH_RETRY_CAP; attempt += 1) {
        if (runId !== this.initialPublishRunId || this.state() !== 'in-call') return;
        try {
          await this.publishSfuOnceAfterAdmit(participantId, sessionId);
          if (runId !== this.initialPublishRunId || this.state() !== 'in-call') return;
          // R3 real-transmission gate: 2s after a successful publish, confirm the
          // outbound-rtp audio sender is established. Checks stat EXISTENCE (not
          // bytesSent>0) so muted joiners pass — they are correctly published with
          // ~0 energy bytes but a valid outbound-rtp entry.
          await delay(2_000);
          if (runId !== this.initialPublishRunId || this.state() !== 'in-call') return;
          const trackEstablished = await this.sfuClient.hasOutboundAudioTrack();
          if (!trackEstablished) {
            console.error('[sfu-client] outbound-rtp audio stat absent after publish — transceiver not established');
            this.status.set('Audio/video did not start.');
            this.preflightGateStatus.set('audio-failed');
            // R4/B4: a terminal exit here already sets 'audio-failed', so the finally block's
            // shouldSurfacePublishFailure choke point never fires for it — escalate directly.
            // localPublishState is still 'published' at this point (publish() itself succeeded);
            // mark it as the transceiver failure it actually is first, or escalatePublishFailure's
            // own healthy-publish guard would see 'published' and silently no-op.
            this.sfuClient.markPublishAttemptFailed('outbound-rtp audio transceiver not established');
            this.sfuClient.escalatePublishFailure();
            if (shouldShowAudioFailNotice({ isHost: this.isHost() })) {
              this.initialPublishFailureNotice.set("Your audio wasn't accepted by the call. Check your network and try again.");
            }
            if (shouldOpenDeviceDialogOnAudioFail({ isHost: this.isHost() })) {
              this.inCallDeviceDialogOpen.set(true);
            }
            return;
          }
          this.initialPublishFailureNotice.set(null);
          this.preflightGateStatus.set('ready');
          publishSucceeded = true;
          return;
        } catch (err) {
          const retryableFailure = this.isRetryableInitialPublishFailure(err);
          const retry = planInitialPublishRetry({
            published: false,
            failedAttempt: attempt,
            cap: INITIAL_PUBLISH_RETRY_CAP,
            retryableFailure,
            baseBackoffMs: INITIAL_PUBLISH_RETRY_BASE_BACKOFF_MS,
            maxBackoffMs: INITIAL_PUBLISH_RETRY_MAX_BACKOFF_MS,
          });

          this.resetFailedInitialPublishAttempt();
          if (!retry.shouldRetry) {
            console.error('[sfu-client] initial publish failed permanently', err);
            this.status.set('Audio/video did not start.');
            this.actionNotice.set(null);
            this.preflightGateStatus.set('audio-failed');
            // R4/B4: same reasoning as the transceiver-check exit above — this terminal exit
            // already sets 'audio-failed', so escalate directly rather than relying on the
            // finally block's shouldSurfacePublishFailure choke point (it won't fire here).
            // markPublishAttemptFailed is a no-op if doPublish's own catch already set 'error'
            // (the common case); it only corrects the rarer case where the thrown error came from
            // a step after a successful publish() (e.g. republishLiveScreenTrackIfNeeded).
            this.sfuClient.markPublishAttemptFailed(String(err));
            this.sfuClient.escalatePublishFailure();
            if (shouldShowAudioFailNotice({ isHost: this.isHost() })) {
              this.initialPublishFailureNotice.set(this.initialPublishFailureMessage(retry.reason));
            }
            if (shouldOpenDeviceDialogOnAudioFail({ isHost: this.isHost() })) {
              this.inCallDeviceDialogOpen.set(true);
            }
            return;
          }

          console.warn('[sfu-client] initial publish failed; retrying', {
            attempt,
            nextAttempt: retry.nextAttempt,
            backoffMs: retry.backoffMs,
            err,
          });
          this.status.set(`Audio/video publish failed. Retrying (${retry.nextAttempt}/${INITIAL_PUBLISH_RETRY_CAP})...`);
          await delay(retry.backoffMs ?? 0);
        }
      }
    } finally {
      // Guard on runId: a concurrent new publish run must NOT have its timeout
      // cleared by this (older) run's finally block.
      if (runId === this.initialPublishRunId) {
        this.initialPublishRetrying.set(false);
        this.clearAudioConnectingTimeout();
        // CR-FIX-1 state-revert guard: any exit that did not reach 'ready' and
        // left the gate at 'audio-connecting' surfaces audio-failed here. The
        // preflightGateStatus check prevents a double-set when inner logic
        // already set 'audio-failed' before returning (retries exhausted,
        // transceiver check failed, etc.).
        if (shouldSurfacePublishFailure({ publishSucceeded, gateStatus: this.preflightGateStatus() })) {
          this.preflightGateStatus.set('audio-failed');
          if (shouldShowAudioFailNotice({ isHost: this.isHost() })) {
            this.initialPublishFailureNotice.set("We couldn't connect your audio. Check your connection and try again.");
          }
          if (shouldOpenDeviceDialogOnAudioFail({ isHost: this.isHost() })) {
            this.inCallDeviceDialogOpen.set(true);
          }
          // R4/B4: single choke point for every silent exit out of the retry loop above — escalate
          // to a full SFU rejoin (host and guest alike) rather than leaving recovery to a manual click.
          this.sfuClient.escalatePublishFailure();
        }
      }
    }
  }

  private async publishSfuOnceAfterAdmit(participantId: string, sessionId: string): Promise<void> {
    const publishStream = await this.initialPublishStream();
    await this.sfuClient.publish({ clientKey: readClientKey(), participantId, sessionId, localStream: publishStream });
    this.lastSfuVideoTrack = publishStream.getVideoTracks()[0] ?? null;
    await this.republishLiveScreenTrackIfNeeded();
    const state = this.sfuClient.localPublishState();
    if (state?.status !== 'published') throw new Error('[sfu] publish did not reach published state');
    try {
      this.announceSfuPublishState();
    } catch (err) {
      console.warn('[sfu-client] publish succeeded but announce failed', err);
    }
    // B2a: one-shot capture-energy gate — proves the published audio
    // track actually carries energy; recovers once on a silent-but-live mic.
    void this.verifyInitialCaptureEnergy();
  }

  private async republishLiveScreenTrackIfNeeded(): Promise<void> {
    const screenTrack = this.media.screenStream()?.getVideoTracks().find((track) => track.readyState !== 'ended') ?? null;
    if (!this.media.screenOn() || !screenTrack) return;
    const hasScreenTrack = this.sfuClient.localPublishState()?.tracks.some((track) => track.kind === 'screen' && track.status === 'live') ?? false;
    if (hasScreenTrack) return;
    try {
      await this.sfuClient.publishScreen(screenTrack);
    } catch (err) {
      this.sfuClient.resetForTransportRecovery();
      throw err;
    }
  }

  private async republishSfuAfterTransportRecovery(): Promise<void> {
    const participantId = this.myParticipantId();
    const sessionId = this.currentSessionId();
    if (this.state() !== 'in-call' || !participantId || !sessionId) {
      throw new Error('[sfu] transport recovery cannot republish without an active call session');
    }
    this.status.set('Reconnecting audio/video...');
    await this.publishInitialSfuWithRetry(participantId, sessionId);
    if (this.sfuClient.localPublishState()?.status !== 'published') {
      throw new Error('[sfu] transport recovery republish did not reach published state');
    }
  }

  private async initialPublishStream(): Promise<MediaStream> {
    const deadline = Date.now() + 1500;
    let stream = this.media.localStream();
    while (!stream?.getAudioTracks().some((t) => t.readyState !== 'ended') && Date.now() < deadline) {
      await delay(100);
      stream = this.media.localStream();
    }
    if (!stream?.getAudioTracks().some((t) => t.readyState !== 'ended')) {
      throw new InitialPublishPermanentError('[sfu] no live audio track at deadline — check microphone in settings');
    }
    const publishStream = this.effectiveLocalStream() ?? stream;
    if (!publishStream?.getTracks().some((t) => t.readyState !== 'ended')) {
      throw new InitialPublishPermanentError('[sfu] cannot publish without any live local media track');
    }
    return publishStream;
  }

  private isRetryableInitialPublishFailure(err: unknown): boolean {
    if (err instanceof InitialPublishPermanentError) return false;
    const status = (err as { status?: unknown } | null)?.status;
    if (typeof status === 'number') {
      if (status === 0 || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) return true;
      if (status >= 400) return false;
    }
    const message = err instanceof Error ? err.message : String(err ?? '');
    if (/no live local media track|cannot publish without|permission denied|notallowed|not found|no track/i.test(message)) return false;
    return true;
  }

  private initialPublishFailureMessage(reason: 'published' | 'retryable' | 'capped' | 'permanent'): string {
    if (reason === 'permanent') return 'Audio/video could not start from the current device state. Retry after checking your device, or rejoin the call.';
    return 'Audio/video could not start after several retries. Retry audio/video, or rejoin the call.';
  }

  private resetFailedInitialPublishAttempt(): void {
    if (this.sfuClient.localPublishState()?.status === 'published') return;
    this.sfuClient.resetFailedPublishAttempt();
  }

  private async handleMessage(msg: SignalingMessage): Promise<void> {
    if (msg.type === 'reconnect-token') {
      this.reconnectToken.set(msg.token);
      storeReconnectToken(this.roomKey, msg.token);
      return;
    }
    if (msg.type === 'knocking') {
      this.clearJoinAckWatchdog();
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
      this.clearJoinAckWatchdog();
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
      this.cleanupCall();
      this.error.set(msg.message);
      this.state.set('error');
      return;
    }
    if (msg.type === 'rejected') {
      this.clearJoinAckWatchdog();
      this.cleanupCall();
      this.error.set(msg.reason ? `Host: ${msg.reason}` : 'The host rejected your request.');
      this.state.set('rejected');
      return;
    }
    if (msg.type === 'displaced') {
      // This room was resumed by another tab/device with the same identity.
      // cleanupCall closes the socket intentionally, so we do NOT auto-reconnect
      // (which would ping-pong with the other session).
      this.cleanupCall();
      this.error.set('This room was opened in another tab or device. Close this one, or rejoin to take over here.');
      this.state.set('error');
      return;
    }
    if (msg.type === 'admitted') {
      this.clearJoinAckWatchdog();
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
        // State-revert guard is in publishInitialSfuWithRetry's finally block.
        // .catch() surfaces any unexpected outer throw not caught internally.
        void this.publishInitialSfuWithRetry(participantId, sessionId)
          .catch((err: unknown) => {
            console.error('[sfu-client] publish failed with unexpected outer error', err);
            this.preflightGateStatus.set('audio-failed');
            if (shouldShowAudioFailNotice({ isHost: this.isHost() })) {
              this.initialPublishFailureNotice.set("We couldn't connect your audio. Check your connection and try again.");
            }
            if (shouldOpenDeviceDialogOnAudioFail({ isHost: this.isHost() })) {
              this.inCallDeviceDialogOpen.set(true);
            }
          });
      } else {
        // PATH A guard: admit without participantId/sessionId → never-publish is now loud.
        console.error('[sfu-client] admitted without participantId/sessionId — cannot publish');
        this.preflightGateStatus.set('audio-failed');
        if (shouldShowAudioFailNotice({ isHost: this.isHost() })) {
          this.initialPublishFailureNotice.set("We couldn't start your audio — the session ID is missing. Please rejoin.");
        }
      }
      this.startDiagnosticsLogger();
      this.startMicSilenceWatchdog();
      this.startConnectionQualitySampler();
      this.queueDiagnosticsLog('state-change');
      if (wasInCall) this.status.set('Reconnected.');
      return;
    }
    if (msg.type === 'pending-list') {
      this.syncKnockers(msg.knockers || []);
      return;
    }
    if (msg.type === 'host-role') {
      this.applyHostRole(msg.clientId, !!msg.isHost);
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
        const broadcastImage = this.backgroundEffects.broadcastImage();
        if (broadcastImage) this.broadcastBackgroundImage(broadcastImage);
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
      this.sfuClient.removePeer(msg.clientId);
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
      recordPeerResumed(this.recorder, msg.oldClientId, {
        clientId: msg.clientId,
        displayName: msg.name,
        isHost: !!msg.host || msg.clientId === this.hostClientId(),
      });
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
        const broadcastImage = this.backgroundEffects.broadcastImage();
        if (broadcastImage) this.broadcastBackgroundImage(broadcastImage);
      }
      this.queueDiagnosticsLog('reconnect');
      return;
    }
    if (msg.type === 'media-state') {
      if (msg.clientId === this.myId()) return;
      const identity = this.peerIdentities().get(msg.clientId);
      if (identity) {
        const patch: Partial<PeerIdentity> = { micEnabled: msg.mic, camEnabled: msg.cam, screenOn: !!msg.screenOn };
        if (msg.isMobile !== undefined) patch.isMobile = !!msg.isMobile;
        if (msg.background) {
          patch.background = msg.background;
          // A non-image (or builtin-image) descriptor means whatever broadcast thumbnail we hold
          // for this peer is stale — clear it so resolveCamOffBackdropUrl falls through correctly
          // instead of showing a background this peer switched away from.
          if (msg.background.kind !== 'image' || isBuiltinBackgroundId(msg.background.id ?? '')) {
            patch.backgroundImage = null;
          }
        }
        const next = new Map(this.peerIdentities());
        next.set(msg.clientId, { ...identity, ...patch });
        this.peerIdentities.set(next);
      }
      this.queueDiagnosticsLog('state-change');
      return;
    }
    if (msg.type === 'background-image') {
      if (msg.clientId === this.myId()) return;
      const identity = this.peerIdentities().get(msg.clientId);
      if (identity) {
        const next = new Map(this.peerIdentities());
        next.set(msg.clientId, { ...identity, backgroundImage: msg.image });
        this.peerIdentities.set(next);
      }
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
      const wasHost = this.isHost();
      this.cleanupCall(false);
      if (!wasHost) {
        this.meetingEndedToastOpen.set(true);
      }
      return;
    }
    if (msg.type === 'room-closed') {
      this.clearJoinAckWatchdog();
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
      this.clearJoinAckWatchdog();
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

  private applyHostRole(clientId: string, isHost: boolean): void {
    const currentHostId = this.hostClientId();
    if (isHost) {
      this.hostClientId.set(clientId);
    } else if (currentHostId === clientId) {
      this.hostClientId.set(this.isOwner() && this.myId() ? this.myId() : null);
    }
    const nextHostId = this.hostClientId();
    const identities = new Map(this.peerIdentities());
    let changed = false;
    for (const [id, identity] of identities) {
      const nextIsHost = id === nextHostId;
      if (identity.isHost !== nextIsHost) {
        identities.set(id, { ...identity, isHost: nextIsHost });
        changed = true;
      }
    }
    if (changed) this.peerIdentities.set(identities);
    if (!this.isHost()) {
      this.knockers.set([]);
      this.pendingShareRequests.set([]);
    }
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
    this.waitingRoomTimer = window.setInterval(tick, 1000);
  }

  private stopWaitingRoomCountdown(): void {
    if (this.waitingRoomTimer) window.clearInterval(this.waitingRoomTimer);
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
    this.setSpeakerUnavailable(false);
    this.relayUnavailableWarning.set(false);
    this.error.set(null);
    try {
      const requestedAudioDeviceId = this.selectedAudioId();
      const requestedVideoDeviceId = this.selectedVideoDeviceIdForRequest() ?? '';
      const stream = await this.media.preflight({
        audio: true,
        video: this.cameraRequested(),
        audioDeviceId: requestedAudioDeviceId || undefined,
        videoDeviceId: requestedVideoDeviceId || undefined,
        facingMode: this.videoFacingModeForRequest(this.cameraRequested()),
      });
      this.attachLocalTrackFailureHandlers(stream);
      this.applyLobbyMicPreference(stream);
      this.micLevel.set(this.media.getMicLevel(stream));
      this.startLobbySelfTest();
      await this.refreshDevices();
      this.syncSelectedAudioIdToTrack(stream.getAudioTracks()[0], requestedAudioDeviceId);
      if (this.cameraRequested() && requestedVideoDeviceId) this.syncSelectedVideoIdToTrack(stream.getVideoTracks()[0], requestedVideoDeviceId);
      await this.ensureSelectedAudioDevice('lobby-preflight');
    } catch (err) {
      const recovered = await this.handleLobbyMediaError(err, this.cameraRequested());
      if (!recovered) this.deviceDialogError.set((err as MediaError).message || 'Device setup failed');
    } finally {
      this.deviceDialogBusy.set(false);
    }
  }

  private async reacquireLobbyStream(): Promise<boolean> {
    if (this.state() !== 'lobby') return false;
    this.clearPreflightTimer();
    this.devicePermissionIntro.set(false);
    this.deviceDialogBusy.set(true);
    this.deviceDialogError.set(null);
    this.permissionError.set(null);
    this.setupWarning.set(null);
    this.error.set(null);
    try {
      const requestedAudioDeviceId = this.selectedAudioId();
      const requestedVideoDeviceId = this.selectedVideoDeviceIdForRequest() ?? '';
      const stream = await this.media.reacquire({
        audioDeviceId: requestedAudioDeviceId || undefined,
        videoDeviceId: requestedVideoDeviceId || undefined,
        facingMode: this.videoFacingModeForRequest(this.cameraRequested()),
        video: this.cameraRequested(),
      });
      this.attachLocalTrackFailureHandlers(stream);
      this.applyLobbyMicPreference(stream);
      this.micLevel.set(this.media.getMicLevel(stream));
      this.startLobbySelfTest();
      await this.refreshDevices();
      this.syncSelectedAudioIdToTrack(stream.getAudioTracks()[0], requestedAudioDeviceId);
      if (this.cameraRequested() && requestedVideoDeviceId) this.syncSelectedVideoIdToTrack(stream.getVideoTracks()[0], requestedVideoDeviceId);
      await this.ensureSelectedAudioDevice('lobby-reacquire');
      return true;
    } catch (err) {
      const recovered = await this.handleLobbyMediaError(err, this.cameraRequested());
      if (!recovered) this.deviceDialogError.set((err as MediaError).message || 'Device change failed');
      return recovered;
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
    if (this.preflightTimer) window.clearTimeout(this.preflightTimer);
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
    const preflightMissing = missingPreflightPrereqs({
      hasMicAccess: this.hasMicAccess(),
    });
    for (const item of preflightMissing) missing.push(item);
    return missing;
  }

  private hasMicAccess(): boolean {
    const stream = this.media.localStream();
    const audioTrack = stream?.getAudioTracks()[0];
    const has = !!audioTrack && audioTrack.readyState === 'live';
    console.log('[GATE] hasMicAccess check: stream?', !!stream, 'track?', !!audioTrack, 'readyState:', audioTrack?.readyState, 'result:', has);
    return has;
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

  private async checkIceConfigForJoin(): Promise<boolean> {
    await this.iceConfig.getIceServers();
    const fetchError = this.iceConfig.lastFetchError();
    console.log('[GATE] checkIceConfigForJoin: fetchError=', fetchError);
    const allowFallback = this.joinAnywayWithStunFallback;
    this.joinAnywayWithStunFallback = false;
    if (fetchError && !allowFallback) {
      this.showRelayUnavailableWarning();
      return false;
    }
    this.relayUnavailableWarning.set(false);
    this.setupWarning.set(fetchError ? 'Joining with fallback STUN only. You may not connect on restrictive networks.' : null);
    return true;
  }

  private async handleLobbyMediaError(err: unknown, videoRequested: boolean): Promise<boolean> {
    const mediaError = err as MediaError;
    this.recordLastGumError(mediaError);
    if (videoRequested) {
      try {
        const stream = await this.media.preflight({ audio: true, video: false, audioDeviceId: this.selectedAudioId() || undefined });
        this.cameraRequested.set(false);
        this.permissionError.set({ kind: 'video-denied-but-audio-ok' });
        this.error.set(null);
        this.deviceDialogError.set(null);
        this.attachLocalTrackFailureHandlers(stream);
        this.applyLobbyMicPreference(stream);
        this.micLevel.set(this.media.getMicLevel(stream));
        await this.refreshDevices();
        return true;
      } catch (fallbackErr) {
        this.recordLastGumError(fallbackErr);
        this.permissionError.set(toLobbyError(fallbackErr as MediaError));
        this.error.set((fallbackErr as MediaError).message || 'Media access failed');
        return false;
      }
    }
    this.permissionError.set(toLobbyError(mediaError));
    this.error.set(mediaError.message || 'Media access failed');
    return false;
  }

  private async refreshDevices(): Promise<void> {
    const devices = await this.media.enumerateDevices();
    this.audioInputs.set(devices.audioInputs);
    this.audioOutputs.set(devices.audioOutputs);
    this.videoInputs.set(devices.videoInputs);
    if (!this.selectedAudioId() || !devices.audioInputs.some((device) => device.deviceId === this.selectedAudioId())) {
      this.selectedAudioId.set(preferredDeviceId(DEVICE_STORAGE.audioInput, devices.audioInputs, this.selectedAudioId()));
    }
    if (!this.selectedVideoId() || shouldClearVideoPinAfterRefresh({
      selectedDeviceId: this.selectedVideoId(),
      availableDeviceIds: devices.videoInputs.map((device) => device.deviceId),
    })) {
      if (this.selectedVideoId()) this.videoDevicePinned.set(false);
      this.selectedVideoId.set(preferredDeviceId(DEVICE_STORAGE.videoInput, devices.videoInputs, this.selectedVideoId()));
    }
    const selectedOutputId = this.selectedAudioOutputId();
    const selectedOutputMissing = shouldReconcileAudioOutputAfterRefresh({
      selectedDeviceId: selectedOutputId,
      availableDeviceIds: devices.audioOutputs.map((device) => device.deviceId),
    });
    if (!selectedOutputId || selectedOutputMissing) {
      const fallbackOutputId = preferredDeviceId(DEVICE_STORAGE.audioOutput, devices.audioOutputs, selectedOutputMissing ? '' : selectedOutputId);
      this.selectedAudioOutputId.set(fallbackOutputId);
      if (selectedOutputMissing) {
        storeDevice(DEVICE_STORAGE.audioOutput, fallbackOutputId);
        this.setSpeakerUnavailable(devices.audioOutputs.length > 0);
        if (devices.audioOutputs.length > 0) this.deviceDialogError.set('Selected speaker is unavailable. Using the system default speaker.');
      }
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
    if (
      isGenericAudioDeviceId(currentDeviceId)
      && this.audioInputs().some((device) => device.deviceId === selectedDeviceId)
    ) return;

    console.info(`[devices] reconciling selected microphone for ${reason}; selected=${selectedDeviceId} current=${currentDeviceId || 'unknown'}`);
    if (this.state() === 'in-call') {
      await this.replaceInCallAudio(selectedDeviceId);
      return;
    }
    await this.reacquireLobbyAudioDevice(selectedDeviceId);
  }

  private async reacquireLobbyAudioDevice(deviceId: string): Promise<void> {
    try {
      const requestedVideoDeviceId = this.selectedVideoDeviceIdForRequest() ?? '';
      const stream = await this.media.reacquire({
        audioDeviceId: deviceId,
        videoDeviceId: requestedVideoDeviceId || undefined,
        facingMode: this.videoFacingModeForRequest(this.cameraRequested()),
        video: this.cameraRequested(),
      });
      this.attachLocalTrackFailureHandlers(stream);
      this.applyLobbyMicPreference(stream);
      this.micLevel.set(this.media.getMicLevel(stream));
      this.syncSelectedAudioIdToTrack(stream.getAudioTracks()[0], deviceId);
      if (this.cameraRequested() && requestedVideoDeviceId) this.syncSelectedVideoIdToTrack(stream.getVideoTracks()[0], requestedVideoDeviceId);
    } catch (err) {
      console.warn('[devices] selected microphone unavailable; falling back to default audio', err);
      await this.reacquireDefaultLobbyAudio();
    }
  }

  private async reacquireDefaultLobbyAudio(): Promise<void> {
    try {
      const requestedVideoDeviceId = this.selectedVideoDeviceIdForRequest() ?? '';
      const stream = await this.media.reacquire({
        audioDeviceId: undefined,
        videoDeviceId: requestedVideoDeviceId || undefined,
        facingMode: this.videoFacingModeForRequest(this.cameraRequested()),
        video: this.cameraRequested(),
      });
      this.attachLocalTrackFailureHandlers(stream);
      this.applyLobbyMicPreference(stream);
      this.micLevel.set(this.media.getMicLevel(stream));
      this.syncSelectedAudioIdToTrack(stream.getAudioTracks()[0]);
      if (this.cameraRequested() && requestedVideoDeviceId) this.syncSelectedVideoIdToTrack(stream.getVideoTracks()[0], requestedVideoDeviceId);
      this.setupWarning.set('Selected microphone is unavailable. Using the system default microphone.');
    } catch (fallbackErr) {
      const recovered = await this.handleLobbyMediaError(fallbackErr, this.cameraRequested());
      if (!recovered) this.deviceDialogError.set((fallbackErr as MediaError).message || 'Device setup failed');
    }
  }

  private cleanupCall(sendLeaveMessage = false): void {
    if (this.state() === 'in-call') this.flushDiagnosticsLog('call-end', { useBeacon: true });
    this.stopDiagnosticsLogger();
    this.stopRemoteVoiceWatchdog();
    this.stopMicSilenceWatchdog();
    this.stopLobbySelfTest();
    this.stopConnectionQualitySampler();
    this.detachLocalTrackFailureHandlers();
    this.clearLocalTrackRecoveryTimers();
    this.clearPreflightTimer();
    this.clearJoinAckWatchdog();
    this.stopWaitingRoomCountdown();
    if (sendLeaveMessage && (this.state() === 'in-call' || this.state() === 'knocking' || this.state() === 'waiting-room')) this.ws.send({ type: 'leave' });
    this.sfuClient.closeLiveTracksForExit();
    this.ws.close();
    this.recorder.discard();
    this.backgroundEffects.dispose();
    this.lastSfuVideoTrack = null;
    this.lastGumError.set(null);
    this.initialPublishRunId += 1;
    this.publishTriggerCount = 0;
    this.preflightGateStatus.set('pending');
    this.speakerVerified.set(false);
    this.speakerTestPending.set(false);
    this.clearAudioConnectingTimeout();
    this.initialPublishRetrying.set(false);
    this.initialPublishFailureNotice.set(null);
    this.setSpeakerUnavailable(false);
    this.initialCaptureEnergyChecked = false;
    this.micSweepInProgress = false;
    this.micSweepGateState = { ...INITIAL_SWEEP_GATE_STATE };
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
    this.micSilentWarning.set(false);
    this.micSilentWarningMessage.set("We can't detect sound from your microphone");
    this.actionNotice.set(null);
    this.screenShareHelp.set(null);
    this.shareCameraActive = false;
    this.shareCameraPreShareOn = null;
    this.shareCameraManualOverride.set(false);
    this.setupWarning.set(null);
    this.relayUnavailableWarning.set(false);
    this.relayConfigRetrying.set(false);
    this.joinAnywayWithStunFallback = false;
    this.nameError.set(null);
    this.hostRecording.set(false);
    this.recordingStartedAt.set(null);
    this.currentFacingMode.set('user');
    this.activeSpeaker.reset();
    this.remoteAudio.reset();
    this.stopRemoteAudioKeepalive();
    this.uninstallRemoteAudioInteractionRecovery();
    this.stopClock();
    this.uninstallMobileVisibilityPause();
    this.remoteAudioUnhealthyIds.set(new Set());
    this.prevInboundBytes.clear();
    this.peerFirstSeen.clear();
  }

  private async replaceInCallAudio(deviceId: string): Promise<boolean> {
    this.deviceDialogBusy.set(true);
    this.deviceDialogError.set(null);
    try {
      const track = await this.media.replaceAudioTrack(deviceId || undefined, async (nextTrack) => {
        await this.replaceSfuAudioTrackAndAnnounce(nextTrack);
      });
      if (track) {
        this.syncSelectedAudioIdToTrack(track, deviceId);
        this.attachLocalTrackFailureHandlers(this.media.localStream() ?? new MediaStream([track]));
        this.micLevel.set(this.media.getMicLevel(this.media.localStream() ?? new MediaStream([track])));
        this.broadcastMediaState(this.media.micOn(), this.media.cameraOn());
        this.queueDiagnosticsLog('state-change');
        return true;
      }
      return false;
    } catch (err) {
      this.recordLastGumError(err);
      if (deviceId) {
        try {
          const fallbackTrack = await this.media.replaceAudioTrack(undefined, async (nextTrack) => {
            await this.replaceSfuAudioTrackAndAnnounce(nextTrack);
          });
          if (fallbackTrack) {
            this.syncSelectedAudioIdToTrack(fallbackTrack);
            this.attachLocalTrackFailureHandlers(this.media.localStream() ?? new MediaStream([fallbackTrack]));
            this.micLevel.set(this.media.getMicLevel(this.media.localStream() ?? new MediaStream([fallbackTrack])));
            this.broadcastMediaState(this.media.micOn(), this.media.cameraOn());
            this.queueDiagnosticsLog('state-change', 'selected microphone unavailable; using default audio');
            this.deviceDialogError.set('Selected microphone is unavailable. Using the system default microphone.');
            return true;
          }
        } catch (fallbackErr) {
          this.recordLastGumError(fallbackErr);
          this.deviceDialogError.set(`Microphone switch failed: ${fallbackErr instanceof Error ? fallbackErr.message : 'unknown error'}`);
          return false;
        }
      }
      this.deviceDialogError.set(`Microphone switch failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      return false;
    } finally {
      this.deviceDialogBusy.set(false);
    }
  }

  private async replaceInCallVideo(deviceId: string): Promise<boolean> {
    this.deviceDialogBusy.set(true);
    this.deviceDialogError.set(null);
    try {
      const track = await this.media.replaceVideoTrack(
        this.selectedVideoDeviceIdForRequest(),
        (nextTrack) => this.replaceEffectiveVideoTrack(nextTrack),
        this.videoFacingModeForRequest(true),
      );
      if (track) {
        if (deviceId) this.syncSelectedVideoIdToTrack(track, deviceId);
        this.broadcastMediaState(this.media.micOn(), true);
        this.queueDiagnosticsLog('state-change');
        return true;
      }
      return false;
    } catch (err) {
      this.recordLastGumError(err);
      this.deviceDialogError.set(`Camera switch failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      return false;
    } finally {
      this.deviceDialogBusy.set(false);
    }
  }

  private syncSelectedAudioIdToTrack(
    track: MediaStreamTrack | null | undefined,
    requestedDeviceId = this.selectedAudioId(),
    acquiredStage = this.media.audioAcquireStage(track),
  ): void {
    const trackReportedId = audioTrackDeviceId(track);
    const stage: Exclude<MediaAcquireStage, 'none'> = acquiredStage ?? (requestedDeviceId && trackReportedId === requestedDeviceId ? 'exact' : 'default');
    const resolvedId = resolvedAcquiredDeviceId({
      requestedDeviceId,
      acquiredDeviceId: trackReportedId,
      stage,
    });
    const fallbackChosenId =
      requestedDeviceId && stage !== 'exact' && trackReportedId !== requestedDeviceId
        ? (!isGenericAudioDeviceId(trackReportedId) ? trackReportedId : requestedDeviceId)
        : resolvedId || this.selectedAudioId();
    const next = resolveSelectedAudioId({
      chosenId: fallbackChosenId,
      trackReportedId,
      enumeratedIds: this.audioInputs().map((d) => d.deviceId),
      storedId: readStoredDevice(DEVICE_STORAGE.audioInput),
    });
    this.selectedAudioId.set(next);
    storeDevice(DEVICE_STORAGE.audioInput, next);
  }

  private syncSelectedVideoIdToTrack(track: MediaStreamTrack | null | undefined, requestedDeviceId = this.selectedVideoId()): void {
    const actualDeviceId = mediaTrackDeviceId(track);
    const next = resolvedAcquiredDeviceId({
      requestedDeviceId,
      acquiredDeviceId: actualDeviceId,
      stage: requestedDeviceId && actualDeviceId === requestedDeviceId ? 'exact' : 'default',
    });
    this.selectedVideoId.set(next);
    this.videoDevicePinned.set(!!next);
    storeDevice(DEVICE_STORAGE.videoInput, next);
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
      this.micSweepGateState = { ...INITIAL_SWEEP_GATE_STATE };
      if (this.state() === 'lobby' || this.state() === 'in-call') await this.ensureSelectedAudioDevice('devicechange');
      if (this.state() === 'in-call' && this.selectedAudioOutputId()) {
        const result = await this.applySpeakerDevice(this.selectedAudioOutputId());
        this.setSpeakerUnavailable(result === 'default-fallback' || result === 'failed');
        if (result === 'selected' || result === 'unsupported') this.deviceDialogError.set(null);
      }
    } catch (err) {
      console.debug('[devices] devicechange handling failed', err);
    }
  }

  private async applySpeakerDevice(deviceId: string): Promise<SinkApplyResult> {
    const mediaElements = Array.from(document.querySelectorAll('video, audio:not([data-remote-audio])')) as HTMLMediaElement[];
    const mediaApplied = await Promise.all(
      mediaElements.map((element) =>
        applyMediaElementSinkWithDefaultFallback(element, deviceId, {
          label: 'room-media',
        }),
      ),
    );
    const remoteApplied = await this.remoteAudio.applyOutputDevice(deviceId);
    return combineSinkApplyResults([...mediaApplied, remoteApplied]);
  }

  private async unlockAudioFromGesture(showPromptOnFailure: boolean): Promise<boolean> {
    this.activeSpeaker.unlock();
    const micPreviewUnlock = this.media.activateMicPreview().catch((err) => {
      console.debug('[media] mic preview unlock failed', err);
      return false;
    });
    const remoteAudioUnlock = this.remoteAudio.unlockAndPlayRemoteSinks(this.selectedAudioOutputId() || undefined);
    await micPreviewUnlock;
    this.rearmLobbySelfTestAfterAudioUnlock();
    const allPlayable = await remoteAudioUnlock;
    if (this.state() === 'in-call') this.remoteAudioBlocked.set(!allPlayable);
    else if (showPromptOnFailure && !allPlayable) this.remoteAudioBlocked.set(true);
    return allPlayable;
  }

  private rearmLobbySelfTestAfterAudioUnlock(): void {
    if (!shouldRearmLobbySelfTest({
      inLobby: this.state() === 'lobby',
      audioActivated: this.media.audioContextActivated(),
      alreadyRunning: !!this.lobbySelfTestTimer,
    })) return;
    this.startLobbySelfTest();
  }

  private async recoverRemoteAudio(reason: 'effect' | 'interaction' | 'visibility' | 'keepalive'): Promise<boolean> {
    const allPlayable = await this.remoteAudio.recoverPlayback(this.selectedAudioOutputId() || undefined);
    if (this.state() === 'in-call') this.remoteAudioBlocked.set(this.remoteAudio.remoteAudioBlocked());
    if (this.remoteAudio.remoteAudioBlocked()) this.installRemoteAudioInteractionRecovery();
    if (reason !== 'keepalive') console.debug('[media] remote audio recovery attempted', reason, { allPlayable });
    return allPlayable;
  }

  private startRemoteAudioKeepalive(): void {
    if (this.remoteAudioKeepaliveTimer) return;
    this.remoteAudioKeepaliveTimer = window.setInterval(() => {
      if (this.state() !== 'in-call') {
        this.stopRemoteAudioKeepalive();
        return;
      }
      void this.recoverRemoteAudio('keepalive').catch((err) => console.debug('[media] remote audio keepalive failed', err));
    }, REMOTE_AUDIO_KEEPALIVE_MS);
  }

  private stopRemoteAudioKeepalive(): void {
    if (!this.remoteAudioKeepaliveTimer) return;
    window.clearInterval(this.remoteAudioKeepaliveTimer);
    this.remoteAudioKeepaliveTimer = null;
  }

  private startRemoteVoiceWatchdog(): void {
    if (this.remoteVoiceWatchdogTimer || this.state() !== 'in-call') return;
    this.remoteVoiceWatchdogTimer = window.setInterval(() => {
      void this.pollRemoteVoiceWatchdog();
    }, REMOTE_VOICE_WATCHDOG_POLL_MS);
    void this.pollRemoteVoiceWatchdog();
  }

  private stopRemoteVoiceWatchdog(): void {
    if (this.remoteVoiceWatchdogTimer) window.clearInterval(this.remoteVoiceWatchdogTimer);
    this.remoteVoiceWatchdogTimer = null;
    this.remoteVoiceWatchdogInFlight = false;
    this.remoteVoiceWatchdogPeers.clear();
  }

  private async pollRemoteVoiceWatchdog(): Promise<void> {
    if (this.state() !== 'in-call') {
      this.stopRemoteVoiceWatchdog();
      return;
    }
    if (this.remoteVoiceWatchdogInFlight) return;
    this.remoteVoiceWatchdogInFlight = true;
    try {
      if (this.remoteAudio.mutedAll()) {
        this.remoteAudio.clearVoiceStalls();
        this.remoteVoiceWatchdogPeers.clear();
        return;
      }

      const diagnostics = await this.sfuClient.collectDiagnostics();
      const inboundAudio = (diagnostics?.inboundTracks ?? []).filter(
        (track): track is SfuInboundTrackStats & { publisherClientId: string } =>
          track.kind === 'audio' && !!track.publisherClientId,
      );
      const activePeerIds = new Set(inboundAudio.map((track) => track.publisherClientId));

      for (const peerId of [...this.remoteVoiceWatchdogPeers.keys()]) {
        if (!activePeerIds.has(peerId)) {
          this.remoteAudio.clearVoiceStalls([peerId]);
          this.remoteVoiceWatchdogPeers.delete(peerId);
        }
      }

      for (const track of inboundAudio) {
        await this.observeRemoteVoiceTrack(track);
      }

      if (this.isHost()) {
        this.updateRemoteAudioHealth(inboundAudio);
      }
    } catch (err) {
      console.debug('[media] remote voice watchdog poll failed', err);
    } finally {
      this.remoteVoiceWatchdogInFlight = false;
    }
  }

  peerAudioUnhealthy(peer: PeerState): boolean {
    return this.remoteAudioUnhealthyIds().has(peer.id);
  }

  private updateRemoteAudioHealth(inboundAudio: Array<SfuInboundTrackStats & { publisherClientId: string }>): void {
    const inboundByClientId = new Map<string, number | null>();
    for (const track of inboundAudio) {
      inboundByClientId.set(track.publisherClientId, track.bytesReceived);
    }
    const publishers = this.sfuClient.remotePublishers();
    const now = Date.now();
    const unhealthy = new Set<string>();
    // Iterate the full admitted-peer roster so admitted-but-never-published peers (Joanne case)
    // are evaluated, not just those in remotePublishers.
    const admittedIds = new Set<string>();
    for (const peer of this.peers()) {
      if (peer.isLocal) continue;
      const clientId = peer.id;
      admittedIds.add(clientId);
      if (!this.peerFirstSeen.has(clientId)) this.peerFirstSeen.set(clientId, now);
      const firstSeen = this.peerFirstSeen.get(clientId)!;
      const isPublishing = publishers.has(clientId);
      const hasTrack = inboundByClientId.has(clientId);
      const bytesNow = inboundByClientId.get(clientId) ?? null;
      const bytesPrev = this.prevInboundBytes.get(clientId) ?? null;
      const input: PeerAudioHealthInput = {
        isPublishing,
        hasTrack,
        bytesReceivedNow: bytesNow,
        bytesReceivedPrev: bytesPrev,
        micEnabled: peer.micEnabled,
        pastGrace: (now - firstSeen) >= PEER_AUDIO_GRACE_MS,
      };
      if (classifyPeerAudioHealth(input) !== 'ok') unhealthy.add(clientId);
    }
    // Prune departed peers from the first-seen map.
    for (const clientId of this.peerFirstSeen.keys()) {
      if (!admittedIds.has(clientId)) this.peerFirstSeen.delete(clientId);
    }
    this.prevInboundBytes.clear();
    for (const [k, v] of inboundByClientId) this.prevInboundBytes.set(k, v);
    this.remoteAudioUnhealthyIds.set(unhealthy);
  }

  private async observeRemoteVoiceTrack(track: SfuInboundTrackStats & { publisherClientId: string }): Promise<void> {
    const sample = remoteVoiceSample(track);
    const state = this.remoteVoiceWatchdogPeers.get(track.publisherClientId) ?? {
      samples: [],
      attemptsThisWindow: 0,
    };
    const peer = this.peers().find((candidate) => candidate.id === track.publisherClientId);
    const decision = decideRemoteVoiceWatchdogAction({
      previousSamples: state.samples,
      attemptsThisWindow: state.attemptsThisWindow,
      sample,
      mutedAll: this.remoteAudio.mutedAll(),
      publisherMicEnabled: peer?.micEnabled,
    });

    switch (decision.kind) {
      case 'clear':
        this.remoteAudio.clearVoiceStalls([track.publisherClientId]);
        if (decision.deletePeer) {
          this.remoteVoiceWatchdogPeers.delete(track.publisherClientId);
        } else {
          this.remoteVoiceWatchdogPeers.set(track.publisherClientId, {
            samples: decision.nextSamples,
            attemptsThisWindow: decision.nextAttemptsThisWindow,
          });
        }
        return;
      case 'note-emission-advanced':
        this.remoteAudio.noteVoiceEmissionAdvanced(track.publisherClientId);
        this.remoteVoiceWatchdogPeers.set(track.publisherClientId, {
          samples: decision.nextSamples,
          attemptsThisWindow: decision.nextAttemptsThisWindow,
        });
        return;
      case 'escalate-recovery':
        this.remoteAudio.markVoiceStalled(track.publisherClientId);
        console.warn('[media] remote voice watchdog detected stalled inbound audio; escalating to SFU recovery coordinator', {
          publisherClientId: track.publisherClientId,
          attemptsThisWindow: state.attemptsThisWindow,
        });
        this.remoteVoiceWatchdogPeers.set(track.publisherClientId, {
          samples: decision.nextSamples,
          attemptsThisWindow: decision.nextAttemptsThisWindow,
        });
        this.sfuClient.escalateStalledRemoteAudio(track.publisherClientId);
        return;
      case 'hold':
        this.remoteVoiceWatchdogPeers.set(track.publisherClientId, {
          samples: decision.nextSamples,
          attemptsThisWindow: decision.nextAttemptsThisWindow,
        });
        return;
      case 'recover':
        this.remoteVoiceWatchdogPeers.set(track.publisherClientId, {
          samples: decision.nextSamples,
          attemptsThisWindow: decision.nextAttemptsThisWindow,
        });
        await this.remoteAudio.recoverVoicePlayout(track.publisherClientId, decision.recoveryAction, this.selectedAudioOutputId() || undefined);
        return;
    }
  }

  private installRemoteAudioInteractionRecovery(): void {
    if (this.remoteAudioInteractionRecoveryInstalled) return;
    window.addEventListener('pointerdown', this.handleRemoteAudioInteractionRecovery, { capture: true });
    window.addEventListener('click', this.handleRemoteAudioInteractionRecovery, { capture: true });
    window.addEventListener('keydown', this.handleRemoteAudioInteractionRecovery, { capture: true });
    this.remoteAudioInteractionRecoveryInstalled = true;
  }

  private uninstallRemoteAudioInteractionRecovery(): void {
    if (!this.remoteAudioInteractionRecoveryInstalled) return;
    window.removeEventListener('pointerdown', this.handleRemoteAudioInteractionRecovery, { capture: true });
    window.removeEventListener('click', this.handleRemoteAudioInteractionRecovery, { capture: true });
    window.removeEventListener('keydown', this.handleRemoteAudioInteractionRecovery, { capture: true });
    this.remoteAudioInteractionRecoveryInstalled = false;
  }

  private readonly handleRemoteAudioInteractionRecovery = (): void => {
    this.uninstallRemoteAudioInteractionRecovery();
    if (this.state() !== 'in-call') return;
    void this.recoverRemoteAudio('interaction').catch((err) => console.debug('[media] remote audio interaction recovery failed', err));
  };

  private installPageLifecycleCleanup(): void {
    window.addEventListener('pagehide', this.handlePageLifecycleLeave);
    window.addEventListener('pageshow', this.handlePageLifecycleShow);
    window.addEventListener('beforeunload', this.handlePageLifecycleLeave);
    document.addEventListener('visibilitychange', this.handleLobbyVisibilityRelease);
    document.addEventListener('visibilitychange', this.handleRemoteAudioVisibilityRecovery);
  }

  private uninstallPageLifecycleCleanup(): void {
    window.removeEventListener('pagehide', this.handlePageLifecycleLeave);
    window.removeEventListener('pageshow', this.handlePageLifecycleShow);
    window.removeEventListener('beforeunload', this.handlePageLifecycleLeave);
    document.removeEventListener('visibilitychange', this.handleLobbyVisibilityRelease);
    document.removeEventListener('visibilitychange', this.handleRemoteAudioVisibilityRecovery);
  }

  private readonly handlePageLifecycleLeave = (event: PageTransitionEvent | BeforeUnloadEvent): void => {
    // T5: if a recording upload is in flight, ask the browser to confirm before closing.
    // Only effective on 'beforeunload' — pagehide cannot be prevented by spec.
    // Angular SPA navigation (directLeave → router.navigate) does not fire beforeunload,
    // so this guard never blocks the programmatic end-call path.
    if (event.type === 'beforeunload' && this.recorder.isUploading()) {
      event.preventDefault();
      (event as BeforeUnloadEvent).returnValue = '';
      return;
    }
    const action = decideRoomLifecycleLeave({
      eventType: event.type === 'beforeunload' ? 'beforeunload' : 'pagehide',
      persisted: 'persisted' in event ? event.persisted : false,
      visibilityState: document.visibilityState,
      mobileBackgroundPauseEnabled: this.shouldEnableBgPause(),
    });
    if (action === 'cleanup') this.cleanupCall();
  };

  private readonly handlePageLifecycleShow = (event: PageTransitionEvent): void => {
    if (!event.persisted || this.state() !== 'in-call') return;
    void this.resumeAfterLifecycleFreeze().catch((err) => console.debug('[lifecycle] pageshow resume failed', err));
  };

  private async resumeAfterLifecycleFreeze(): Promise<void> {
    if (this.lifecycleResumeInFlight || this.state() !== 'in-call') return;
    this.lifecycleResumeInFlight = true;
    try {
      await this.recoverRemoteAudio('visibility');
      this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
      if (this.recorder.isRecording()) await this.recorder.resumeAudioContext();
      if (this.sfuClient.isLocalPublishHealthy()) return;
      if (this.sfuClient.localPublishState()?.status === 'published') this.sfuClient.resetForTransportRecovery();
      await this.republishSfuAfterTransportRecovery();
    } finally {
      this.lifecycleResumeInFlight = false;
    }
  };

  // While in lobby (not yet in the call), release camera/mic if the tab is
  // hidden so other tabs/apps can use the device. Don't touch the stream
  // during an active call — that would drop the feed for everyone else.
  private readonly handleLobbyVisibilityRelease = (): void => {
    if (document.visibilityState !== 'hidden') return;
    if (this.state() === 'in-call') return;
    if (this.media.localStream()) this.media.stopLocal();
  };

  private readonly handleRemoteAudioVisibilityRecovery = (): void => {
    if (document.visibilityState !== 'visible') return;
    if (this.state() !== 'in-call') return;
    void this.recoverRemoteAudio('visibility').catch((err) => console.debug('[media] remote audio visibility recovery failed', err));
  };

  private attachLocalTrackFailureHandlers(stream: MediaStream): void {
    this.attachLocalTrackFailureHandler('audio', stream.getAudioTracks()[0] ?? null);
    this.attachLocalTrackFailureHandler('video', stream.getVideoTracks()[0] ?? null);
  }

  private attachLocalTrackFailureHandler(kind: LocalTrackKind, track: MediaStreamTrack | null): void {
    this.detachLocalTrackFailureHandlers(kind);
    if (!track) return;
    const refs: LocalTrackFailureHandlerRefs = {
      track,
      onEnded: () => this.handleLocalTrackFailure(kind, track, 'ended'),
      onMute: () => this.handleLocalTrackFailure(kind, track, 'mute'),
      onUnmute: () => this.clearLocalTrackRecoveryTimer(kind, track),
    };
    track.addEventListener('ended', refs.onEnded);
    track.addEventListener('mute', refs.onMute);
    track.addEventListener('unmute', refs.onUnmute);
    this.localTrackFailureHandlers[kind] = refs;
  }

  private detachLocalTrackFailureHandlers(kind?: LocalTrackKind): void {
    const kinds: LocalTrackKind[] = kind ? [kind] : ['audio', 'video'];
    for (const entryKind of kinds) {
      const refs = this.localTrackFailureHandlers[entryKind];
      if (!refs) continue;
      refs.track.removeEventListener('ended', refs.onEnded);
      refs.track.removeEventListener('mute', refs.onMute);
      refs.track.removeEventListener('unmute', refs.onUnmute);
      delete this.localTrackFailureHandlers[entryKind];
    }
  }

  private handleLocalTrackFailure(kind: LocalTrackKind, track: MediaStreamTrack, event: LocalTrackFailureEvent): void {
    const inCall = this.state() === 'in-call';
    const currentTrack = this.isCurrentLocalTrack(kind, track);
    const action = decideLocalTrackFailureRecovery({
      inCall,
      currentTrack,
      trackEnabled: track.enabled,
      event,
      trackReadyState: track.readyState,
    });
    if (!inCall || !currentTrack) return;
    this.clearLocalTrackRecoveryTimer(kind);
    if (action === 'ignore') return;
    if (action === 'debounce-mute') {
      const timer = window.setTimeout(() => {
        if (!this.isCurrentLocalTrack(kind, track)) return;
        if (!track.enabled) return;
        if (track.muted || track.readyState === 'ended') void this.recoverLocalTrack(kind, 'persistent-mute');
      }, LOCAL_TRACK_MUTE_DEBOUNCE_MS);
      if (kind === 'audio') this.audioRecoveryTimer = timer;
      else this.videoRecoveryTimer = timer;
      return;
    }
    void this.recoverLocalTrack(kind, 'ended');
  }

  private clearLocalTrackRecoveryTimer(kind: LocalTrackKind, track?: MediaStreamTrack): void {
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

  private isCurrentLocalTrack(kind: LocalTrackKind, track: MediaStreamTrack): boolean {
    const current = kind === 'audio' ? this.media.localStream()?.getAudioTracks()[0] : this.media.localStream()?.getVideoTracks()[0];
    return current === track;
  }

  private async recoverLocalTrack(kind: LocalTrackKind, trigger: 'ended' | 'persistent-mute'): Promise<void> {
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
    let lastRecoveryError: unknown = { name: 'NotFoundError' };
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
          const track = await this.media.replaceAudioTrack(candidate.deviceId, async (nextTrack) => {
            await this.replaceSfuAudioTrackAndAnnounce(nextTrack);
          });
          if (!track) continue;
          this.syncSelectedAudioIdToTrack(track);
          this.attachLocalTrackFailureHandlers(this.media.localStream() ?? new MediaStream([track]));
          this.micLevel.set(this.media.getMicLevel(this.media.localStream() ?? new MediaStream([track])));
          this.broadcastMediaState(track.enabled, this.media.cameraOn());
          this.actionNotice.set(this.recoveryNotice('microphone', candidate, track));
          this.queueDiagnosticsLog('state-change', 'local audio track recovered via replaceTrack');
          return;
        } catch (err) {
          lastRecoveryError = err;
          console.debug('[devices] microphone recovery candidate failed', candidate.deviceId || 'default', err);
        }
      }
    }
    await this.sfuClient.replaceAudioTrack(null);
    this.media.removeAudioTrack();
    this.broadcastMediaState(false, this.media.cameraOn());
    this.actionNotice.set(null);
    this.deviceFailureNotice.set(localAudioRecoveryTerminalMessage(lastRecoveryError));
    this.queueDiagnosticsLog('error', 'local audio recovery failed; no microphone available');
  }

  /**
   * B2a — post-INITIAL-publish ONE-SHOT capture-energy gate (R3).
   *
   * A getUserMedia resolve does NOT prove the mic carries energy (wrong channel /
   * OS-mixer-muted / dead external that still enumerates), and a silent-but-LIVE
   * track never fires onended/onmute — so the existing recovery net never trips.
   * This gate samples the SAME outbound-audio source the diagnostics read,
   * classifies it over a sustained window, and on confirmed silence attempts ONE
   * non-destructive relaxed re-acquire of the SAME device; if still silent it
   * KEEPS the existing track and surfaces a non-blocking warn.
   */
  private async verifyInitialCaptureEnergy(): Promise<void> {
    if (this.initialCaptureEnergyChecked) return;
    this.initialCaptureEnergyChecked = true;
    if (!this.captureGatePasses()) return;

    // Sample a ~3s window starting ~500ms after publish (≈4-5 samples @700ms).
    await delay(CAPTURE_ENERGY_GATE_INITIAL_DELAY_MS);
    const samples = await this.sampleCaptureEnergy(CAPTURE_ENERGY_GATE_SAMPLES, CAPTURE_ENERGY_GATE_INTERVAL_MS);
    const classification = classifyMicCapture(samples);

    // Quiet-but-working / indeterminate ⇒ no sweep (B2a U-8 preserved). Only a
    // confirmed 'silent' window is sweep-eligible.
    if (classification !== 'silent') return;

    // Confirmed silent: run the bounded multi-device recovery sweep via the retry gate.
    const gate = nextSweepGate(this.micSweepGateState, classification, true, Date.now());
    this.micSweepGateState = {
      attempts: gate.attempts,
      episodeStartedAt: gate.episodeStartedAt,
      nextAllowedAt: gate.nextAllowedAt,
    };
    if (gate.shouldSweep && !this.audioRecoveryInFlight) await this.runMicRecoverySweep();
  }

  // B2c — the thin ADAPTER over the pure runMicSweep orchestrator (R10). It owns
  // ALL the framework I/O (enumerate, replaceAudioTrack, re-sample, signals) and
  // delegates the never-zero-audio decision walk to the pure orchestrator, which
  // in turn drives the pure decideMicRecovery step fn. Bounded by micSweepInProgress
  // (re-entrancy) + the caller's micSweepGateState (bounded retry per episode).
  private async runMicRecoverySweep(): Promise<void> {
    if (this.micSweepInProgress) return;
    this.micSweepInProgress = true;
    this.actionNotice.set('Checking your microphones for sound…');
    try {
      const originalDeviceId = this.selectedAudioId() || '';
      const devices = await this.media.enumerateDevices();
      this.audioInputs.set(devices.audioInputs);
      const candidates = orderedMicCandidates(originalDeviceId, devices.audioInputs);
      if (candidates.length === 0) {
        // No enumerable mic at all ⇒ straight to the terminal warn.
        this.micSilentWarningMessage.set('No working microphone detected — check your mic/permissions');
        this.micSilentWarning.set(true);
        this.queueDiagnosticsLog('error', 'mic sweep found no candidate microphones; warned user');
        return;
      }

      const hooks: SweepHooks = {
        candidates: candidates.map((c) => ({ deviceId: c.deviceId, label: c.label })),
        gates: () => ({
          micEnabled: this.captureTrackEnabled(),
          micUnmuted: this.captureTrackUnmuted(),
          hasLiveAudioTrack: this.captureTrackLive(),
        }),
        acquire: async (deviceId) => {
          const track = await this.media.replaceAudioTrack(deviceId || undefined, async (nextTrack) => {
            await this.replaceSfuAudioTrackAndAnnounce(nextTrack);
          });
          if (!track) return null;
          // Mirror verifyInitialCaptureEnergy's re-acquire re-wiring.
          this.attachLocalTrackFailureHandlers(this.media.localStream() ?? new MediaStream([track]));
          this.micLevel.set(this.media.getMicLevel(this.media.localStream() ?? new MediaStream([track])));
          this.broadcastMediaState(track.enabled, this.media.cameraOn());
          return { deviceId: audioTrackDeviceId(track) || deviceId, label: track.label };
        },
        classifyCurrent: async () =>
          classifyMicCapture(await this.sampleCaptureEnergy(CAPTURE_ENERGY_GATE_RESAMPLES, CAPTURE_ENERGY_GATE_INTERVAL_MS)),
        currentLiveDeviceId: () => audioTrackDeviceId(this.captureAudioTrack()),
      };

      const result = await runMicSweep(originalDeviceId, hooks);

      if (result.outcome === 'adopted') {
        this.syncSelectedAudioIdToTrack(this.captureAudioTrack());
        this.micSilentWarning.set(false);
        this.micSilentWarningMessage.set("We can't detect sound from your microphone");
        if (result.deviceId !== originalDeviceId) {
          // A DIFFERENT mic produced energy — switch + tell the user WHICH device.
          this.actionNotice.set(
            `Switched to ${result.label || 'another microphone'} — your previous microphone had no sound`,
          );
          this.queueDiagnosticsLog('state-change', `mic auto-switched to ${result.deviceId} after silence`);
          return;
        }
        // Re-acquired the SAME current device (relaxed re-acquire fixed it) — NOT a
        // switch, so no "Switched to" notice; just clear the banner.
        this.actionNotice.set(null);
        this.queueDiagnosticsLog('state-change', 'audio recovered via relaxed re-acquire');
        return;
      }

      if (result.outcome === 'none-working') {
        // No candidate produced energy. The orchestrator restored the original
        // device; surface the single terminal warn (kept a live track throughout).
        this.actionNotice.set(null);
        this.micSilentWarningMessage.set('No working microphone detected — check your mic/permissions');
        this.micSilentWarning.set(true);
        this.queueDiagnosticsLog('error', 'mic sweep found no working microphone; kept track, warned user');
        return;
      }

      // 'aborted' — muted/disabled mid-sweep; the next watchdog poll clears via the
      // reducer. Drop the transient notice; leave the banner untouched.
      this.actionNotice.set('Checking your microphones for sound…');
    } catch (err) {
      // Unexpected failure: never leave the user un-warned. Fall back to the
      // terminal warn (the existing track is untouched — non-destructive).
      console.debug('[mic-sweep] unexpected sweep failure', err);
      this.micSilentWarningMessage.set('No working microphone detected — check your mic/permissions');
      this.micSilentWarning.set(true);
      this.queueDiagnosticsLog('error', 'mic sweep errored; kept track, warned user');
    } finally {
      this.micSweepInProgress = false;
      this.micSweepGateState = {
        ...this.micSweepGateState,
        nextAllowedAt: Date.now() + MIC_SWEEP_RETRY_INTERVAL_MS,
      };
      if (this.actionNotice() === 'Checking your microphones for sound…') this.actionNotice.set(null);
    }
  }

  private async sampleCaptureEnergy(count: number, intervalMs: number): Promise<EnergySample[]> {
    const samples: EnergySample[] = [];
    for (let i = 0; i < count; i += 1) {
      if (i > 0) await delay(intervalMs);
      const source = await this.sfuClient.getOutboundAudioSource();
      samples.push({
        totalAudioEnergy: source?.totalAudioEnergy ?? null,
        audioLevel: source?.audioLevel ?? null,
      });
    }
    return samples;
  }

  private captureGatePasses(): boolean {
    return this.captureTrackLive() && this.captureTrackEnabled() && this.captureTrackUnmuted();
  }

  private captureAudioTrack(): MediaStreamTrack | null {
    return this.media.localStream()?.getAudioTracks()[0] ?? null;
  }

  private captureTrackLive(): boolean {
    const track = this.captureAudioTrack();
    return this.state() === 'in-call' && !!track && track.readyState === 'live';
  }

  private captureTrackEnabled(): boolean {
    return this.captureAudioTrack()?.enabled === true;
  }

  private captureTrackUnmuted(): boolean {
    const track = this.captureAudioTrack();
    return !!track && track.muted === false;
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
    this.ws.send({
      type: 'media-state',
      mic,
      cam,
      screenOn,
      background: this.backgroundEffects.backgroundDescriptor(),
    });
    this.queueDiagnosticsLog('state-change');
  }

  private broadcastBackgroundImage(image: string): void {
    this.ws.send({ type: 'background-image', image });
  }

  private startDiagnosticsLogger(): void {
    if (this.diagnosticsLogTimer || !this.currentSessionId() || !this.effectiveDiagnosticsEnabled()) return;
    this.diagnosticsLogTimer = window.setInterval(() => {
      void this.flushDiagnosticsLog('sample');
    }, DIAGNOSTICS_LOG_INTERVAL_MS);
  }

  private stopDiagnosticsLogger(): void {
    if (this.diagnosticsLogTimer) window.clearInterval(this.diagnosticsLogTimer);
    this.diagnosticsLogTimer = null;
    this.lastDiagnosticsEventAt = 0;
    this.diagnosticsPostGate.clear();
  }

  // B2b — continuous in-call silent-mic watchdog (R2, the safety net on top of
  // B2a's join-time capture fix). Polls the SAME getStats outbound-audio source
  // every ~1s, keeps a rolling ~5-6s window, classifies it with the EXISTING pure
  // classifyMicCapture, and drives the micSilentWarning banner via the pure
  // nextMicWarningState reducer. WARN-ONLY: it NEVER re-acquires or switches the
  // device (no mid-call auto-thrash) — that is the B2b-vs-B2a distinction.
  private startMicSilenceWatchdog(): void {
    if (this.micSilenceWatchdogTimer || this.state() !== 'in-call') return;
    this.micSilenceWindow = [];
    this.micSilenceWatchdogTimer = window.setInterval(() => {
      void this.pollMicSilenceWatchdog();
    }, MIC_SILENCE_WATCHDOG_POLL_MS);
  }

  private stopMicSilenceWatchdog(): void {
    if (this.micSilenceWatchdogTimer) window.clearInterval(this.micSilenceWatchdogTimer);
    this.micSilenceWatchdogTimer = null;
    this.micSilenceWindow = [];
  }

  private async pollMicSilenceWatchdog(): Promise<void> {
    // A stale tick must never warn after leaving the call.
    if (this.state() !== 'in-call') {
      this.stopMicSilenceWatchdog();
      return;
    }

    // micActive = local audio track is live AND enabled AND unmuted. A muted /
    // disabled user is intentionally silent — clear the buffer and the banner,
    // and RE-ARM the one-sweep-per-episode bound (mute is a pause, not a permanent
    // consume); never poll stats for silence the user caused.
    const micActive = this.captureTrackLive() && this.captureTrackEnabled() && this.captureTrackUnmuted();
    if (!micActive) {
      this.micSilenceWindow = [];
      this.micSweepGateState = { ...INITIAL_SWEEP_GATE_STATE };
      this.micSilentWarning.set(nextMicWarningState(this.micSilentWarning(), 'indeterminate', false));
      return;
    }

    // A sweep already owns the device while it runs — never poll/sweep concurrently.
    if (this.micSweepInProgress) return;

    const src = await this.sfuClient.getOutboundAudioSource();
    const micStillActive = this.captureTrackLive() && this.captureTrackEnabled() && this.captureTrackUnmuted();
    if (!micStillActive) {
      this.micSilenceWindow = [];
      this.micSweepGateState = { ...INITIAL_SWEEP_GATE_STATE };
      this.micSilentWarning.set(nextMicWarningState(this.micSilentWarning(), 'indeterminate', false));
      return;
    }
    this.micSilenceWindow.push({
      audioLevel: src?.audioLevel ?? null,
      totalAudioEnergy: src?.totalAudioEnergy ?? null,
    });
    if (this.micSilenceWindow.length > MIC_SILENCE_WATCHDOG_WINDOW) this.micSilenceWindow.shift();

    const classification = classifyMicCapture(this.micSilenceWindow);

    // Drive the bounded retry gate (re-arms on energy-return / mute / devicechange).
    const gate = nextSweepGate(this.micSweepGateState, classification, true, Date.now());
    this.micSweepGateState = {
      attempts: gate.attempts,
      episodeStartedAt: gate.episodeStartedAt,
      nextAllowedAt: gate.nextAllowedAt,
    };

    if (classification === 'working') {
      this.micSilentWarning.set(false);
      this.micSilentWarningMessage.set("We can't detect sound from your microphone");
    } else if (classification === 'indeterminate') {
      this.micSilentWarning.set(nextMicWarningState(this.micSilentWarning(), 'indeterminate', true));
    } else if (classification === 'silent') {
      this.micSilentWarningMessage.set(
        gate.exhausted
          ? 'No working microphone detected — check your mic/permissions'
          : 'Still trying to restore your microphone…',
      );
      this.micSilentWarning.set(true);
    }

    if (gate.shouldSweep && !this.audioRecoveryInFlight) await this.runMicRecoverySweep();
  }

  // B5 — pre-call lobby self-test poller (R8). Mirrors the in-call watchdog shape
  // on a SEPARATE lobbySelfTestFlag: a ~1s tick reads the SAME classifyMicCapture
  // verdict off the lobby capture window and drives the flag via the SAME
  // nextMicWarningState reducer, so a mic that will publish silence on the call
  // can NOT show as 'working' in the pre-call test. NON-blocking: it only sets a
  // flag (the Join button is never disabled by it).
  private startLobbySelfTest(): void {
    if (this.lobbySelfTestTimer || this.state() !== 'lobby') return;
    this.lobbySelfTestTimer = window.setInterval(() => {
      this.pollLobbySelfTest();
    }, LOBBY_SELF_TEST_POLL_MS);
  }

  private stopLobbySelfTest(): void {
    if (this.lobbySelfTestTimer) window.clearInterval(this.lobbySelfTestTimer);
    this.lobbySelfTestTimer = null;
    this.lobbySelfTestFlag.set(false);
    this.micWorking.set(false);
  }

  private pollLobbySelfTest(): void {
    // A stale tick must never flag once we leave the lobby (join/leave).
    if (this.state() !== 'lobby' || !this.media.audioContextActivated()) {
      this.stopLobbySelfTest();
      return;
    }
    // micActive = lobby mic requested AND a live, enabled local audio track. A user
    // who turned the mic off in the lobby is intentionally silent — the SAME reducer
    // gate the in-call watchdog uses clears the flag.
    const track = this.media.localStream()?.getAudioTracks()[0] ?? null;
    const micActive = this.microphoneRequested() && !!track && track.readyState === 'live' && track.enabled === true;
    const cls = classifyMicCapture(this.media.getMicCaptureWindow());
    this.lobbySelfTestFlag.set(nextMicWarningState(this.lobbySelfTestFlag(), cls, micActive));
    this.micWorking.set(nextMicWorkingState(this.micWorking(), cls, micActive));
  }

  private startConnectionQualitySampler(): void {
    if (this.connectionQualityTimer || this.state() !== 'in-call') return;
    void this.sampleConnectionQuality();
    this.connectionQualityTimer = window.setInterval(() => {
      void this.sampleConnectionQuality();
    }, CONNECTION_QUALITY_SAMPLE_INTERVAL_MS);
  }

  private stopConnectionQualitySampler(): void {
    if (this.connectionQualityTimer) window.clearInterval(this.connectionQualityTimer);
    this.connectionQualityTimer = null;
    this.connectionQualityInFlight = false;
    this.relayedConnectionSamples = 0;
    this.poorConnectionSamples = 0;
    this.relayEpisodeNotified = false;
    this.poorEpisodeNotified = false;
    this.sfuClient.resetConnectionQuality();
  }

  private async sampleConnectionQuality(): Promise<void> {
    if (this.connectionQualityInFlight || this.state() !== 'in-call') return;
    this.connectionQualityInFlight = true;
    try {
      const quality = await this.sfuClient.collectConnectionQuality();
      this.trackConnectionQualityEpisode(quality);
    } catch (err) {
      console.debug('[sfu] connection quality sample failed', err);
    } finally {
      this.connectionQualityInFlight = false;
    }
  }

  private trackConnectionQualityEpisode(quality: SfuConnectionQuality | null): void {
    if (quality?.route === 'relayed') {
      this.relayedConnectionSamples += 1;
    } else {
      this.relayedConnectionSamples = 0;
      this.relayEpisodeNotified = false;
    }

    if (quality?.band === 'poor') {
      this.poorConnectionSamples += 1;
    } else {
      this.poorConnectionSamples = 0;
      this.poorEpisodeNotified = false;
    }

    if (quality && this.relayedConnectionSamples >= CONNECTION_QUALITY_EPISODE_SAMPLES && !this.relayEpisodeNotified) {
      this.relayEpisodeNotified = true;
      console.warn('[sfu] local connection stuck on TURN relay', quality);
      this.actionNotice.set('Your connection is using relay. Call quality may be reduced.');
      this.queueDiagnosticsLog('state-change');
    }

    if (quality && this.poorConnectionSamples >= CONNECTION_QUALITY_EPISODE_SAMPLES && !this.poorEpisodeNotified) {
      this.poorEpisodeNotified = true;
      console.warn('[sfu] sustained poor local connection quality', quality);
      this.actionNotice.set('Poor connection detected. Audio or video may lag.');
      this.queueDiagnosticsLog('state-change');
    }
  }

  // Set speaker-unavailable state. When it goes unavailable we record a non-blocking
  // call issue (logged to diagnostics + shown to the host at end-of-call) instead of
  // surfacing a red banner mid-call.
  private setSpeakerUnavailable(unavailable: boolean): void {
    this.selectedSpeakerUnavailable.set(unavailable);
    if (unavailable) this.recordCallIssue('Selected speaker unavailable — used the system default');
  }

  private recordCallIssue(label: string): void {
    if (this.callIssues().includes(label)) return;
    this.callIssues.update((list) => [...list, label]);
    // Best-effort diagnostics entry (no-op unless diagnostics logging is active).
    this.queueDiagnosticsLog('error', label);
  }

  private queueDiagnosticsLog(kind: DiagnosticsPayload['kind'], error?: string): void {
    if (this.state() !== 'in-call' || !this.currentSessionId() || !this.effectiveDiagnosticsEnabled()) return;
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
    if (!sessionId || !this.effectiveDiagnosticsEnabled()) return;
    const sfuDiagnostics = await collectWithTimeout(() => this.sfuClient.collectDiagnostics());
    const payload = this.buildDiagnosticsPayload(kind, options.error, sfuDiagnostics);
    if (options.useBeacon && this.meetingSessions.sendDiagnosticsBeacon(sessionId, payload)) return;
    const result = await this.diagnosticsPostGate.run(() => this.meetingSessions.appendDiagnostics(sessionId, payload));
    if (result === 'failed' || result === 'timeout') console.debug(`[diagnostics-log] append ${result}`);
  }

  private buildDiagnosticsPayload(kind: DiagnosticsPayload['kind'], error?: string, sfuDiagnostics?: SfuDiagnosticsSnapshot): DiagnosticsPostPayload {
    const audioTrack = this.media.localStream()?.getAudioTracks()[0] ?? null;
    const micFields = deriveOutboundAudioFields({
      audioSource: sfuDiagnostics?.outboundAudioSource ?? null,
      hasLiveAudioTrack: !!audioTrack && audioTrack.readyState === 'live',
      micEnabled: audioTrack?.enabled ?? false,
    });
    const peers = this.advertisedRemotePublisherDiagnostics();
    const playout = this.remoteAudio.playoutDiagnostics();
    const payload: DiagnosticsPostPayload = {
      kind,
      roomId: this.roomId,
      roomTitle: this.roomTitle(),
      clientId: this.myId(),
      participantId: this.myParticipantId(),
      clientKey: readClientKey(),
      clientName: this.displayName().trim() || 'Anon',
      createdAt: Date.now(),
      platform: this.diagnosticsPlatform(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      selectedAudioDeviceId: this.selectedAudioId(),
      selectedAudioOutputId: this.selectedAudioOutputId(),
      selectedVideoDeviceId: this.selectedVideoId(),
      lastGumError: this.lastGumError(),
      wsStatus: this.ws.status(),
      wsReconnectAttempts: this.ws.reconnectAttempts(),
      wsHealth: this.ws.diagnosticsSnapshot(),
      forceRelay: this.forceRelayDiagnosticRequested(),
      requestedIceTransportPolicy: this.forceRelayDiagnosticRequested() ? 'relay' : (sfuDiagnostics?.requestedIceTransportPolicy ?? 'all'),
      selectedCandidatePairType: selectedCandidatePairType(sfuDiagnostics),
      forceRelayDiagnostic: this.forceRelayDiagnostic(),
      manualAudioOnly: false,
      outboundAudioLevel: micFields.outboundAudioLevel,
      outboundAudioEnergy: micFields.outboundAudioEnergy,
      micSilent: micFields.micSilent,
      peers,
      remoteAudioPlayout: playout,
      layerDiagnostics: buildLayerDiagnostics({
        lastGumError: this.lastGumError(),
        localPublishState: this.sfuClient.localPublishState(),
        publishRecoveryFailed: this.sfuClient.publishRecoveryFailed(),
        lastSubscribeFailureEvidence: this.sfuClient.lastSubscribeFailureEvidence(),
        lastRecoveryEvent: this.sfuClient.lastRecoveryEvent(),
        sfuRejoinThrottled: this.sfuClient.sfuRejoinThrottled(),
        remoteAudioPlayout: playout,
        inboundTracks: sfuDiagnostics?.inboundTracks ?? [],
        peers,
      }),
      publishTriggerCount: this.publishTriggerCount,
      roomState: this.state(),
    };
    if (sfuDiagnostics) payload.sfuDiagnostics = sfuDiagnostics;
    if (error) payload.error = error;
    return payload;
  }

  private advertisedRemotePublisherDiagnostics(): DiagnosticsPeerSample[] {
    const identities = this.peerIdentities();
    const subscribedEntries = [...this.sfuClient.subscribedTracks().values()];
    return [...this.sfuClient.remotePublishers().values()].map((publisher) => {
      const identity = identities.get(publisher.clientId);
      const advertisedAudioTrackNames = publisher.tracks.filter((track) => track.kind === 'audio').map((track) => track.trackName);
      const advertisedSubscribed = advertisedAudioTrackNames.length > 0 && advertisedAudioTrackNames.every((trackName) =>
        subscribedEntries.some((entry) => entry.publisherClientId === publisher.clientId && entry.trackName === trackName),
      );
      return {
        id: publisher.clientId,
        participantId: publisher.participantId,
        name: identity?.name ?? publisher.clientId.slice(0, 8),
        advertisedAudioTrackNames,
        advertisedSubscribed,
        isLocal: false,
        isHost: identity?.isHost ?? false,
        connectionState: advertisedSubscribed ? 'subscribed' : 'advertised',
        iceConnectionState: 'n/a',
        iceGatheringState: 'n/a',
        signalingState: 'n/a',
        selectedCandidateType: null,
        candidatePair: null,
        candidatePairCount: 0,
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
          lastNegotiationNeededOfferSent: null,
          makingOffer: false,
          ignoreOffer: false,
          glareIgnoredCount: 0,
          rollbackCount: 0,
        },
        transceivers: [],
        transitionTimeline: [],
        relayUsed: false,
        quality: advertisedSubscribed ? 'subscribed' : 'advertised-not-subscribed',
        packetLossPct: null,
        jitterMs: null,
        rttMs: null,
        availableOutgoingBitrateKbps: null,
        audioOnlyReason: advertisedAudioTrackNames.length ? null : 'no advertised audio',
        micEnabled: advertisedAudioTrackNames.length > 0,
        camEnabled: publisher.tracks.some((track) => track.kind === 'video'),
        screenOn: publisher.tracks.some((track) => track.kind === 'screen'),
        diagnosticLabels: [
          `advertised-audio:${advertisedAudioTrackNames.length ? advertisedAudioTrackNames.join(',') : 'none'}`,
          advertisedSubscribed ? 'sfu-subscribed' : 'sfu-not-subscribed',
        ],
        outboundAudio: emptyDiagnosticsTrackInfo('audio'),
        inboundAudio: emptyDiagnosticsInboundAudio(),
        outboundVideo: emptyDiagnosticsTrackInfo('video'),
        inboundVideo: undefined,
        reconnecting: identity?.reconnecting ?? false,
        updatedAt: Date.now(),
      };
    });
  }

  private diagnosticsPlatform(): DiagnosticsPayload['platform'] {
    if (this.platform.isIOS()) return 'ios';
    if (this.platform.isAndroid()) return 'android';
    if (this.viewport.isMobile()) return 'mobile';
    return 'desktop';
  }

  private recordLastGumError(err: unknown): void {
    const gumError = diagnosticsGumError(err);
    if (gumError) this.lastGumError.set(gumError);
  }

  private showRelayUnavailableWarning(): void {
    this.relayUnavailableWarning.set(true);
    this.setupWarning.set('Relay configuration could not be loaded. Retry to get TURN relay for restrictive networks, or join anyway with fallback STUN only. You may not connect on restrictive networks.');
  }

  private async runForceRelayDiagnostics(): Promise<TurnHealthResult> {
    this.forceRelayDiagnosticRequested.set(true);
    const result = await this.iceConfig.checkTurnHealth();
    this.forceRelayDiagnostic.set(result);
    this.queueDiagnosticsLog('state-change', `force-relay diagnostic ${result.status}`);
    return result;
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
    this.clearJoinAckWatchdog();
    this.dispatchJoin(name);
    if (this.state() === 'connecting') {
      this.armJoinAckWatchdog(name, 0);
    }
  }

  private dispatchJoin(name: string): void {
    const clientKey = readClientKey();
    (window as any).__meetDebug = {
      ...((window as any).__meetDebug ?? {}),
      clientKeyHash: hashClientKey(clientKey),
      reconnectTokenPresent: !!this.reconnectToken(),
      lastJoinSentAt: Date.now(),
    };
    this.ws.send({
      type: 'join',
      room: this.roomId,
      name,
      mobile: this.viewport.isMobile(),
      supportsReconnect: true,
      reconnectToken: this.reconnectToken() || undefined,
      clientKey,
      password: this.verifiedRoomPassword ?? undefined,
    });
  }

  private armJoinAckWatchdog(name: string, attempt: number): void {
    this.clearJoinAckWatchdog();
    this.joinAckWatchdogTimer = setTimeout(() => {
      this.joinAckWatchdogTimer = null;
      if (this.state() !== 'connecting') return;
      if (attempt >= this.JOIN_ACK_MAX_RESENDS) {
        console.warn(`[join-watchdog] no server ack after ${attempt} resend(s); forcing socket reconnect`);
        this.ws.debugDropForReconnect();
        return;
      }
      console.warn(`[join-watchdog] no server ack within ${this.JOIN_ACK_TIMEOUT_MS}ms; resending join (attempt ${attempt + 1}/${this.JOIN_ACK_MAX_RESENDS})`);
      this.dispatchJoin(name);
      this.armJoinAckWatchdog(name, attempt + 1);
    }, this.JOIN_ACK_TIMEOUT_MS);
  }

  private clearJoinAckWatchdog(): void {
    if (this.joinAckWatchdogTimer !== null) {
      clearTimeout(this.joinAckWatchdogTimer);
      this.joinAckWatchdogTimer = null;
    }
  }

  private startClock(): void {
    this.stopClock();
    this.callStartMs.set(Date.now());
    this.clockTick.set(0);
    this.clockInterval = window.setInterval(() => this.clockTick.update((tick) => tick + 1), 1000);
  }

  private stopClock(): void {
    if (this.clockInterval) window.clearInterval(this.clockInterval);
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
  if (error.code === 'in-use') return { kind: 'in-use' };
  return { kind: 'unknown', message: error.message || 'Media access failed' };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T | null): Promise<T | null> {
  return Promise.race([promise, new Promise<T | null>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

function hashClientKey(key: string | null): string {
  if (!key) return '(none)';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(16).padStart(8, '0')}`;
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
  audioOutput: AUDIO_OUTPUT_DEVICE_STORAGE_KEY,
  videoInput: 'meet-poc.device.videoInput',
} as const;

function reconnectTokenKey(roomKey: string): string {
  return `meet-poc.reconnect.${roomKey}`;
}

function readClientKey(): string {
  const storageKey = 'meet-poc.clientKey';
  // Per-TAB identity (sessionStorage), not per-browser (localStorage). Two tabs
  // of the same room get distinct identities, so they no longer supersede each
  // other in an endless reconnect loop. Reload within a tab still resumes
  // (sessionStorage survives reload); closing the tab ends the session.
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const generated =
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function emptyDiagnosticsTrackInfo(kind: 'audio' | 'video'): DiagnosticsTrackInfo {
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

function emptyDiagnosticsInboundAudio(): DiagnosticsPeerSample['inboundAudio'] {
  return {
    packetsReceived: null,
    packetsLost: null,
    bytesReceived: null,
    audioLevel: null,
    jitterBufferDelay: null,
    jitterBufferTargetDelay: null,
    jitterBufferEmittedCount: null,
    concealedSamples: null,
    concealmentEvents: null,
    remoteRoundTripTime: null,
    remoteFractionLost: null,
    packetsReceivedDelta: null,
    packetsActivelyArriving: null,
    trackReadyState: null,
    trackMuted: null,
  };
}

function readEqualSizeTiles(): boolean {
  try {
    return window.localStorage.getItem(EQUAL_SIZE_TILES_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function storeEqualSizeTiles(enabled: boolean): void {
  try {
    window.localStorage.setItem(EQUAL_SIZE_TILES_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Best effort only.
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

function readStoredRoomPassword(slug: string): string | null {
  try {
    return window.sessionStorage.getItem(ROOM_PASSWORD_PREFIX + slug);
  } catch {
    return null;
  }
}

function clearStoredRoomPassword(slug: string): void {
  try {
    window.sessionStorage.removeItem(ROOM_PASSWORD_PREFIX + slug);
  } catch {
    // Best effort only.
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
  // First-run (nothing stored/current): prefer the OS-tracked 'default' input the
  // user actually configured before falling back to the first enumerated device.
  if (devices.some((device) => device.deviceId === 'default')) return 'default';
  return devices[0]?.deviceId || '';
}

function audioTrackDeviceId(track: MediaStreamTrack | null | undefined): string {
  return mediaTrackDeviceId(track);
}

function formatMetric(value: number | null, unit: 'ms' | '%'): string {
  if (value === null) return 'n/a';
  return unit === '%' ? `${value.toFixed(1)}%` : `${Math.round(value)} ms`;
}

function mediaTrackDeviceId(track: MediaStreamTrack | null | undefined): string {
  if (!track || typeof track.getSettings !== 'function') return '';
  const deviceId = track.getSettings().deviceId;
  return typeof deviceId === 'string' ? deviceId : '';
}

function canSetSinkId(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

function remoteVoiceSample(track: SfuInboundTrackStats): VoiceRecoverySample | null {
  const bytes = track.bytesReceived;
  const emitted = track.jitterBufferEmittedCount;
  if (typeof bytes !== 'number' || typeof emitted !== 'number') return null;
  if (!Number.isFinite(bytes) || !Number.isFinite(emitted)) return null;
  if (bytes < 0 || emitted < 0) return null;
  return {
    bytes,
    emitted,
    audioLevel: nonNegativeFiniteOrNull(track.audioLevel),
    totalAudioEnergy: nonNegativeFiniteOrNull(track.totalAudioEnergy),
  };
}

function nonNegativeFiniteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function selectedCandidatePairType(sfuDiagnostics: SfuDiagnosticsSnapshot | undefined): string | null {
  const pair = sfuDiagnostics?.selectedCandidatePair;
  const localType = pair?.local?.candidateType ?? null;
  const remoteType = pair?.remote?.candidateType ?? null;
  if (!localType && !remoteType) return null;
  if (localType && remoteType) return `${localType}/${remoteType}`;
  return localType ?? remoteType;
}

// B1: the __meetDebug.remoteAudioMixer object spreads a live snapshot and also
// exposes debugSnapshot() (fresh read) + a localhost-only __suspendForTest() hook.
type RemoteAudioMixerDebug = RemoteAudioDebugSnapshot & {
  debugSnapshot: () => RemoteAudioDebugSnapshot;
  __suspendForTest?: () => Promise<void>;
  __injectRemoteSourceForTest?: (id: string, stream: MediaStream) => void;
  __removeRemoteSourceForTest?: (id: string) => void;
};

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
      speakerVerified?: boolean;
      doorbellCount?: number;
      publishTriggerCount?: number;
      preflightGateStatus?: string;
      waitingKnockers?: { id: string; name: string }[];
      wsConnected?: boolean;
      wsStatus?: string;
      wsReconnectAttempts?: number;
      wsResyncCount?: number;
      reconnectTokenPresent?: boolean;
      myClientId?: string | null;
      myParticipantId?: string | null;
      diagnosticsLoggingEnabled?: boolean;
      forceRelayDiagnostic?: TurnHealthResult | null;
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
      remoteAudioMixer?: RemoteAudioMixerDebug;
      sfuPublishState?: LocalPublishState | null;
      sfuConnectionQuality?: SfuConnectionQuality | null;
      sfuRemoteStreams?: Map<string, MediaStream>;
      sfuRemoteScreenStreams?: Map<string, MediaStream>;
      sfuGetStats?: () => Promise<RTCStatsReport | null>;
      sfuVideoEncodings?: () => RTCRtpEncodingParameters[];
      sfuUpdateCameraLayer?: () => Promise<void>;
      sfuSubscribedTracks?: () => Record<string, import('../../services/sfu-client.service').SubscribedTrackEntry>;
      sfuLastRecoveryEvent?: () => import('../../services/sfu-client.service').SfuRecoveryDiagnosticsEvent | null;
      sfuRejoinThrottled?: () => boolean;
      sfuPublishRecoveryFailed?: () => boolean;
      forceRelayDiagnostics?: () => Promise<TurnHealthResult>;
      closeSignalingForTest?: () => void;
      isMobile?: () => boolean;
      isIOS?: () => boolean;
      isAndroid?: () => boolean;
      injectActiveSpeakerStream?: (id: string, stream: MediaStream) => void;
      forceActiveSpeakerForTest?: (id: string | null) => void;
      forceSfuRejoinThrottledForTest?: () => void;
      forcePublishRecoveryFailedForTest?: () => void;
    };
  }
}
