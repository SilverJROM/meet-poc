import { Injectable, signal } from '@angular/core';

export type SignalingMessage =
  | {
      type: 'admitted';
      clientId: string;
      peers: { id: string; name: string; host?: boolean }[];
      roomTitle?: string;
      isOwner: boolean;
      hostClientId?: string;
    }
  | { type: 'knocking'; clientId: string; roomTitle?: string }
  | { type: 'knock'; clientId: string; name: string }
  | { type: 'pending-list'; knockers: { id: string; name: string }[] }
  | { type: 'peer-joined'; clientId: string; name: string; host?: boolean }
  | { type: 'peer-left'; clientId: string }
  | { type: 'media-state'; clientId: string; mic: boolean; cam: boolean }
  | { type: 'recording-started'; clientId: string; sessionId: string }
  | { type: 'recording-stopped'; clientId: string; sessionId: string }
  | { type: 'meeting-ended'; reason?: string }
  | { type: 'mute-request'; from: string }
  | { type: 'peer-removed'; reason?: string }
  | { type: 'knock-cancelled'; clientId: string }
  | { type: 'signal'; from: string; data: unknown }
  | { type: 'rejected'; reason?: string }
  | { type: 'error'; error: string };

export type OutgoingSignalingMessage =
  | { type: 'join'; room: string; name: string; mobile?: boolean }
  | { type: 'signal'; to: string; data: unknown }
  | { type: 'admit'; clientId: string }
  | { type: 'reject'; clientId: string; reason?: string }
  | { type: 'media-state'; mic: boolean; cam: boolean }
  | { type: 'recording-state'; state: 'started' | 'stopped' }
  | { type: 'meeting-ended-by-host' }
  | { type: 'mute-target'; clientId: string }
  | { type: 'remove-peer'; clientId: string };

@Injectable({ providedIn: 'root' })
export class WsService {
  private socket: WebSocket | null = null;

  readonly connected = signal(false);
  readonly disconnected = signal(false);

  connect(roomId: string, onMessage: (msg: SignalingMessage) => void, onOpen: () => void, onError: () => void): void {
    this.close();
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    this.socket = ws;
    this.connected.set(false);
    this.disconnected.set(false);

    ws.onopen = () => {
      if (this.socket !== ws) return;
      this.connected.set(true);
      onOpen();
    };
    ws.onmessage = (evt) => {
      if (this.socket !== ws) return;
      try {
        onMessage(JSON.parse(evt.data) as SignalingMessage);
      } catch {
        onError();
      }
    };
    ws.onerror = () => {
      if (this.socket === ws) onError();
    };
    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.connected.set(false);
      this.disconnected.set(true);
    };
  }

  send(msg: OutgoingSignalingMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  close(): void {
    const ws = this.socket;
    this.socket = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
    this.connected.set(false);
  }
}
