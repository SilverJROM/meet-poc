import { Component, OnDestroy, Signal, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ControlsBarComponent } from '../../components/controls-bar/controls-bar.component';
import { KnockSpinnerComponent } from '../../components/knock-spinner/knock-spinner.component';
import { LobbyPreviewComponent } from '../../components/lobby-preview/lobby-preview.component';
import { TileComponent } from '../../components/tile/tile.component';
import { Knocker, WaitingRoomPanelComponent } from '../../components/waiting-room-panel/waiting-room-panel.component';
import { AuthService } from '../../services/auth.service';
import { MediaError, MediaService } from '../../services/media.service';
import { RecorderService } from '../../services/recorder.service';
import { RoomsService } from '../../services/rooms.service';
import { SignalingMessage, WsService } from '../../services/ws.service';
import { WebrtcService } from '../../services/webrtc.service';

type RoomState = 'checking' | 'not-found' | 'lobby' | 'connecting' | 'knocking' | 'in-call' | 'rejected' | 'error';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [FormsModule, RouterLink, ControlsBarComponent, KnockSpinnerComponent, LobbyPreviewComponent, TileComponent, WaitingRoomPanelComponent],
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

  readonly roomId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly state = signal<RoomState>('checking');
  readonly roomTitle = signal('Checking room...');
  readonly displayName = signal('');
  readonly cameraRequested = signal(false);
  readonly localStream = this.media.localStream;
  readonly audioInputs = signal<MediaDeviceInfo[]>([]);
  readonly videoInputs = signal<MediaDeviceInfo[]>([]);
  readonly selectedAudioId = signal('');
  readonly selectedVideoId = signal('');
  readonly permissionError = signal<MediaError['code'] | null>(null);
  readonly micLevel = signal<Signal<number>>(signal(0).asReadonly());
  readonly error = signal<string | null>(null);
  readonly status = signal('');
  readonly myId = signal<string | null>(null);
  readonly hostClientId = signal<string | null>(null);
  readonly isOwner = signal(false);
  readonly warningDismissed = signal(false);
  readonly knockers = signal<Knocker[]>([]);
  readonly peers = this.webrtc.peerList;
  readonly showPeerWarning = computed(() => this.peers().length >= 6 && !this.warningDismissed());
  private readonly callStartMs = signal<number | null>(null);
  private readonly clockTick = signal(0);
  private clockInterval: ReturnType<typeof setInterval> | null = null;
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
    void this.bootstrap();
    effect(() => {
      window.__meetDebug = {
        localStream: this.media.localStream(),
        peers: this.peers().map((peer) => ({ id: peer.id, name: peer.name, state: peer.connectionState })),
        isRecording: this.recorder.isRecording(),
        screenShareAttempts: this.media.screenShareAttempts(),
      };
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
      await this.startLobbyPreflight();
    } catch {
      this.error.set('Room could not be loaded');
      this.state.set('error');
    }
  }

  async join(): Promise<void> {
    const name = this.displayName().trim();
    if (!name || this.state() === 'connecting') return;
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
      () => this.ws.send({ type: 'join', room: this.roomId, name }),
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

  async setCameraRequested(value: boolean): Promise<void> {
    this.cameraRequested.set(value);
    if (this.state() === 'lobby') await this.reacquireLobbyStream();
  }

  async changeAudioDevice(deviceId: string): Promise<void> {
    this.selectedAudioId.set(deviceId);
    await this.reacquireLobbyStream();
  }

  async changeVideoDevice(deviceId: string): Promise<void> {
    this.selectedVideoId.set(deviceId);
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
      this.status.set(this.media.screenOn() ? 'Screen sharing.' : 'Screen sharing stopped.');
    } catch (err) {
      this.status.set(`Screen share failed: ${err instanceof Error ? err.message : 'not available'}`);
    }
  }

  async toggleRecording(): Promise<void> {
    const localStream = this.media.localStream();
    if (!localStream) return;
    try {
      if (!this.recorder.isRecording()) {
        this.recorder.start(localStream, this.remoteStreams());
        this.status.set('Recording (audio mix: you + admitted peers).');
        return;
      }
      const blob = await this.recorder.stop();
      this.status.set(`Uploading recording (${Math.round(blob.size / 1024)} KB)...`);
      const upload = await this.recorder.upload(blob, this.roomId);
      this.status.set(`Recording saved: ${upload.file}`);
    } catch (err) {
      this.status.set(`Recording failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      this.recorder.discard();
    }
  }

  admit(clientId: string): void {
    this.ws.send({ type: 'admit', clientId });
    this.removeKnocker(clientId);
  }

  reject(clientId: string): void {
    this.ws.send({ type: 'reject', clientId });
    this.removeKnocker(clientId);
  }

  async leave(): Promise<void> {
    this.cleanupCall();
    await this.router.navigate([this.auth.user() ? '/app/rooms' : '/']);
  }

  ngOnDestroy(): void {
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
        });
      }
      this.state.set('in-call');
      this.startClock();
      this.status.set(`You are ${this.displayName().trim() || 'Anon'}${msg.isOwner ? ' (host)' : ''}.`);
      for (const peer of msg.peers) {
        await this.webrtc.addPeer(peer.id, peer.name, true, { isHost: !!peer.host || peer.id === this.hostClientId() });
      }
      this.broadcastMediaState(this.media.micOn(), this.media.cameraOn());
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
      return;
    }
    if (msg.type === 'media-state') {
      this.webrtc.updatePeer(msg.clientId, { micEnabled: msg.mic, camEnabled: msg.cam });
      return;
    }
    if (msg.type === 'peer-left') {
      this.recorder.removePeerStream(msg.clientId);
      this.webrtc.removePeer(msg.clientId);
      this.removeKnocker(msg.clientId);
      return;
    }
    if (msg.type === 'signal') {
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

  private async startLobbyPreflight(): Promise<void> {
    this.permissionError.set(null);
    this.error.set(null);
    try {
      const stream = await this.media.preflight({ audio: true, video: this.cameraRequested() });
      this.micLevel.set(this.media.getMicLevel(stream));
      await this.refreshDevices();
    } catch (err) {
      const mediaError = err as MediaError;
      this.permissionError.set(mediaError.code || 'unknown');
      this.error.set(mediaError.message || 'Media access failed');
    }
  }

  private async reacquireLobbyStream(): Promise<void> {
    if (this.state() !== 'lobby') return;
    this.permissionError.set(null);
    this.error.set(null);
    try {
      const stream = await this.media.reacquire({
        audioDeviceId: this.selectedAudioId() || undefined,
        videoDeviceId: this.selectedVideoId() || undefined,
        video: this.cameraRequested(),
      });
      this.micLevel.set(this.media.getMicLevel(stream));
      await this.refreshDevices();
    } catch (err) {
      const mediaError = err as MediaError;
      this.permissionError.set(mediaError.code || 'unknown');
      this.error.set(mediaError.message || 'Media access failed');
    }
  }

  private async refreshDevices(): Promise<void> {
    const devices = await this.media.enumerateDevices();
    this.audioInputs.set(devices.audioInputs);
    this.videoInputs.set(devices.videoInputs);
    if (!this.selectedAudioId() || !devices.audioInputs.some((device) => device.deviceId === this.selectedAudioId())) {
      this.selectedAudioId.set(devices.audioInputs[0]?.deviceId || '');
    }
    if (!this.selectedVideoId() || !devices.videoInputs.some((device) => device.deviceId === this.selectedVideoId())) {
      this.selectedVideoId.set(devices.videoInputs[0]?.deviceId || '');
    }
  }

  private cleanupCall(): void {
    this.ws.close();
    this.recorder.discard();
    this.webrtc.reset();
    this.media.stopLocal();
    this.knockers.set([]);
    this.isOwner.set(false);
    this.myId.set(null);
    this.hostClientId.set(null);
    this.stopClock();
  }

  private broadcastMediaState(mic: boolean, cam: boolean): void {
    this.ws.send({ type: 'media-state', mic, cam });
  }

  private updateLocalMediaState(): void {
    const id = this.myId();
    if (!id) return;
    this.webrtc.updatePeer(id, { micEnabled: this.media.micOn(), camEnabled: this.media.cameraOn() });
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

declare global {
  interface Window {
    __meetDebug?: {
      localStream: MediaStream | null;
      peers: { id: string; name: string; state: string }[];
      screenShareAttempts: number;
      isRecording: boolean;
    };
  }
}
