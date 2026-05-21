import crypto from 'node:crypto';
import type http from 'node:http';
import type Database from 'better-sqlite3';
import { WebSocket, WebSocketServer } from 'ws';
import { getDb } from '../../db.js';
import { parseCookies } from '../../lib/cookies.js';
import { getSessionUser } from '../auth/sessions.js';
import { getRoom, getRoomBySlugOrId, isOwnerOf } from '../rooms/store.js';
import { bumpPeak, closeSession, openSession } from '../sessions/store.js';

type PeerState = 'idle' | 'admitted' | 'pending' | 'waiting';

type PeerEntry = {
  ws: WebSocket;
  name: string;
  participantId: string;
  clientKey: string | null;
  userEmail: string | null;
  isMobile: boolean;
  supportsReconnect: boolean;
  reconnectToken: string | null;
  reconnectExpiresAt: number | null;
  setState: (state: PeerState) => void;
};

type ClosedWaiterEntry = PeerEntry & {
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
};

type LiveRoom = {
  admitted: Map<string, PeerEntry>;
  pending: Map<string, PeerEntry>;
  closedWaiters: Map<string, ClosedWaiterEntry>;
  reconnectTickets: Map<string, ReconnectTicket>;
  reconnecting: Map<string, ReconnectingPeer>;
  clientIdentities: Map<string, ClientIdentity>;
  currentSessionId: string | null;
};

type ClientIdentity = {
  participantId: string;
  name: string;
  wasAdmitted: boolean;
  revoked: boolean;
};

export type DiagnosticPoster = {
  sessionId: string;
  clientId?: string | null;
  participantId?: string | null;
  clientKey?: string | null;
  userEmail?: string | null;
};

type ReconnectTicket = {
  clientId: string;
  participantId: string;
  clientKey: string | null;
  name: string;
  userEmail: string | null;
  isMobile: boolean;
  sessionId: string | null;
  expiresAt: number;
};

type ReconnectingPeer = {
  name: string;
  participantId: string;
  clientKey: string | null;
  userEmail: string | null;
  isMobile: boolean;
  supportsReconnect: boolean;
  reconnectToken: string | null;
  reconnectExpiresAt: number | null;
  sessionId: string | null;
  isHost: boolean;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout> | null;
};

type IncomingMessage = {
  type?: string;
  room?: unknown;
  name?: unknown;
  state?: unknown;
  mic?: unknown;
  cam?: unknown;
  screenOn?: unknown;
  text?: unknown;
  clientMessageId?: unknown;
  to?: string;
  data?: unknown;
  clientId?: unknown;
  reason?: unknown;
  mobile?: unknown;
  supportsReconnect?: unknown;
  reconnectToken?: unknown;
  clientKey?: unknown;
};

const MAX_ADMITTED = 5;
const MAX_MOBILE_ADMITTED = 4;
const MAX_CHAT_MESSAGE_CHARS = 2000;
const RECONNECT_TOKEN_TTL_MS = 2 * 60 * 1000;
const DISCONNECT_GRACE_MS = RECONNECT_TOKEN_TTL_MS;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;
const DEFAULT_HEARTBEAT_MISSES_BEFORE_TERMINATE = 2;

type HeartbeatOptions = {
  intervalMs?: number;
  missesBeforeTerminate?: number;
};

type SignalingOptions = {
  heartbeat?: HeartbeatOptions | false;
};

type HeartbeatState = {
  isAlive: boolean;
  missedPongs: number;
  lastPongAt: number;
};

const liveRooms = new Map<string, LiveRoom>();

function getOrCreateLiveRoom(roomId: string): LiveRoom {
  let live = liveRooms.get(roomId);
  if (!live) {
    live = {
      admitted: new Map(),
      pending: new Map(),
      closedWaiters: new Map(),
      reconnectTickets: new Map(),
      reconnecting: new Map(),
      clientIdentities: new Map(),
      currentSessionId: null,
    };
    liveRooms.set(roomId, live);
  }
  return live;
}

