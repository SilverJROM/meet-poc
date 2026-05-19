import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../environments/environment';

export type PeerState = {
  id: string;
  name: string;
  pc: RTCPeerConnection | null;
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState | 'local';
  isLocal: boolean;
};

type SignalPayload = {
  sdp?: RTCSessionDescriptionInit;
  ice?: RTCIceCandidateInit;
};

@Injectable({ providedIn: 'root' })
export class WebrtcService {
  private localStream: MediaStream | null = null;
  private sendSignal: ((to: string, data: unknown) => void) | null = null;

  readonly peers = signal<Map<string, PeerState>>(new Map());
  readonly peerList = computed(() => Array.from(this.peers().values()));

  configure(localStream: MediaStream, sendSignal: (to: string, data: unknown) => void): void {
    this.localStream = localStream;
    this.sendSignal = sendSignal;
  }

  setLocalPeer(clientId: string, name: string): void {
    this.mutatePeers((peers) => {
      peers.set(clientId, {
        id: clientId,
        name: `${name} (you)`,
        pc: null,
        stream: this.localStream,
        connectionState: 'local',
        isLocal: true,
      });
    });
  }

  async addPeer(clientId: string, name: string, isInitiator: boolean): Promise<void> {
    if (!this.localStream || !this.sendSignal || this.peers().has(clientId)) return;
    const pc = new RTCPeerConnection({ iceServers: environment.iceServers });
    const peer: PeerState = {
      id: clientId,
      name,
      pc,
      stream: new MediaStream(),
      connectionState: pc.connectionState,
      isLocal: false,
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
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendSignal(clientId, { sdp: pc.localDescription?.toJSON() });
    }
  }

  async handleSignal(from: string, data: unknown): Promise<void> {
    const payload = data as SignalPayload;
    const peer = this.peers().get(from);
    const pc = peer?.pc;
    if (!pc) return;
    if (payload.sdp) {
      await pc.setRemoteDescription(payload.sdp);
      if (payload.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal?.(from, { sdp: pc.localDescription?.toJSON() });
      }
    } else if (payload.ice) {
      try {
        await pc.addIceCandidate(payload.ice);
      } catch (err) {
        console.warn('addIceCandidate failed', err);
      }
    }
  }

  async replaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    const operations: Promise<void>[] = [];
    for (const peer of this.peers().values()) {
      const pc = peer.pc;
      if (!pc) continue;
      const sender = pc.getSenders().find((candidate) => candidate.track?.kind === 'video');
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

  removePeer(clientId: string): void {
    const peer = this.peers().get(clientId);
    peer?.pc?.close();
    peer?.stream?.getTracks().forEach((track) => track.stop());
    this.mutatePeers((peers) => peers.delete(clientId));
  }

  reset(): void {
    for (const peer of this.peers().values()) {
      peer.pc?.close();
      if (!peer.isLocal) peer.stream?.getTracks().forEach((track) => track.stop());
    }
    this.peers.set(new Map());
    this.localStream = null;
    this.sendSignal = null;
  }

  private touchPeer(clientId: string, patch: Partial<PeerState>): void {
    this.mutatePeers((peers) => {
      const current = peers.get(clientId);
      if (current) peers.set(clientId, { ...current, ...patch });
    });
  }

  private mutatePeers(change: (peers: Map<string, PeerState>) => void): void {
    const next = new Map(this.peers());
    change(next);
    this.peers.set(next);
  }
}
