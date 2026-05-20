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
  | { type: 'reconnect-token'; token: string; expiresAt: number }
  | { type: 'waiting-room'; clientId: string; roomTitle?: string; isOpen: boolean; waitTimeoutMs: number | null; expiresAt: number | null }
  | { type: 'waiting-timeout'; message: string }
  | { type: 'knocking'; clientId: string; roomTitle?: string }
  | { type: 'knock'; clientId: string; name: string }
  | { type: 'pending-list'; knockers: { id: string; name: string }[] }
  | { type: 'peer-joined'; clientId: string; name: string; host?: boolean }
  | { type: 'peer-reconnecting'; clientId: string; name: string; host?: boolean }
  | { type: 'peer-resumed'; oldClientId: string; clientId: string; name: string; host?: boolean }
  | { type: 'peer-left'; clientId: string }
  | { type: 'media-state'; clientId: string; mic: boolean; cam: boolean; screenOn?: boolean }
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
  | { type: 'join'; room: string; name: string; mobile?: boolean; supportsReconnect?: boolean; reconnectToken?: string }
  | { type: 'signal'; to: string; data: unknown }
  | { type: 'admit'; clientId: string }
  | { type: 'reject'; clientId: string; reason?: string }
  | { type: 'media-state'; mic: boolean; cam: boolean; screenOn: boolean }
  | { type: 'recording-state'; state: 'started' | 'stopped' }
  | { type: 'meeting-ended-by-host' }
  | { type: 'mute-target'; clientId: string }
  | { type: 'remove-peer'; clientId: string }
  | { type: 'leave' };

@Injectable({ providedIn: 'root' })
export class WsService {
  private socket: WebSocket | null = null;
  private roomId = '';
  private onMessage: ((msg: SignalingMessage) => void) | null = null;
  private onOpen: (() => void) | null = null;
  private onError: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionallyClosed = true;

  readonly connected = signal(false);
  readonly disconnected = signal(false);
  readonly reconnectAttempts = signal(0);
  readonly status = signal<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('idle');

  connect(roomId: string, onMessage: (msg: SignalingMessage) => void, onOpen: () => void, onError: () => void): void {
    this.closeCurrentSocket(false);
    this.clearReconnectTimer();
    this.roomId = roomId;
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onError = onError;
    this.reconnectAttempt = 0;
    this.intentionallyClosed = false;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    this.openSocket(`${proto}://${window.location.host}/ws`, false);
  }

  send(msg: OutgoingSignalingMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.intentionallyClosed = true;
    this.clearReconnectTimer();
    this.closeCurrentSocket(true);
    this.roomId = '';
    this.onMessage = null;
    this.onOpen = null;
    this.onError = null;
    this.reconnectAttempt = 0;
    this.connected.set(false);
    this.status.set('idle');
  }

  debugDropForReconnect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      this.socket.close(4000, 'debug reconnect');
      return;
    }
    if (!this.intentionallyClosed) this.scheduleReconnect();
  }

  private openSocket(url: string, reconnecting: boolean): void {
    const ws = new WebSocket(url);
    this.socket = ws;
    this.connected.set(false);
    this.status.set(reconnecting ? 'reconnecting' : 'connecting');
    if (!reconnecting) this.disconnected.set(false);
    console.info(`[signaling] ${reconnecting ? 'reconnecting' : 'connecting'} room=${this.roomId}`);

    ws.onopen = () => {
      if (this.socket !== ws) return;
      const wasReconnect = this.reconnectAttempt > 0 || reconnecting;
      this.connected.set(true);
      this.disconnected.set(false);
      this.status.set('connected');
      this.reconnectAttempt = 0;
      console.info(`[signaling] ${wasReconnect ? 'reconnected' : 'connected'} room=${this.roomId}`);
      this.onOpen?.();
    };
    ws.onmessage = (evt) => {
      if (this.socket !== ws) return;
      try {
        this.onMessage?.(JSON.parse(evt.data) as SignalingMessage);
      } catch {
        this.onError?.();
      }
    };
    ws.onerror = () => {
      if (this.socket === ws) this.onError?.();
    };
    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.socket = null;
      this.connected.set(false);
      this.disconnected.set(true);
      this.status.set('disconnected');
      console.warn(`[signaling] disconnected room=${this.roomId}`);
      if (!this.intentionallyClosed) this.scheduleReconnect();
    };
  }

  private closeCurrentSocket(explicitLeave: boolean): void {
    const ws = this.socket;
    this.socket = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close(explicitLeave ? 4001 : 1000, explicitLeave ? 'explicit leave' : undefined);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.onOpen || !this.onMessage) return;
    const attempt = this.reconnectAttempt + 1;
    const delay = Math.min(30_000, 500 * 2 ** Math.min(attempt - 1, 6));
    this.reconnectAttempt = attempt;
    this.reconnectAttempts.update((count) => count + 1);
    this.status.set('reconnecting');
    console.info(`[signaling] reconnect scheduled room=${this.roomId} attempt=${attempt} delayMs=${delay}`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.intentionallyClosed) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      this.openSocket(`${proto}://${window.location.host}/ws`, true);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}