function send(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastToOwners(live: LiveRoom, roomId: string, msg: Record<string, unknown>, database: Database.Database): void {
  for (const [, peer] of live.admitted) {
    if (isOwnerOf(roomId, peer.userEmail, database)) send(peer.ws, msg);
  }
}

function pendingSummaries(live: LiveRoom): { id: string; name: string }[] {
  return [...live.pending.entries()].map(([id, p]) => ({ id, name: p.name }));
}

function broadcastPendingListToOwners(live: LiveRoom, roomId: string, database: Database.Database): void {
  broadcastToOwners(live, roomId, { type: 'pending-list', knockers: pendingSummaries(live) }, database);
}

function pruneReconnectTickets(live: LiveRoom, now = Date.now()): void {
  for (const [token, ticket] of live.reconnectTickets) {
    if (ticket.expiresAt <= now) live.reconnectTickets.delete(token);
  }
}

function issueReconnectToken(live: LiveRoom, clientId: string, entry: PeerEntry, supportsReconnect: boolean): void {
  if (!supportsReconnect) return;
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + RECONNECT_TOKEN_TTL_MS;
  entry.reconnectToken = token;
  entry.reconnectExpiresAt = expiresAt;
  live.reconnectTickets.set(token, {
    clientId,
    participantId: entry.participantId,
    clientKey: entry.clientKey,
    name: entry.name,
    userEmail: entry.userEmail,
    isMobile: entry.isMobile,
    sessionId: live.currentSessionId,
    expiresAt,
  });
  send(entry.ws, { type: 'reconnect-token', token, expiresAt });
}

function stashReconnectTicket(live: LiveRoom, clientId: string, entry: PeerEntry): void {
  if (!entry.reconnectToken || !entry.reconnectExpiresAt || entry.reconnectExpiresAt <= Date.now()) return;
  live.reconnectTickets.set(entry.reconnectToken, {
    clientId,
    participantId: entry.participantId,
    clientKey: entry.clientKey,
    name: entry.name,
    userEmail: entry.userEmail,
    isMobile: entry.isMobile,
    sessionId: live.currentSessionId,
    expiresAt: entry.reconnectExpiresAt,
  });
}

function cleanupReconnectState(live: LiveRoom, clientId: string): void {
  const reconnecting = live.reconnecting.get(clientId);
  if (reconnecting?.timer) clearTimeout(reconnecting.timer);
  live.reconnecting.delete(clientId);
  for (const [token, ticket] of live.reconnectTickets) {
    if (ticket.clientId === clientId) live.reconnectTickets.delete(token);
  }
}

function closeSupersededAdmittedPeer(live: LiveRoom, clientId: string): void {
  const entry = live.admitted.get(clientId);
  if (!entry) return;
  live.admitted.delete(clientId);
  entry.setState('idle');
  try {
    entry.ws.close();
  } catch {
    // Best effort close for a superseded reconnect race socket.
  }
}

function rejectForRoomFull(roomId: string, clientId: string, pending: PeerEntry, live: LiveRoom, database: Database.Database): void {
  live.pending.delete(clientId);
  pending.setState('idle');
  send(pending.ws, { type: 'error', error: `room full (max ${MAX_ADMITTED})` });
  try {
    pending.ws.close();
  } catch {
    // Best effort close mirrors the legacy reject path.
  }
  broadcastToOwners(live, roomId, { type: 'knock-cancelled', clientId }, database);
  broadcastPendingListToOwners(live, roomId, database);
}

function ensureLiveSession(roomId: string, hostEmail: string, live: LiveRoom, database: Database.Database): void {
  const session = openSession(roomId, hostEmail, database);
  live.currentSessionId = session.id;
}

function bumpAdmittedPeak(live: LiveRoom, database: Database.Database): void {
  bumpPeak(live.currentSessionId, live.admitted.size, database);
}

function maybeCloseEmptyRoom(roomId: string, live: LiveRoom, reason: 'host-disconnect-empty' | 'last-peer-left', database: Database.Database): void {
  if (live.admitted.size > 0 || live.pending.size > 0 || live.closedWaiters.size > 0 || live.reconnecting.size > 0) return;
  try {
    closeSession(live.currentSessionId, reason, database);
  } catch (err) {
    console.warn(`[room ${roomId}] failed to close meeting session`, err);
  }
  live.currentSessionId = null;
  liveRooms.delete(roomId);
}

function logRejectedHostCommand(command: string, userEmail: string | null, roomId: string | null): void {
  console.info('[host-cmd-rejected]', command, userEmail, roomId);
}

function isMobileUserAgent(userAgent: string | string[] | undefined): boolean {
  const value = Array.isArray(userAgent) ? userAgent.join(' ') : userAgent || '';
  return /(iPhone|iPad|iPod|Android)/i.test(value);
}

function sanitizeClientKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clientKey = value.trim();
  if (!clientKey || clientKey.length > 128) return null;
  return clientKey;
}

function rememberClientIdentity(live: LiveRoom, clientKey: string | null, participantId: string, name: string, wasAdmitted: boolean): void {
  if (!clientKey) return;
  const current = live.clientIdentities.get(clientKey);
  live.clientIdentities.set(clientKey, {
    participantId,
    name,
    wasAdmitted: wasAdmitted || (current?.wasAdmitted === true && current.revoked !== true),
    revoked: wasAdmitted ? false : current?.revoked === true,
  });
}

function revokeClientIdentity(live: LiveRoom, entry: PeerEntry): void {
  if (!entry.clientKey) return;
  live.clientIdentities.set(entry.clientKey, {
    participantId: entry.participantId,
    name: entry.name,
    wasAdmitted: false,
    revoked: true,
  });
}

function mobileAdmittedCount(live: LiveRoom): number {
  return [...live.admitted.values()].filter((peer) => peer.isMobile).length + [...live.reconnecting.values()].filter((peer) => peer.isMobile).length;
}

function findAdmittedClientByParticipant(live: LiveRoom, participantId: string): [string, PeerEntry] | null {
  for (const [id, peer] of live.admitted) {
    if (peer.participantId === participantId) return [id, peer];
  }
  return null;
}

