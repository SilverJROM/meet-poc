import crypto from 'node:crypto';
import type http from 'node:http';
import type Database from 'better-sqlite3';
import { WebSocket, WebSocketServer } from 'ws';
import { getDb } from '../../db.js';
import { parseCookies } from '../../lib/cookies.js';
import { getSessionUser } from '../auth/sessions.js';
import { getRoom, isOwnerOf } from '../rooms/store.js';
import { bumpPeak, closeSession, openSession } from '../sessions/store.js';

type PeerState = 'idle' | 'admitted' | 'pending';

type PeerEntry = {
  ws: WebSocket;
  name: string;
  userEmail: string | null;
  isMobile: boolean;
  setState: (state: PeerState) => void;
};

type LiveRoom = {
  admitted: Map<string, PeerEntry>;
  pending: Map<string, PeerEntry>;
  currentSessionId: string | null;
};

type IncomingMessage = {
  type?: string;
  room?: unknown;
  name?: unknown;
  state?: unknown;
  mic?: unknown;
  cam?: unknown;
  to?: string;
  data?: unknown;
  clientId?: unknown;
  reason?: unknown;
  mobile?: unknown;
};

const MAX_ADMITTED = 8;
const MAX_MOBILE_ADMITTED = 4;

const liveRooms = new Map<string, LiveRoom>();

