import { Injectable, signal } from '@angular/core';
import type { DiagnosticsWsCycle, DiagnosticsWsHealth } from './meeting-sessions.service';

export type SignalingMessage =
  | {
      type: 'admitted';
      clientId: string;
      participantId?: string;
      peers: { id: string; participantId?: string; name: string; host?: boolean }[];
      roomTitle?: string;
      isOwner: boolean;
      hostClientId?: string;
      sessionId?: string | null;
    }
  | { type: 'reconnect-token'; token: string; expiresAt: number }
  | { type: 'waiting-room'; clientId: string; roomTitle?: string; isOpen: boolean; waitTimeoutMs: number | null; expiresAt: number | null }
  | { type: 'waiting-timeout'; message: string }
  | { type: 'knocking'; clientId: string; roomTitle?: string }
  | { type: 'knock'; clientId: string; name: string }
  | { type: 'pending-list'; knockers: { id: string; name: string }[] }
  | { type: 'peer-joined'; clientId: string; participantId?: string; name: string; host?: boolean }
  | { type: 'peer-reconnecting'; clientId: string; participantId?: string; name: string; host?: boolean }
  | { type: 'peer-resumed'; oldClientId: string; clientId: string; participantId?: string; name: string; host?: boolean }
  | { type: 'peer-left'; clientId: string; participantId?: string }
  | { type: 'media-state'; clientId: string; mic: boolean; cam: boolean; screenOn?: boolean }
  | { type: 'chat'; id: string; clientId: string; sender: string; text: string; sentAt: number }
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
  | { type: 'join'; room: string; name: string; mobile?: boolean; supportsReconnect?: boolean; reconnectToken?: string; clientKey?: string }
  | { type: 'signal'; to: string; data: unknown }
  | { type: 'admit'; clientId: string }
  | { type: 'reject'; clientId: string; reason?: string }
  | { type: 'media-state'; mic: boolean; cam: boolean; screenOn: boolean }
  | { type: 'chat'; text: string; clientMessageId?: string }
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
  private disconnectCount = 0;
  private lastDisconnectAt: number | null = null;
  private lastReconnectAt: number | null = null;
  private readonly cycles: DiagnosticsWsCycle[] = [];

  readonly connected = signal(false);
  readonly disconnected = signal(false);
  readonly reconnectAttempts = signal(0);
  readonly status = signal<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('idle');

  connect(roomId: string, onMessage: (msg: SignalingMessage) => void, onOpen: () => void, onError: () => void): void {
    this.closeCurrentSocket();
    this.clearReconnectTimer();
    this.roomId = roomId;
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onError = onError;
    this.reconnectAttempt = 0;
    this.intentionallyClosed = false;
    this.disconnectCount = 0;
    this.lastDisconnectAt = null;
    this.lastReconnectAt = null;
    this.cycles.length = 0;
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
    this.closeCurrentSocket();
    this.roomId = '';
    this.onMessage = null;
    this.onOpen = null;
    this.onError = null;
    this.reconnectAttempt = 0;
    this.connected.set(false);
    this.status.set('idle');
  }

  diagnosticsSnapshot(): DiagnosticsWsHealth {
    return {
      status: this.status(),
      disconnectCount: this.disconnectCount,
      reconnectAttempts: this.reconnectAttempts(),
      lastDisconnectAt: this.lastDisconnectAt,
      lastReconnectAt: this.lastReconnectAt,
      cycles: this.cycles.slice(),
    };
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
      if (wasReconnect) {
        this.lastReconnectAt = Date.now();
        const latest = this.cycles[this.cycles.length - 1];
        if (latest && latest.reconnectedAt == null) {
          latest.reconnectedAt = this.lastReconnectAt;
          latest.reconnectedAtIso = new Date(this.lastReconnectAt).toISOString();
          latest.timeStuckMs = this.lastReconnectAt - latest.disconnectedAt;
        }
      }
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
    ws.onclose = (event) => {
      if (this.socket !== ws) return;
      this.socket = null;
      this.connected.set(false);
      this.disconnected.set(true);
      this.status.set('disconnected');
      if (!this.intentionallyClosed) this.recordDisconnect(event);
      console.warn(`[signaling] disconnected room=${this.roomId}`);
      if (!this.intentionallyClosed) this.scheduleReconnect();
    };
  }

  private closeCurrentSocket(): void {
    const ws = this.socket;
    this.socket = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.onOpen || !this.onMessage) return;
    const attempt = this.reconnectAttempt + 1;
    const delay = Math.min(30_000, 500 * 2 ** Math.min(attempt - 1, 6));
    this.reconnectAttempt = attempt;
    this.reconnectAttempts.update((count) => count + 1);
    this.status.set('reconnecting');
    const latest = this.cycles[this.cycles.length - 1];
    if (latest && latest.reconnectedAt == null) latest.recoveryMethod = `websocket-reconnect-attempt-${attempt}`;
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

  private recordDisconnect(event: CloseEvent): void {
    const now = Date.now();
    this.disconnectCount += 1;
    this.lastDisconnectAt = now;
    this.cycles.push({
      disconnectedAt: now,
      disconnectedAtIso: new Date(now).toISOString(),
      reconnectedAt: null,
      reconnectedAtIso: null,
      code: event.code || null,
      reason: event.reason || null,
      recoveryMethod: 'pending-reconnect',
      timeStuckMs: null,
    });
    trimToLast(this.cycles, 12);
  }
}

function trimToLast<T>(items: T[], max: number): void {
  if (items.length > max) items.splice(0, items.length - max);
}