function findReconnectingClientByParticipant(live: LiveRoom, participantId: string): [string, ReconnectingPeer] | null {
  for (const [id, peer] of live.reconnecting) {
    if (peer.participantId === participantId) return [id, peer];
  }
  return null;
}

function findAdmittedClientByClientKey(live: LiveRoom, clientKey: string): [string, PeerEntry] | null {
  for (const [id, peer] of live.admitted) {
    if (peer.clientKey === clientKey) return [id, peer];
  }
  return null;
}

function findReconnectingClientByClientKey(live: LiveRoom, clientKey: string): [string, ReconnectingPeer] | null {
  for (const [id, peer] of live.reconnecting) {
    if (peer.clientKey === clientKey) return [id, peer];
  }
  return null;
}

function findOwnerResumeCandidate(live: LiveRoom, ownerEmail: string): [string, PeerEntry | ReconnectingPeer] | null {
  for (const [id, peer] of live.admitted) {
    if (peer.userEmail === ownerEmail) return [id, peer];
  }
  for (const [id, peer] of live.reconnecting) {
    if (peer.userEmail === ownerEmail && peer.isHost) return [id, peer];
  }
  return null;
}

function getLiveAdmittedRoom(currentRoom: string | null, state: PeerState): LiveRoom | null {
  if (state !== 'admitted' || !currentRoom) return null;
  return liveRooms.get(currentRoom) || null;
}

function isHostCommandAllowed(command: string, roomId: string | null, userEmail: string | null, database: Database.Database): boolean {
  const allowed = isOwnerOf(roomId, userEmail, database);
  if (!allowed) logRejectedHostCommand(command, userEmail, roomId);
  return allowed;
}

function peerSummaries(live: LiveRoom, roomId: string, database: Database.Database): { id: string; participantId: string; name: string; host: boolean }[] {
  return [...live.admitted.entries()].map(([id, p]) => ({
    id,
    participantId: p.participantId,
    name: p.name,
    host: isOwnerOf(roomId, p.userEmail, database),
  }));
}

function peerMatchesDiagnosticPoster(
  clientId: string,
  peer: Pick<PeerEntry | ReconnectingPeer, 'clientKey' | 'participantId' | 'userEmail'>,
  poster: DiagnosticPoster,
): boolean {
  if (!poster.clientKey || !poster.participantId) return false;
  if (peer.clientKey !== poster.clientKey || peer.participantId !== poster.participantId) return false;
  if (poster.clientId && poster.clientId !== clientId) return false;
  if (poster.userEmail !== undefined && poster.userEmail !== peer.userEmail) return false;
  return true;
}

export function isAdmittedDiagnosticPoster(poster: DiagnosticPoster): boolean {
  if (!poster.sessionId || !poster.clientKey || !poster.participantId) return false;
  for (const live of liveRooms.values()) {
    if (live.currentSessionId !== poster.sessionId) continue;
    for (const [clientId, peer] of live.admitted) {
      if (peerMatchesDiagnosticPoster(clientId, peer, poster)) return true;
    }
    for (const [clientId, peer] of live.reconnecting) {
      if (peerMatchesDiagnosticPoster(clientId, peer, poster)) return true;
    }
    const identity = live.clientIdentities.get(poster.clientKey);
    if (
      identity?.wasAdmitted === true &&
      identity.revoked !== true &&
      identity.participantId === poster.participantId &&
      !poster.clientId
    ) {
      return true;
    }
  }
  return false;
}

function expireReconnectingPeer(roomId: string, clientId: string, database: Database.Database): void {
  const live = liveRooms.get(roomId);
  if (!live) return;
  const reconnecting = live.reconnecting.get(clientId);
  if (!reconnecting) return;
  cleanupReconnectState(live, clientId);
  for (const [, peer] of live.admitted) {
    send(peer.ws, { type: 'peer-left', clientId, participantId: reconnecting.participantId });
  }
  console.log(`[room ${roomId}] EXPIRED ${reconnecting.name} (${clientId})  admitted=${live.admitted.size}`);
  maybeCloseEmptyRoom(roomId, live, reconnecting.isHost ? 'host-disconnect-empty' : 'last-peer-left', database);
}

function startReconnectGrace(roomId: string, clientId: string, entry: PeerEntry, isHost: boolean, live: LiveRoom, database: Database.Database): void {
  cleanupReconnectState(live, clientId);
  const expiresAt = Date.now() + DISCONNECT_GRACE_MS;
  const timer = setTimeout(() => expireReconnectingPeer(roomId, clientId, database), DISCONNECT_GRACE_MS);
  timer.unref?.();
  live.reconnecting.set(clientId, {
    name: entry.name,
    clientKey: entry.clientKey,
    userEmail: entry.userEmail,
    isMobile: entry.isMobile,
    supportsReconnect: entry.supportsReconnect,
    reconnectToken: entry.reconnectToken,
    reconnectExpiresAt: entry.reconnectExpiresAt,
    participantId: entry.participantId,
    sessionId: live.currentSessionId,
    isHost,
    expiresAt,
    timer,
  });
  stashReconnectTicket(live, clientId, entry);
  for (const [, peer] of live.admitted) {
    send(peer.ws, { type: 'peer-reconnecting', clientId, participantId: entry.participantId, name: entry.name, host: isHost });
  }
}

