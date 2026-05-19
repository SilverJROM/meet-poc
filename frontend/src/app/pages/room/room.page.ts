import { Component, OnDestroy, Signal, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { PlatformService } from '../../services/platform.service';
import { ParticipantSnapshot, RecorderService } from '../../services/recorder.service';
import { RoomsService } from '../../services/rooms.service';
import { ViewportService } from '../../services/viewport.service';
import { SignalingMessage, WsService } from '../../services/ws.service';
import { WebrtcService } from '../../services/webrtc.service';

type RoomState = 'checking' | 'not-found' | 'lobby' | 'connecting' | 'knocking' | 'in-call' | 'rejected' | 'error';
type BufferedSignal = { from: string; data: unknown };
type LobbyError =
  | { kind: 'denied' }
  | { kind: 'no-devices' }
  | { kind: 'video-denied-but-audio-ok' }
  | { kind: 'unknown'; message: string };

@Component({
  selector: 'app-room',
  standalone: true,
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
  private readonly ws = inject(WsService);
  readonly media = inject(MediaService);
  readonly recorder = inject(RecorderService);
  readonly webrtc = inject(WebrtcService);
  readonly activeSpeaker = inject(ActiveSpeakerService);
  private readonly platform = inject(PlatformService);
  private readonly viewport = inject(ViewportService);

  readonly roomId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly state = signal<RoomState>('checking');
  readonly roomTitle = signal('Checking room...');
  readonly displayName = signal('');
  readonly cameraRequested = signal(false);
  readonly localStream = this.media.localStream;
  readonly audioInputs = signal<MediaDeviceInfo[]>([]);
  readonly audioOutputs = signal<MediaDeviceInfo[]>([]);
  readonly videoInputs = signal<MediaDeviceInfo[]>([]);
  readonly selectedAudioId = signal(readStoredDevice(DEVICE_STORAGE.audioInput));
  readonly selectedAudioOutputId = signal(readStoredDevice(DEVICE_STORAGE.audioOutput));
  readonly selectedVideoId = signal(readStoredDevice(DEVICE_STORAGE.videoInput));
  readonly currentFacingMode = signal<'user' | 'environment'>('user');
  readonly lobbyDeviceDialogOpen = signal(true);
  readonly devicePermissionIntro = signal(true);
  readonly inCallDeviceDialogOpen = signal(false);
  readonly deviceDialogBusy = signal(false);
  readonly deviceDialogError = signal<string | null>(null);
  readonly canSelectAudioOutput = signal(canSetSinkId());
  readonly permissionError = signal<LobbyError | null>(null);
  readonly hasBlockingLobbyError = computed(() => {
    const error = this.permissionError();
    return !!error && error.kind !== 'video-denied-but-audio-ok';
  });
  readonly micLevel = signal<Signal<number>>(signal(0).asReadonly());
  readonly error = signal<string | null>(null);
  readonly status = signal('');
  readonly deviceFailureNotice = signal<string | null>(null);
  readonly myId = signal<string | null>(null);
  readonly hostClientId = signal<string | null>(null);
  readonly isOwner = signal(false);
  readonly isHost = computed(() => this.isOwner() || (!!this.myId() && this.hostClientId() === this.myId()));
  readonly sidebarOpen = signal(false);
  readonly leaveDialogOpen = signal(false);
  readonly meetingEndedToastOpen = signal(false);
  readonly warningDismissed = signal(false);
  readonly knockers = signal<Knocker[]>([]);
  readonly peers = this.webrtc.peerList;
  readonly shareStripCollapsed = signal(false);
  readonly promotedSpeakerId = signal<string | null>(null);
  readonly sharingPeer = computed(() => this.peers().find((peer) => peer.screenOn) ?? null);
  readonly shareLayoutActive = computed(() => !!this.sharingPeer());
  readonly shareStream = computed(() => {
    const peer = this.sharingPeer();
    if (!peer) return null;
    return peer.isLocal ? this.media.screenStream() : peer.stream;
  });
  readonly orderedStripPeers = computed(() => {
    const promoted = this.promotedSpeakerId() ?? this.activeSpeaker.activePeerId();
    return [...this.peers()].sort((left, right) => {
      if (left.id === promoted && right.id !== promoted) return -1;
      if (right.id === promoted && left.id !== promoted) return 1;
      if (left.screenOn !== right.screenOn) return left.screenOn ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  });
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
  private speakerPromotionTimer: ReturnType<typeof setTimeout> | null = null;
  private speakerPromotionCandidate: string | null = null;
  private readonly pendingSignals = new Map<string, BufferedSignal[]>();
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
    this.installPageLifecycleCleanup();
    void this.bootstrap();
    effect(() => {
      const debug: NonNullable<Window['__meetDebug']> = {
        localStream: this.media.localStream(),
        peers: this.peers().map((peer) => {
          const audio = peer.stream?.getAudioTracks()[0];
          return {
            id: peer.id,
            name: peer.name,
            state: peer.connectionState,
            audioMuted: audio?.muted,
            audioReadyState: audio?.readyState,
            audioEnabled: audio?.enabled,
            micEnabled: peer.micEnabled,
            camEnabled: peer.camEnabled,
            screenOn: peer.screenOn,
          };
        }),
        shareLayoutActive: this.shareLayoutActive(),
        shareStripCollapsed: this.shareStripCollapsed(),
        promotedSpeakerId: this.promotedSpeakerId(),
        isRecording: this.recorder.isRecording() || this.hostRecording(),
        screenShareAttempts: this.media.screenShareAttempts(),
        lastVideoConstraints: this.media.lastVideoConstraints(),
        audioContextActivated: this.media.audioContextActivated(),
        speakerTestCount: window.__meetDebug?.speakerTestCount ?? 0,
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
        peerConnectionStates: () =>
          this.peers()
            .filter((peer) => !peer.isLocal && peer.pc)
            .map((peer) => ({ id: peer.id, state: peer.pc?.connectionState ?? peer.connectionState })),
        remoteMedia: () =>
          this.peers()
            .filter((peer) => !peer.isLocal)
            .map((peer) => ({
              id: peer.id,
              audioTracks: peer.stream?.getAudioTracks().length ?? 0,
              videoTracks: peer.stream?.getVideoTracks().length ?? 0,
              hasVideoSrcObject: !!peer.stream?.getVideoTracks().length,
            })),
        isMobile: () => this.viewport.isMobile(),
        isIOS: () => this.platform.isIOS(),
        isAndroid: () => this.platform.isAndroid(),
      };
      if (window.location.hostname === 'localhost') {
        debug.injectActiveSpeakerStream = (id: string, stream: MediaStream) => this.activeSpeaker.injectDebugStream(id, stream);
      }
      window.__meetDebug = debug;
    });
    effect(() => {
      this.activeSpeaker.observe(this.peers());
    });
    effect(() => {
      const frame = this.activeSpeaker.activeFrame();
      this.queueSpeakerPromotion(frame.id);
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
      const info = await this.rooms.exists(this.roomId);
      if (!info.exists) {
        this.roomTitle.set('Room not found');
        this.state.set('not-found');
        return;
      }
      this.roomTitle.set(info.title ?? 'Untitled room');
      this.state.set('lobby');
      this.prepareLobbyDeviceCheck();
    } catch {
      this.error.set('Room could not be loaded');
      this.state.set('error');
    }
  }

  async join(): Promise<void> {
    const name = this.displayName().trim();
    if (!name || this.state() === 'connecting') return;
    this.activeSpeaker.unlock();
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
    this.ws.connect(
      this.roomId,
      (msg) => void this.handleMessage(msg),
      () => this.ws.send({ type: 'join', room: this.roomId, name, mobile: this.viewport.isMobile() }),
      () => {
        if (this.state() !== 'in-call') {
          this.error.set('Signaling connection error.');
          this.state.set('lobby');
        } else {
          this.status.set('Disconnected from signaling.');
        }
      },
    );
  }

  cancelKnock(): void {
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

  async flipLobbyCamera(): Promise<void> {
    if (!this.viewport.isMobile() || !this.cameraRequested()) return;
    this.currentFacingMode.update((mode) => (mode === 'user' ? 'environment' : 'user'));
    await this.reacquireLobbyStream();
  }

  async toggleMic(): Promise<void> {
    const mic = this.media.toggleMic();
    this.updateLocalMediaState();
    this.broadcastMediaState(mic, this.media.cameraOn());
  }

  async toggleCamera(): Promise<void> {
    try {
      const cam = await this.media.toggleCamera((track) => this.webrtc.replaceVideoTrack(track));
      this.updateLocalMediaState();
      this.broadcastMediaState(this.media.micOn(), cam);
    } catch (err) {
      this.status.set(`Camera access failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async toggleScreen(): Promise<void> {
    try {
      await this.media.toggleScreen((track) => this.webrtc.replaceVideoTrack(track));
      this.updateLocalMediaState();
      this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
      this.status.set(this.media.screenOn() ? 'Screen sharing.' : 'Screen sharing stopped.');
    } catch (err) {
      this.status.set(`Screen share failed: ${err instanceof Error ? err.message : 'not available'}`);
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
    this.activeSpeaker.unlock();
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
    this.sidebarOpen.update((open) => !open);
  }

  toggleShareStrip(): void {
    this.shareStripCollapsed.update((collapsed) => !collapsed);
  }

  async leave(): Promise<void> {
    if (this.isHost()) {
      this.leaveDialogOpen.set(true);
      return;
    }
    await this.directLeave();
  }

  async justLeave(): Promise<void> {
    this.leaveDialogOpen.set(false);
    await this.directLeave();
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
      await this.directLeave();
    }
  }

  async dismissMeetingEnded(): Promise<void> {
    this.meetingEndedToastOpen.set(false);
    await this.directLeave();
  }

  private async directLeave(): Promise<void> {
    this.cleanupCall();
    await this.router.navigate([this.auth.user() ? '/app/rooms' : '/']);
  }

  ngOnDestroy(): void {
    this.uninstallPageLifecycleCleanup();
    this.cleanupCall();
    delete window.__meetDebug;
  }

  private async handleMessage(msg: SignalingMessage): Promise<void> {
    if (msg.type === 'knocking') {
      this.myId.set(msg.clientId);
      if (msg.roomTitle) this.roomTitle.set(msg.roomTitle);
      this.state.set('knocking');
      this.status.set('Asking the host to admit you...');
      return;
    }
    if (msg.type === 'rejected') {
      this.cleanupCall();
      this.error.set(msg.reason ? `Host: ${msg.reason}` : 'The host rejected your request.');
      this.state.set('rejected');
      return;
    }
    if (msg.type === 'admitted') {
      this.myId.set(msg.clientId);
      this.isOwner.set(!!msg.isOwner);
      if (msg.roomTitle) this.roomTitle.set(msg.roomTitle);
      const stream = this.media.localStream();
      if (stream) {
        this.webrtc.configure(stream, (to, data) => this.ws.send({ type: 'signal', to, data }));
        this.hostClientId.set(msg.hostClientId || (msg.isOwner ? msg.clientId : null));
        this.webrtc.setLocalPeer(msg.clientId, this.displayName().trim() || 'Anon', {
          isHost: msg.isOwner,
          micEnabled: this.media.micOn(),
          camEnabled: this.media.cameraOn(),
          screenOn: this.media.screenOn(),
        });
      }
      this.state.set('in-call');
      this.installMobileVisibilityPause();
      this.startClock();
      this.status.set(`You are ${this.displayName().trim() || 'Anon'}${msg.isOwner ? ' (host)' : ''}.`);
      for (const peer of msg.peers) {
        await this.webrtc.addPeer(peer.id, peer.name, true, { isHost: !!peer.host || peer.id === this.hostClientId() });
        await this.drainPendingSignals(peer.id);
      }
      this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
      return;
    }
    if (msg.type === 'pending-list') {
      this.knockers.set((msg.knockers || []).map((knocker) => ({ id: knocker.id, name: knocker.name })));
      return;
    }
    if (msg.type === 'knock') {
      this.upsertKnocker({ id: msg.clientId, name: msg.name });
      this.status.set(`${msg.name} is asking to join.`);
      return;
    }
    if (msg.type === 'knock-cancelled') {
      this.removeKnocker(msg.clientId);
      return;
    }
    if (msg.type === 'peer-joined') {
      this.status.set(`${msg.name} joined.`);
      await this.webrtc.addPeer(msg.clientId, msg.name, false, { isHost: !!msg.host || msg.clientId === this.hostClientId() });
      this.recorder.notifyParticipantJoined({
        clientId: msg.clientId,
        displayName: msg.name,
        isHost: !!msg.host || msg.clientId === this.hostClientId(),
      });
      await this.drainPendingSignals(msg.clientId);
      return;
    }
    if (msg.type === 'media-state') {
      this.webrtc.updatePeer(msg.clientId, { micEnabled: msg.mic, camEnabled: msg.cam, screenOn: !!msg.screenOn });
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
        void this.directLeave();
      }, 600);
      return;
    }
    if (msg.type === 'meeting-ended') {
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
      this.pendingSignals.delete(msg.clientId);
      this.removeKnocker(msg.clientId);
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
    }
  }

  private upsertKnocker(knocker: Knocker): void {
    const next = this.knockers().filter((item) => item.id !== knocker.id);
    next.push(knocker);
    this.knockers.set(next);
  }

  private removeKnocker(clientId: string): void {
    this.knockers.set(this.knockers().filter((item) => item.id !== clientId));
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
    this.error.set(null);
    try {
      const stream = await this.media.preflight({ audio: true, video: this.cameraRequested(), facingMode: this.mobileFacingMode() });
      this.attachLocalTrackFailureHandlers(stream);
      this.micLevel.set(this.media.getMicLevel(stream));
      await this.refreshDevices();
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
    this.error.set(null);
    try {
      const stream = await this.media.reacquire({
        audioDeviceId: this.selectedAudioId() || undefined,
        videoDeviceId: this.selectedVideoId() || undefined,
        facingMode: this.mobileFacingMode(),
        video: this.cameraRequested(),
      });
      this.attachLocalTrackFailureHandlers(stream);
      this.micLevel.set(this.media.getMicLevel(stream));
      await this.refreshDevices();
    } catch (err) {
      await this.handleLobbyMediaError(err, this.cameraRequested());
      this.deviceDialogError.set((err as MediaError).message || 'Device change failed');
    } finally {
      this.deviceDialogBusy.set(false);
    }
  }

  private prepareLobbyDeviceCheck(): void {
    this.lobbyDeviceDialogOpen.set(true);
    this.devicePermissionIntro.set(true);
    this.clearPreflightTimer();
    if (this.route.snapshot.queryParamMap.get('manualDeviceSetup') === '1') return;
    this.preflightTimer = window.setTimeout(() => {
      if (this.state() === 'lobby' && !this.media.localStream()) void this.startLobbyPreflight();
    }, 650);
  }

  private clearPreflightTimer(): void {
    if (this.preflightTimer) clearTimeout(this.preflightTimer);
    this.preflightTimer = null;
  }

  private async handleLobbyMediaError(err: unknown, videoRequested: boolean): Promise<void> {
    const mediaError = err as MediaError;
    if (videoRequested && mediaError.code === 'denied') {
      try {
        const stream = await this.media.preflight({ audio: true, video: false });
        this.cameraRequested.set(false);
        this.permissionError.set({ kind: 'video-denied-but-audio-ok' });
        this.error.set(null);
        this.attachLocalTrackFailureHandlers(stream);
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

  private mobileFacingMode(): 'user' | 'environment' | undefined {
    return this.viewport.isMobile() && this.cameraRequested() ? this.currentFacingMode() : undefined;
  }

  private cleanupCall(): void {
    this.clearPreflightTimer();
    if (this.speakerPromotionTimer) clearTimeout(this.speakerPromotionTimer);
    this.speakerPromotionTimer = null;
    this.speakerPromotionCandidate = null;
    this.promotedSpeakerId.set(null);
    this.ws.close();
    this.recorder.discard();
    this.media.stopLocal();
    this.webrtc.reset();
    this.pendingSignals.clear();
    this.knockers.set([]);
    this.isOwner.set(false);
    this.myId.set(null);
    this.hostClientId.set(null);
    this.currentSessionId.set(null);
    this.sidebarOpen.set(false);
    this.shareStripCollapsed.set(false);
    this.leaveDialogOpen.set(false);
    this.meetingEndedToastOpen.set(false);
    this.deviceFailureNotice.set(null);
    this.actionNotice.set(null);
    this.hostRecording.set(false);
    this.recordingStartedAt.set(null);
    this.currentFacingMode.set('user');
    this.activeSpeaker.reset();
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
      }
    } catch (err) {
      this.deviceDialogError.set(`Microphone switch failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      this.deviceDialogBusy.set(false);
    }
  }

  private async replaceInCallVideo(deviceId: string): Promise<void> {
    this.deviceDialogBusy.set(true);
    this.deviceDialogError.set(null);
    try {
      const track = await this.media.replaceVideoTrack(deviceId || undefined, (nextTrack) => this.webrtc.replaceLocalSenderTrack('video', nextTrack), this.mobileFacingMode());
      if (track) {
        this.updateLocalMediaState();
        this.broadcastMediaState(this.media.micOn(), true);
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
    if (!audioTrack) return;
    const onFailure = () => this.handleLocalAudioFailure();
    audioTrack.onended = onFailure;
    audioTrack.onmute = onFailure;
  }

  private handleLocalAudioFailure(): void {
    if (this.state() !== 'in-call') return;
    this.media.micOn.set(false);
    this.updateLocalMediaState();
    this.broadcastMediaState(false, this.media.cameraOn());
    this.deviceFailureNotice.set('Microphone disconnected. Please refresh to rejoin.');
  }

  private broadcastMediaState(mic: boolean, cam: boolean, screenOn = this.media.screenOn()): void {
    this.ws.send({ type: 'media-state', mic, cam, screenOn });
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
    this.webrtc.updatePeer(id, { micEnabled: this.media.micOn(), camEnabled: this.media.cameraOn(), screenOn: this.media.screenOn() });
  }

  private queueSpeakerPromotion(candidate: string | null): void {
    if (this.speakerPromotionCandidate === candidate) return;
    this.speakerPromotionCandidate = candidate;
    if (this.speakerPromotionTimer) clearTimeout(this.speakerPromotionTimer);
    this.speakerPromotionTimer = window.setTimeout(() => {
      this.promotedSpeakerId.set(this.speakerPromotionCandidate);
      this.speakerPromotionTimer = null;
    }, 500);
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

const DEVICE_STORAGE = {
  audioInput: 'meet-poc.device.audioInput',
  audioOutput: 'meet-poc.device.audioOutput',
  videoInput: 'meet-poc.device.videoInput',
} as const;

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

function canSetSinkId(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

declare global {
  interface Window {
    __meetDebug?: {
      localStream: MediaStream | null;
      peers: {
        id: string;
        name: string;
        state: string;
        audioMuted?: boolean;
        audioReadyState?: MediaStreamTrackState;
        audioEnabled?: boolean;
        micEnabled?: boolean;
        camEnabled?: boolean;
        screenOn?: boolean;
      }[];
      shareLayoutActive?: boolean;
      shareStripCollapsed?: boolean;
      promotedSpeakerId?: string | null;
      screenShareAttempts: number;
      lastVideoConstraints?: MediaStreamConstraints | null;
      audioContextActivated?: boolean;
      speakerTestCount?: number;
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
      peerConnectionStates?: () => { id: string; state: RTCPeerConnectionState | 'local' }[];
      remoteMedia?: () => { id: string; audioTracks: number; videoTracks: number; hasVideoSrcObject: boolean }[];
      isMobile?: () => boolean;
      isIOS?: () => boolean;
      isAndroid?: () => boolean;
      injectActiveSpeakerStream?: (id: string, stream: MediaStream) => void;
    };
  }
}
