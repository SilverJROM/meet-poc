import { Injectable, computed, inject, signal } from '@angular/core';
import { IceConfigService } from './ice-config.service';

export type PeerState = {
  id: string;
  name: string;
  pc: RTCPeerConnection | null;
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState | 'local';
  iceConnectionState: RTCIceConnectionState | 'local';
  iceGatheringState: RTCIceGatheringState | 'local';
  signalingState: RTCSignalingState | 'local';
  selectedCandidateType: string | null;
  updatedAt: number;
  isLocal: boolean;
  isHost: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  screenOn: boolean;
};

type SignalPayload = {
  sdp?: RTCSessionDescriptionInit;
  ice?: RTCIceCandidateInit;
};

type PeerMeta = {
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  restartAttempts: number;
  restartTimer: ReturnType<typeof setTimeout> | null;
  lastRestartAt: number;
};

const ICE_RESTART_DEBOUNCE_MS = 1200;
const ICE_RESTART_COOLDOWN_MS = 3000;
const MAX_ICE_RESTART_ATTEMPTS = 3;
const FORCE_RELAY_STORAGE_KEY = 'meet-poc.forceRelay';

@Injectable({ providedIn: 'root' })
export class WebrtcService {
  private readonly iceConfig = inject(IceConfigService);

  private localStream: MediaStream | null = null;
  private sendSignal: ((to: string, data: unknown) => void) | null = null;
  private localClientId: string | null = null;
  private readonly peerMeta = new Map<string, PeerMeta>();
  readonly forceRelay = signal(readForceRelay());
  readonly lastPeerConnectionPolicy = signal<RTCIceTransportPolicy | 'all'>('all');
  readonly lastPeerConnectionConfig = signal<RTCConfiguration | null>(null);

  readonly peers = signal<Map<string, PeerState>>(new Map());
  readonly peerList = computed(() => Array.from(this.peers().values()));
  readonly diagnostics = computed(() =>
    this.peerList()
      .filter((peer) => !peer.isLocal)
      .map((peer) => ({
        id: peer.id,
        name: peer.name,
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        iceGatheringState: peer.iceGatheringState,
        signalingState: peer.signalingState,
        selectedCandidateType: peer.selectedCandidateType,
        updatedAt: peer.updatedAt,
      })),
  );

  configure(localStream: MediaStream, sendSignal: (to: string, data: unknown) => void): void {
    this.localStream = localStream;
    this.sendSignal = sendSignal;
  }

  setLocalPeer(clientId: string, name: string, options: { isHost: boolean; micEnabled: boolean; camEnabled: boolean; screenOn: boolean }): void {
    this.localClientId = clientId;
    this.mutatePeers((peers) => {
      peers.set(clientId, {
        id: clientId,
        name: `${name} (you)`,
        pc: null,
        stream: this.localStream,
        connectionState: 'local',
        iceConnectionState: 'local',
        iceGatheringState: 'local',
        signalingState: 'local',
        selectedCandidateType: null,
        updatedAt: Date.now(),
        isLocal: true,
        isHost: options.isHost,
        micEnabled: options.micEnabled,
        camEnabled: options.camEnabled,
        screenOn: options.screenOn,
      });
      for (const [id, peer] of peers) {
        if (peer.isLocal && id !== clientId) peers.delete(id);
      }
    });
  }

  async addPeer(clientId: string, name: string, isInitiator: boolean, options: { isHost?: boolean } = {}): Promise<void> {
    if (!this.localStream || !this.sendSignal || this.peers().has(clientId)) return;
    const iceServers = await this.iceConfig.getIceServers();
    const pc = new RTCPeerConnection(this.peerConnectionConfig(iceServers));
    const meta = this.createPeerMeta(clientId);
    this.peerMeta.set(clientId, meta);
    const peer: PeerState = {
      id: clientId,
      name,
      pc,
      stream: new MediaStream(),
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState,
      signalingState: pc.signalingState,
      selectedCandidateType: null,
      updatedAt: Date.now(),
      isLocal: false,
      isHost: !!options.isHost,
      micEnabled: true,
      camEnabled: true,
      screenOn: false,
    };
    this.mutatePeers((peers) => peers.set(clientId, peer));

    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }

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
      this.touchPeer(clientId, { connectionState: pc.connectionState });
      console.log(`[webrtc] peer ${clientId} connectionState=${pc.connectionState} at ${new Date().toISOString()}`);
      void this.logSelectedCandidateType(clientId, pc);
      this.maybeScheduleIceRestart(clientId, pc);
    };
    pc.oniceconnectionstatechange = () => {
      this.touchPeer(clientId, { iceConnectionState: pc.iceConnectionState });
      console.log(`[webrtc] peer ${clientId} iceConnectionState=${pc.iceConnectionState} at ${new Date().toISOString()}`);
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
        name: peer.name,
        isHost: peer.isHost,
        micEnabled: peer.micEnabled,
        camEnabled: peer.camEnabled,
        screenOn: peer.screenOn,
      }));
    for (const peer of remotes) this.removePeer(peer.id);
    for (const peer of remotes) {
      await this.addPeer(peer.id, peer.name, true, { isHost: peer.isHost });
      this.updatePeer(peer.id, { micEnabled: peer.micEnabled, camEnabled: peer.camEnabled, screenOn: peer.screenOn });
    }
  }

  async handleSignal(from: string, data: unknown): Promise<void> {
    const payload = data as SignalPayload;
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
      const sender = pc.getSenders().find((candidate) => candidate.track?.kind === kind);
      if (sender) {
        operations.push(sender.replaceTrack(track));
      } else if (track && this.localStream) {
        pc.addTrack(track, this.localStream);
      }
    }
    await Promise.all(operations);
    const localPeer = this.peerList().find((peer) => peer.isLocal);
    if (localPeer) this.touchPeer(localPeer.id, { stream: this.localStream });
  }

  updatePeer(clientId: string, patch: Partial<PeerState>): void {
    this.touchPeer(clientId, patch);
  }

  removePeer(clientId: string): void {
    const peer = this.peers().get(clientId);
    const meta = this.peerMeta.get(clientId);
    if (meta?.restartTimer) clearTimeout(meta.restartTimer);
    this.peerMeta.delete(clientId);
    peer?.pc?.close();
    peer?.stream?.getTracks().forEach((track) => track.stop());
    this.mutatePeers((peers) => peers.delete(clientId));
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
    }
    this.peerMeta.clear();
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

  private createPeerMeta(clientId: string): PeerMeta {
    return {
      polite: this.localClientId ? this.localClientId < clientId : false,
      makingOffer: false,
      ignoreOffer: false,
      restartAttempts: 0,
      restartTimer: null,
      lastRestartAt: 0,
    };
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

  private peerConnectionConfig(iceServers: RTCIceServer[]): RTCConfiguration {
    const config: RTCConfiguration = this.forceRelay() ? { iceServers, iceTransportPolicy: 'relay' } : { iceServers };
    this.lastPeerConnectionPolicy.set(config.iceTransportPolicy ?? 'all');
    this.lastPeerConnectionConfig.set(config);
    return config;
  }
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