function removeAdmittedPeer(roomId: string, clientId: string, live: LiveRoom, database: Database.Database): void {
  cleanupReconnectState(live, clientId);
  const entry = live.admitted.get(clientId);
  if (!entry) return;
  const isHost = isOwnerOf(roomId, entry.userEmail, database);
  live.admitted.delete(clientId);
  entry.setState('idle');
  for (const [, peer] of live.admitted) {
    send(peer.ws, { type: 'peer-left', clientId, participantId: entry.participantId });
  }
  console.log(`[room ${roomId}] - ${entry.name} (${clientId})  admitted=${live.admitted.size}`);
  maybeCloseEmptyRoom(roomId, live, isHost ? 'host-disconnect-empty' : 'last-peer-left', database);
}

function removeClosedWaiter(roomId: string, clientId: string, live: LiveRoom, database: Database.Database): void {
  const waiter = live.closedWaiters.get(clientId);
  if (!waiter) return;
  clearTimeout(waiter.timer);
  live.closedWaiters.delete(clientId);
  waiter.setState('idle');
  maybeCloseEmptyRoom(roomId, live, 'last-peer-left', database);
}

function startClosedRoomWait(roomId: string, roomTitle: string, clientId: string, entry: PeerEntry, waitTimeoutMinutes: number, live: LiveRoom, database: Database.Database): void {
  const waitTimeoutMs = Math.max(1, Math.round(waitTimeoutMinutes * 60_000));
  const expiresAt = Date.now() + waitTimeoutMs;
  const timer = setTimeout(() => {
    const currentLive = liveRooms.get(roomId);
    if (!currentLive) return;
    const waiter = currentLive.closedWaiters.get(clientId);
    if (!waiter) return;
    currentLive.closedWaiters.delete(clientId);
    waiter.setState('idle');
    send(waiter.ws, {
      type: 'waiting-timeout',
      message: "This room wasn't opened by the host in time. Please try again later.",
    });
    try {
      waiter.ws.close();
    } catch {
      // Best effort close after timeout message.
    }
    maybeCloseEmptyRoom(roomId, currentLive, 'last-peer-left', database);
  }, waitTimeoutMs);
  timer.unref?.();
  live.closedWaiters.set(clientId, { ...entry, expiresAt, timer });
  entry.setState('waiting');
  send(entry.ws, {
    type: 'waiting-room',
    clientId,
    roomTitle,
    isOpen: false,
    waitTimeoutMs,
    expiresAt,
  });
}

function promoteClosedWaiters(roomId: string, waitTimeoutMinutes: number, database: Database.Database): void {
  const live = liveRooms.get(roomId);
  const room = getRoom(roomId, database);
  if (!live || !room || live.closedWaiters.size === 0) return;
  ensureLiveSession(roomId, room.ownerEmail, live, database);
  const waiters = [...live.closedWaiters.entries()];
  for (const [clientId, waiter] of waiters) {
    clearTimeout(waiter.timer);
    live.closedWaiters.delete(clientId);
    waiter.setState('pending');
    live.pending.set(clientId, waiter);
    send(waiter.ws, {
      type: 'waiting-room',
      clientId,
      roomTitle: room.title,
      isOpen: true,
      waitTimeoutMs: null,
      expiresAt: null,
    });
    send(waiter.ws, { type: 'knocking', clientId, roomTitle: room.title });
    broadcastToOwners(live, roomId, { type: 'knock', clientId, name: waiter.name }, database);
  }
  broadcastPendingListToOwners(live, roomId, database);
  console.log(`[room ${roomId}] OPENED promoted ${waiters.length} waiter(s) timeout=${waitTimeoutMinutes}`);
}

function admitPeer(roomId: string, clientId: string, database: Database.Database): void {
  const live = liveRooms.get(roomId);
  const room = getRoom(roomId, database);
  if (!live || !room) return;
  const pending = live.pending.get(clientId);
  if (!pending) return;
  if (live.admitted.size >= MAX_ADMITTED) {
    rejectForRoomFull(roomId, clientId, pending, live, database);
    return;
  }
  live.pending.delete(clientId);
  pending.setState('admitted');
  rememberClientIdentity(live, pending.clientKey, pending.participantId, pending.name, true);

  const peers = peerSummaries(live, roomId, database);
  const hostClientId = getHostClientId(roomId, database);
  send(pending.ws, {
    type: 'admitted',
    clientId,
    participantId: pending.participantId,
    peers,
    roomTitle: room.title,
    isOwner: isOwnerOf(roomId, pending.userEmail, database),
    hostClientId,
    sessionId: live.currentSessionId,
  });
  issueReconnectToken(live, clientId, pending, pending.supportsReconnect);
  for (const [, peer] of live.admitted) {
    send(peer.ws, { type: 'peer-joined', clientId, participantId: pending.participantId, name: pending.name });
  }
  live.admitted.set(clientId, pending);
  bumpAdmittedPeak(live, database);
  broadcastToOwners(live, roomId, { type: 'knock-cancelled', clientId }, database);
  broadcastPendingListToOwners(live, roomId, database);
  console.log(`[room ${roomId}] ADMITTED ${pending.name} (${clientId})  admitted=${live.admitted.size} pending=${live.pending.size}`);
}