function getOrCreateLiveRoom(roomId: string): LiveRoom {
  let live = liveRooms.get(roomId);
  if (!live) {
    live = { admitted: new Map(), pending: new Map(), currentSessionId: null };
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

function rejectForRoomFull(roomId: string, clientId: string, pending: PeerEntry, live: LiveRoom, database: Database.Database): void {
  live.pending.delete(clientId);
  pending.setState('idle');
  send(pending.ws, { type: 'error', error: 'room full (max 8)' });
  try {
    pending.ws.close();
  } catch {
    // Best effort close mirrors the legacy reject path.
  }
  broadcastToOwners(live, roomId, { type: 'knock-cancelled', clientId }, database);
}

function ensureLiveSession(roomId: string, hostEmail: string, live: LiveRoom, database: Database.Database): void {
  const session = openSession(roomId, hostEmail, database);
  live.currentSessionId = session.id;
}

function bumpAdmittedPeak(live: LiveRoom, database: Database.Database): void {
  bumpPeak(live.currentSessionId, live.admitted.size, database);
}

function logRejectedHostCommand(command: string, userEmail: string | null, roomId: string | null): void {
  console.info('[host-cmd-rejected]', command, userEmail, roomId);
}

function isMobileUserAgent(userAgent: string | string[] | undefined): boolean {
  const value = Array.isArray(userAgent) ? userAgent.join(' ') : userAgent || '';
  return /(iPhone|iPad|iPod|Android)/i.test(value);
}

function mobileAdmittedCount(live: LiveRoom): number {
  return [...live.admitted.values()].filter((peer) => peer.isMobile).length;
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

function peerSummaries(live: LiveRoom, roomId: string, database: Database.Database): { id: string; name: string; host: boolean }[] {
  return [...live.admitted.entries()].map(([id, p]) => ({
    id,
    name: p.name,
    host: isOwnerOf(roomId, p.userEmail, database),
  }));
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

  const peers = peerSummaries(live, roomId, database);
  const hostClientId = getHostClientId(roomId, database);
  send(pending.ws, {
    type: 'admitted',
    clientId,
    peers,
    roomTitle: room.title,
    isOwner: isOwnerOf(roomId, pending.userEmail, database),
    hostClientId,
  });
  for (const [, peer] of live.admitted) {
    send(peer.ws, { type: 'peer-joined', clientId, name: pending.name });
  }
  live.admitted.set(clientId, pending);
  bumpAdmittedPeak(live, database);
  broadcastToOwners(live, roomId, { type: 'knock-cancelled', clientId }, database);
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
  console.log(`[room ${roomId}] REJECTED ${pending.name} (${clientId})`);
}

export function attachSignaling(server: http.Server, database: Database.Database = getDb()): void {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws, req) => {
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
        const roomId = String(msg.room || '').slice(0, 64);
        const room = getRoom(roomId, database);
        if (!room) {
          send(ws, { type: 'error', error: 'room not found' });
          ws.close();
          return;
        }
        const joinName = String(msg.name || 'Anon').slice(0, 64);
        const live = getOrCreateLiveRoom(roomId);
        const declaredMobile = Boolean(msg.mobile);
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
        if (declaredMobile && mobileAdmittedCount(live) >= MAX_MOBILE_ADMITTED) {
          send(ws, { type: 'error', error: 'mobile room full (4 max)' });
          ws.close();
          return;
        }
        if (live.admitted.size >= MAX_ADMITTED) {
          send(ws, { type: 'error', error: 'room full (max 8)' });
          ws.close();
          return;
        }
        currentRoom = roomId;
        myName = joinName;
        ensureLiveSession(roomId, room.ownerEmail, live, database);
        const owner = isOwnerOf(roomId, userEmail, database);
        currentRoomOwner = owner;
        const entry = { ws, name: myName, userEmail, isMobile: declaredMobile, setState: (nextState: PeerState) => { state = nextState; } };

        if (owner) {
          live.admitted.set(clientId, entry);
          bumpAdmittedPeak(live, database);
          state = 'admitted';
          const peers = peerSummaries(live, roomId, database).filter((peer) => peer.id !== clientId);
          send(ws, { type: 'admitted', clientId, peers, roomTitle: room.title, isOwner: true, hostClientId: clientId });
          for (const [id, peer] of live.admitted) {
            if (id !== clientId) send(peer.ws, { type: 'peer-joined', clientId, name: myName });
          }
          if (live.pending.size > 0) {
            const pendingList = [...live.pending.entries()].map(([id, p]) => ({ id, name: p.name }));
            send(ws, { type: 'pending-list', knockers: pendingList });
          }
          console.log(`[room ${roomId}] + OWNER ${myName} (${clientId})  admitted=${live.admitted.size}`);
        } else {
          live.pending.set(clientId, entry);
          state = 'pending';
          send(ws, { type: 'knocking', clientId, roomTitle: room.title });
          broadcastToOwners(live, roomId, { type: 'knock', clientId, name: myName }, database);
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
        for (const [id, peer] of live.admitted) {
          if (id !== clientId) send(peer.ws, { type: 'media-state', clientId, mic, cam });
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
        try {
          target.ws.close();
        } catch {
          // Best effort close after the removal message.
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
        live.admitted.delete(clientId);
        for (const [, peer] of live.admitted) {
          send(peer.ws, { type: 'peer-left', clientId });
        }
        console.log(`[room ${currentRoom}] - ${myName} (${clientId})  admitted=${live.admitted.size}`);
      } else if (state === 'pending') {
        live.pending.delete(clientId);
        try {
          broadcastToOwners(live, currentRoom, { type: 'knock-cancelled', clientId }, database);
        } catch (err) {
          console.warn(`[room ${currentRoom}] failed to broadcast knock cancellation`, err);
        }
        console.log(`[room ${currentRoom}] CANCEL ${myName} (${clientId})  pending=${live.pending.size}`);
      }
      if (live.admitted.size === 0 && live.pending.size === 0) {
        const reason =
          closingPeerWasHost && admittedBeforeClose <= 1 && pendingBeforeClose === 0
            ? 'host-disconnect-empty'
            : 'last-peer-left';
        try {
          closeSession(live.currentSessionId, reason, database);
        } catch (err) {
          console.warn(`[room ${currentRoom}] failed to close meeting session`, err);
        }
        live.currentSessionId = null;
        liveRooms.delete(currentRoom);
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
