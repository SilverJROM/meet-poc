import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ControlsBarComponent } from '../../components/controls-bar/controls-bar.component';
import { KnockSpinnerComponent } from '../../components/knock-spinner/knock-spinner.component';
import { TileComponent } from '../../components/tile/tile.component';
import { Knocker, WaitingRoomPanelComponent } from '../../components/waiting-room-panel/waiting-room-panel.component';
import { AuthService } from '../../services/auth.service';
import { MediaService } from '../../services/media.service';
import { RecorderService } from '../../services/recorder.service';
import { RoomsService } from '../../services/rooms.service';
import { SignalingMessage, WsService } from '../../services/ws.service';
import { WebrtcService } from '../../services/webrtc.service';

type RoomState = 'checking' | 'not-found' | 'lobby' | 'connecting' | 'knocking' | 'in-call' | 'rejected' | 'error';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [FormsModule, RouterLink, ControlsBarComponent, KnockSpinnerComponent, TileComponent, WaitingRoomPanelComponent],
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
  readonly error = signal<string | null>(null);
  readonly status = signal('');
  readonly myId = signal<string | null>(null);
  readonly isOwner = signal(false);
  readonly warningDismissed = signal(false);
  readonly knockers = signal<Knocker[]>([]);
  readonly peers = this.webrtc.peerList;
  readonly showPeerWarning = computed(() => this.peers().length >= 6 && !this.warningDismissed());

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
    try {
      await this.media.getLocalStream(this.cameraRequested());
    } catch (err) {
      this.error.set(`Mic/camera access failed: ${err instanceof Error ? err.message : 'unknown error'}`);
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
  }

  async toggleMic(): Promise<void> {
    this.media.toggleMic();
  }

  async toggleCamera(): Promise<void> {
    try {
      await this.media.toggleCamera((track) => this.webrtc.replaceVideoTrack(track));
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
    await this.router.navigate([this.auth.user() ? '/dashboard' : '/']);
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
        this.webrtc.setLocalPeer(msg.clientId, this.displayName().trim() || 'Anon');
      }
      this.state.set('in-call');
      this.status.set(`You are ${this.displayName().trim() || 'Anon'}${msg.isOwner ? ' (host)' : ''}.`);
      for (const peer of msg.peers) {
        await this.webrtc.addPeer(peer.id, peer.name, true);
      }
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
      await this.webrtc.addPeer(msg.clientId, msg.name, false);
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

  private cleanupCall(): void {
    this.ws.close();
    this.recorder.discard();
    this.webrtc.reset();
    this.media.stopLocal();
    this.knockers.set([]);
    this.isOwner.set(false);
    this.myId.set(null);
  }
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