function rejectPeer(roomId: string, clientId: string, database: Database.Database, reason = 'rejected by host'): void {
  const live = liveRooms.get(roomId);
  if (!live) return;
  const pending = live.pending.get(clientId);
  if (!pending) return;
  live.pending.delete(clientId);
  pending.setState('idle');
  send(pending.ws, { type: 'rejected', reason });
  try {
    pending.ws.close();
  } catch {
    // Best effort close mirrors the legacy implementation.
  }
  broadcastToOwners(live, roomId, { type: 'knock-cancelled', clientId }, database);
  broadcastPendingListToOwners(live, roomId, database);
  console.log(`[room ${roomId}] REJECTED ${pending.name} (${clientId})`);
}

export function attachSignaling(server: http.Server, database: Database.Database = getDb(), options: SignalingOptions = {}): void {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatStates = new WeakMap<WebSocket, HeartbeatState>();
  const heartbeatConfig = options.heartbeat === false ? null : options.heartbeat || {};
  const heartbeatIntervalMs = Math.max(10, heartbeatConfig?.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);
  const heartbeatMissesBeforeTerminate = Math.max(2, heartbeatConfig?.missesBeforeTerminate ?? DEFAULT_HEARTBEAT_MISSES_BEFORE_TERMINATE);
  const heartbeatTimer =
    heartbeatConfig === null
      ? null
      : setInterval(() => {
          const sentAt = Date.now();
          for (const ws of wss.clients) {
            if (ws.readyState !== WebSocket.OPEN) continue;
            const state = heartbeatStates.get(ws);
            if (!state) continue;
            if (!state.isAlive) {
              state.missedPongs += 1;
              if (state.missedPongs >= heartbeatMissesBeforeTerminate) {
                console.warn(`[signaling-heartbeat] terminating stale websocket missed=${state.missedPongs} lastPongAgoMs=${sentAt - state.lastPongAt}`);
                ws.terminate();
                continue;
              }
            } else {
              state.missedPongs = 0;
            }
            state.isAlive = false;
            send(ws, { type: 'heartbeat', sentAt });
            try {
              ws.ping();
            } catch {
              ws.terminate();
            }
          }
        }, heartbeatIntervalMs);
  heartbeatTimer?.unref?.();

  const clearHeartbeatTimer = (): void => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  };
  wss.on('close', clearHeartbeatTimer);
  server.on('close', clearHeartbeatTimer);

  wss.on('connection', (ws, req) => {
    heartbeatStates.set(ws, { isAlive: true, missedPongs: 0, lastPongAt: Date.now() });
    ws.on('pong', () => {
      const state = heartbeatStates.get(ws);
      if (!state) return;
      state.isAlive = true;
      state.missedPongs = 0;
      state.lastPongAt = Date.now();
    });

    const cookies = parseCookies(req.headers.cookie);
    const sessionUser = getSessionUser(cookies.session, database);
    const userEmail = sessionUser?.email || null;

    const clientId = crypto.randomBytes(8).toString('hex');
    let currentRoom: string | null = null;
    let myName = 'Anon';
    let state: PeerState = 'idle';
    let currentRoomOwner = false;

    ws.on('message', (raw) => {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(String(raw)) as IncomingMessage;
      } catch {
        return;
      }

      if (msg.type === 'join') {
        const roomKey = String(msg.room || '').slice(0, 128);
        const room = getRoomBySlugOrId(roomKey, database);
        if (!room) {
          send(ws, { type: 'error', error: 'room not found' });
          ws.close();
          return;
        }
        const roomId = room.id;
        const joinName = String(msg.name || 'Anon').slice(0, 64);
        const live = getOrCreateLiveRoom(roomId);
        pruneReconnectTickets(live);
        const declaredMobile = Boolean(msg.mobile);
        const supportsReconnect = Boolean(msg.supportsReconnect);
        const reconnectToken = typeof msg.reconnectToken === 'string' ? msg.reconnectToken : '';
        const clientKey = sanitizeClientKey(msg.clientKey);
        const hasMobileDeclaration = Object.prototype.hasOwnProperty.call(msg, 'mobile');
        const uaMobile = isMobileUserAgent(req.headers['user-agent']);
        if (hasMobileDeclaration && declaredMobile !== uaMobile) {
          console.info('[mobile-cap-audit]', {
            roomId,
            clientId,
            declaredMobile,
            uaMobile,
            userAgent: req.headers['user-agent'] || '',
          });
        }
        currentRoom = roomId;
        myName = joinName;
        ensureLiveSession(roomId, room.ownerEmail, live, database);
        const owner = isOwnerOf(roomId, userEmail, database);
        currentRoomOwner = owner;
        const now = Date.now();
        const reconnectTicket = reconnectToken ? live.reconnectTickets.get(reconnectToken) : null;
        const tokenAdmitted = reconnectTicket ? live.admitted.get(reconnectTicket.clientId) : null;
        const tokenGrace = reconnectTicket ? live.reconnecting.get(reconnectTicket.clientId) : null;
        const tokenParticipantAdmitted = reconnectTicket ? findAdmittedClientByParticipant(live, reconnectTicket.participantId) : null;
        const tokenParticipantGrace = reconnectTicket ? findReconnectingClientByParticipant(live, reconnectTicket.participantId) : null;
        const tokenResumeSource = tokenAdmitted ?? tokenGrace ?? tokenParticipantAdmitted?.[1] ?? tokenParticipantGrace?.[1] ?? null;
        const canResumeByToken =
          !!reconnectTicket &&
          !!tokenResumeSource &&
          reconnectTicket.expiresAt > now &&
          reconnectTicket.sessionId === live.currentSessionId &&
          reconnectTicket.userEmail === userEmail &&
          tokenResumeSource.userEmail === userEmail;
        const durableIdentity = clientKey ? live.clientIdentities.get(clientKey) ?? null : null;
        const durableAdmittedIdentity = durableIdentity?.wasAdmitted === true && durableIdentity.revoked !== true ? durableIdentity : null;
        const clientKeyAdmitted = clientKey ? findAdmittedClientByClientKey(live, clientKey) : null;
        const clientKeyGrace = clientKey ? findReconnectingClientByClientKey(live, clientKey) : null;
        const clientKeyResumeSource = clientKeyAdmitted?.[1] ?? clientKeyGrace?.[1] ?? null;
        const canResumeByClientKey = !!clientKeyResumeSource && clientKeyResumeSource.userEmail === userEmail;
        const canAutoAdmitByIdentity = !!durableAdmittedIdentity && !canResumeByToken && !canResumeByClientKey;
        const canResume = canResumeByToken || canResumeByClientKey || canAutoAdmitByIdentity;
        const ownerCandidate = owner ? findOwnerResumeCandidate(live, room.ownerEmail) : null;
        const ownerResume = !!ownerCandidate;
        const tokenOldClientId =
          canResumeByToken && reconnectTicket
            ? tokenAdmitted
              ? reconnectTicket.clientId
              : tokenGrace
                ? reconnectTicket.clientId
                : tokenParticipantAdmitted?.[0] ?? tokenParticipantGrace?.[0] ?? reconnectTicket.clientId
            : null;
        const clientKeyOldClientId = canResumeByClientKey ? clientKeyAdmitted?.[0] ?? clientKeyGrace?.[0] ?? null : null;
        const resumeOldClientId = ownerCandidate?.[0] ?? tokenOldClientId ?? clientKeyOldClientId;
        const resumeSource = ownerCandidate?.[1] ?? (canResumeByToken ? tokenResumeSource : null) ?? clientKeyResumeSource;
        const participantId =
          ownerCandidate?.[1].participantId ?? resumeSource?.participantId ?? durableAdmittedIdentity?.participantId ?? reconnectTicket?.participantId ?? crypto.randomUUID();
        if (canResumeByToken && reconnectTicket) {
          live.reconnectTickets.delete(reconnectToken);
          myName = reconnectTicket.name;
        } else if (canResumeByClientKey && clientKeyResumeSource) {
          myName = clientKeyResumeSource.name;
        } else if (owner && resumeSource) {
          myName = resumeSource.name;
        } else if (canAutoAdmitByIdentity && durableAdmittedIdentity) {
          myName = durableAdmittedIdentity.name;
        }
        rememberClientIdentity(live, clientKey, participantId, myName, false);
        const entry = {
          ws,
          name: myName,
          participantId,
          clientKey,
          userEmail,
          isMobile: resumeSource ? resumeSource.isMobile : declaredMobile,
          supportsReconnect,
          reconnectToken: null,
          reconnectExpiresAt: null,
          setState: (nextState: PeerState) => {
            state = nextState;
          },
        };

        if (!ownerResume && !canResume && !owner && !room.isOpen) {
          startClosedRoomWait(roomId, room.title, clientId, entry, room.waitTimeoutMinutes, live, database);
          console.log(`[room ${roomId}] WAIT ${myName} (${clientId}) timeout=${room.waitTimeoutMinutes}`);
          return;
        }
        if (!ownerResume && !canResume && live.admitted.size + live.reconnecting.size >= MAX_ADMITTED) {
          send(ws, { type: 'error', error: `room full (max ${MAX_ADMITTED})` });
          ws.close();
          return;
        }
        if (!ownerResume && !canResume && declaredMobile && mobileAdmittedCount(live) >= MAX_MOBILE_ADMITTED) {
          send(ws, { type: 'error', error: `mobile room full (${MAX_MOBILE_ADMITTED} max)` });
          ws.close();
          return;
        }

        if (owner || canResume) {
          if (resumeOldClientId) {
            cleanupReconnectState(live, resumeOldClientId);
            if (live.admitted.has(resumeOldClientId)) closeSupersededAdmittedPeer(live, resumeOldClientId);
          }
          rememberClientIdentity(live, clientKey, participantId, myName, true);
          live.admitted.set(clientId, entry);
          bumpAdmittedPeak(live, database);
          state = 'admitted';
          const peers = peerSummaries(live, roomId, database).filter((peer) => peer.id !== clientId);
          const hostClientId = getHostClientId(roomId, database) || (owner ? clientId : null);
          send(ws, { type: 'admitted', clientId, participantId, peers, roomTitle: room.title, isOwner: owner, hostClientId, sessionId: live.currentSessionId });
          issueReconnectToken(live, clientId, entry, supportsReconnect);
          for (const [id, peer] of live.admitted) {
            if (id !== clientId) {
              send(
                peer.ws,
                resumeOldClientId
                  ? { type: 'peer-resumed', oldClientId: resumeOldClientId, clientId, participantId, name: myName, host: owner }
                  : owner && supportsReconnect
                    ? { type: 'peer-joined', clientId, participantId, name: myName, host: true }
                    : { type: 'peer-joined', clientId, participantId, name: myName },
              );
            }
          }
          if (owner && live.pending.size > 0) {
            send(ws, { type: 'pending-list', knockers: pendingSummaries(live) });
          }
          console.log(`[room ${roomId}] + ${owner ? 'OWNER' : 'RESUME'} ${myName} (${clientId})  admitted=${live.admitted.size}`);
        } else {
          live.pending.set(clientId, entry);
          state = 'pending';
          send(ws, { type: 'knocking', clientId, roomTitle: room.title });
          broadcastToOwners(live, roomId, { type: 'knock', clientId, name: myName }, database);
          broadcastPendingListToOwners(live, roomId, database);
          console.log(`[room ${roomId}] KNOCK ${myName} (${clientId})  pending=${live.pending.size}`);
        }
        return;
      }

      if (msg.type === 'signal') {
        if (state !== 'admitted') return;
        const live = currentRoom ? liveRooms.get(currentRoom) : null;
        if (!live) return;
        const target = live.admitted.get(String(msg.to || ''));
        if (!target) return;
        send(target.ws, { type: 'signal', from: clientId, data: msg.data });
        return;
      }

      if (msg.type === 'media-state') {
        if (state !== 'admitted') return;
        const live = currentRoom ? liveRooms.get(currentRoom) : null;
        if (!live) return;
        const mic = Boolean(msg.mic);
        const cam = Boolean(msg.cam);
        const screenOn = Boolean(msg.screenOn);
        for (const [id, peer] of live.admitted) {
          if (id !== clientId) send(peer.ws, { type: 'media-state', clientId, mic, cam, screenOn });
        }
        return;
      }

      if (msg.type === 'chat') {
        if (state !== 'admitted') return;
        const live = currentRoom ? liveRooms.get(currentRoom) : null;
        if (!live) return;
        const text = (typeof msg.text === 'string' ? msg.text : '').trim().slice(0, MAX_CHAT_MESSAGE_CHARS);
        if (!text) return;
        const chat = {
          type: 'chat',
          id: crypto.randomBytes(12).toString('hex'),
          clientId,
          sender: myName,
          text,
          sentAt: Date.now(),
        };
        for (const [id, peer] of live.admitted) {
          if (id !== clientId) send(peer.ws, chat);
        }
        return;
      }

      if (msg.type === 'admit' || msg.type === 'reject') {
        if (state !== 'admitted') return;
        if (!currentRoom) return;
        if (!isOwnerOf(currentRoom, userEmail, database)) return;
        const targetId = String(msg.clientId || '');
        if (msg.type === 'admit') admitPeer(currentRoom, targetId, database);
        else rejectPeer(currentRoom, targetId, database, msg.reason == null ? undefined : String(msg.reason));
        return;
      }

      if (msg.type === 'recording-state') {
        const live = getLiveAdmittedRoom(currentRoom, state);
        if (!live || !currentRoom) return;
        if (!isHostCommandAllowed('recording-state', currentRoom, userEmail, database)) return;
        const recordingState = String(msg.state || '');
        if (recordingState !== 'started' && recordingState !== 'stopped') return;
        const wireType = recordingState === 'started' ? 'recording-started' : 'recording-stopped';
        const hostClientId = getHostClientId(currentRoom, database) || clientId;
        for (const [, peer] of live.admitted) {
          send(peer.ws, { type: wireType, clientId: hostClientId, sessionId: live.currentSessionId });
        }
        return;
      }

      if (msg.type === 'meeting-ended-by-host') {
        const live = getLiveAdmittedRoom(currentRoom, state);
        if (!live || !currentRoom) return;
        if (!isHostCommandAllowed('meeting-ended-by-host', currentRoom, userEmail, database)) return;
        closeSession(live.currentSessionId, 'host-end', database);
        const admitted = [...live.admitted.values()];
        const pending = [...live.pending.values()];
        live.currentSessionId = null;
        liveRooms.delete(currentRoom);
        for (const peer of admitted) {
          peer.setState('idle');
          send(peer.ws, { type: 'meeting-ended', reason: 'host-end' });
        }
        for (const knocker of pending) {
          knocker.setState('idle');
          send(knocker.ws, { type: 'rejected', reason: 'meeting ended by host' });
        }
        for (const peer of admitted) {
          try {
            peer.ws.close();
          } catch {
            // Best effort close after the meeting-ended broadcast.
          }
        }
        for (const knocker of pending) {
          try {
            knocker.ws.close();
          } catch {
            // Best effort close after the rejection message.
          }
        }
        return;
      }

      if (msg.type === 'mute-target') {
        const live = getLiveAdmittedRoom(currentRoom, state);
        if (!live || !currentRoom) return;
        if (!isHostCommandAllowed('mute-target', currentRoom, userEmail, database)) return;
        const targetId = String(msg.clientId || '');
        const target = live.admitted.get(targetId);
        if (!target) return;
        send(target.ws, { type: 'mute-request', from: clientId });
        return;
      }

      if (msg.type === 'remove-peer') {
        const live = getLiveAdmittedRoom(currentRoom, state);
        if (!live || !currentRoom) return;
        if (!isHostCommandAllowed('remove-peer', currentRoom, userEmail, database)) return;
        const targetId = String(msg.clientId || '');
        if (targetId === getHostClientId(currentRoom, database)) return;
        const target = live.admitted.get(targetId);
        if (!target) return;
        send(target.ws, { type: 'peer-removed', reason: 'removed by host' });
        removeAdmittedPeer(currentRoom, targetId, live, database);
        try {
          target.ws.close();
        } catch {
          // Best effort close after the removal message.
        }
        return;
      }

      if (msg.type === 'leave') {
        if (!currentRoom) return;
        const live = liveRooms.get(currentRoom);
        if (!live) return;
        if (state === 'admitted') {
          const leaving = live.admitted.get(clientId);
          if (leaving) revokeClientIdentity(live, leaving);
          removeAdmittedPeer(currentRoom, clientId, live, database);
        } else if (state === 'pending') {
          live.pending.delete(clientId);
          state = 'idle';
          broadcastToOwners(live, currentRoom, { type: 'knock-cancelled', clientId }, database);
          broadcastPendingListToOwners(live, currentRoom, database);
        } else if (state === 'waiting') {
          removeClosedWaiter(currentRoom, clientId, live, database);
        }
        try {
          ws.close();
        } catch {
          // Best effort close after explicit leave.
        }
      }
    });

    ws.on('close', () => {
      if (!currentRoom) return;
      const live = liveRooms.get(currentRoom);
      if (!live) return;
      const admittedBeforeClose = live.admitted.size;
      const pendingBeforeClose = live.pending.size;
      const closingPeerWasHost = currentRoomOwner;
      if (state === 'admitted') {
        const closingEntry = live.admitted.get(clientId);
        if (closingEntry) startReconnectGrace(currentRoom, clientId, closingEntry, closingPeerWasHost, live, database);
        live.admitted.delete(clientId);
        console.log(`[room ${currentRoom}] RECONNECTING ${myName} (${clientId})  admitted=${live.admitted.size}`);
      } else if (state === 'pending') {
        live.pending.delete(clientId);
        try {
          broadcastToOwners(live, currentRoom, { type: 'knock-cancelled', clientId }, database);
          broadcastPendingListToOwners(live, currentRoom, database);
        } catch (err) {
          console.warn(`[room ${currentRoom}] failed to broadcast knock cancellation`, err);
        }
        console.log(`[room ${currentRoom}] CANCEL ${myName} (${clientId})  pending=${live.pending.size}`);
      } else if (state === 'waiting') {
        removeClosedWaiter(currentRoom, clientId, live, database);
        console.log(`[room ${currentRoom}] WAIT-CANCEL ${myName} (${clientId})  waiting=${live.closedWaiters.size}`);
      }
      if (live.admitted.size === 0 && live.pending.size === 0 && live.closedWaiters.size === 0 && live.reconnecting.size === 0) {
        const reason =
          closingPeerWasHost && admittedBeforeClose <= 1 && pendingBeforeClose === 0
            ? 'host-disconnect-empty'
            : 'last-peer-left';
        maybeCloseEmptyRoom(currentRoom, live, reason, database);
      }
    });
  });

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
}

export function notifyRoomAccessChanged(roomId: string, isOpen: boolean, waitTimeoutMinutes: number, database: Database.Database = getDb()): void {
  if (!isOpen) return;
  promoteClosedWaiters(roomId, waitTimeoutMinutes, database);
}

export function getHostClientId(roomId: string, database: Database.Database = getDb()): string | null {
  const live = liveRooms.get(roomId);
  const room = getRoom(roomId, database);
  if (!live || !room) return null;
  for (const [clientId, entry] of live.admitted) {
    if (entry.userEmail === room.ownerEmail) return clientId;
  }
  return null;
}

export function hasLiveRoom(roomId: string): boolean {
  return liveRooms.has(roomId);
}
