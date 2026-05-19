import crypto from 'node:crypto';
import type http from 'node:http';
import type Database from 'better-sqlite3';
import { WebSocket, WebSocketServer } from 'ws';
import { getDb } from '../../db.js';
import { parseCookies } from '../../lib/cookies.js';
import { getSessionUser } from '../auth/sessions.js';
import { getRoom, isOwnerOf } from '../rooms/store.js';

type PeerState = 'idle' | 'admitted' | 'pending';

type PeerEntry = {
  ws: WebSocket;
  name: string;
  userEmail: string | null;
  setState: (state: PeerState) => void;
};

type LiveRoom = {
  admitted: Map<string, PeerEntry>;
  pending: Map<string, PeerEntry>;
};

type IncomingMessage = {
  type?: string;
  room?: unknown;
  name?: unknown;
  to?: string;
  data?: unknown;
  clientId?: unknown;
  reason?: unknown;
};

const MAX_ADMITTED = 8;

const liveRooms = new Map<string, LiveRoom>();

function getOrCreateLiveRoom(roomId: string): LiveRoom {
  let live = liveRooms.get(roomId);
  if (!live) {
    live = { admitted: new Map(), pending: new Map() };
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
  send(pending.ws, { type: 'error', error: 'room full (max 8)' });
  try {
    pending.ws.close();
  } catch {
    // Best effort close mirrors the legacy reject path.
  }
  broadcastToOwners(live, roomId, { type: 'knock-cancelled', clientId }, database);
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

  const peers = [...live.admitted.entries()].map(([id, p]) => ({ id, name: p.name }));
  send(pending.ws, {
    type: 'admitted',
    clientId,
    peers,
    roomTitle: room.title,
    isOwner: isOwnerOf(roomId, pending.userEmail, database),
  });
  for (const [, peer] of live.admitted) {
    send(peer.ws, { type: 'peer-joined', clientId, name: pending.name });
  }
  live.admitted.set(clientId, pending);
  broadcastToOwners(live, roomId, { type: 'knock-cancelled', clientId }, database);
  console.log(`[room ${roomId}] ADMITTED ${pending.name} (${clientId})  admitted=${live.admitted.size} pending=${live.pending.size}`);
}

function rejectPeer(roomId: string, clientId: string, database: Database.Database, reason = 'rejected by host'): void {
  const live = liveRooms.get(roomId);
  if (!live) return;
  const pending = live.pending.get(clientId);
  if (!pending) return;
  live.pending.delete(clientId);
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
        currentRoom = roomId;
        myName = String(msg.name || 'Anon').slice(0, 64);
        const live = getOrCreateLiveRoom(roomId);
        if (live.admitted.size >= MAX_ADMITTED) {
          send(ws, { type: 'error', error: 'room full (max 8)' });
          ws.close();
          return;
        }
        const owner = isOwnerOf(roomId, userEmail, database);
        const entry = { ws, name: myName, userEmail, setState: (nextState: PeerState) => { state = nextState; } };

        if (owner) {
          live.admitted.set(clientId, entry);
          state = 'admitted';
          const peers = [...live.admitted.entries()]
            .filter(([id]) => id !== clientId)
            .map(([id, p]) => ({ id, name: p.name }));
          send(ws, { type: 'admitted', clientId, peers, roomTitle: room.title, isOwner: true });
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

      if (msg.type === 'admit' || msg.type === 'reject') {
        if (state !== 'admitted') return;
        if (!currentRoom) return;
        if (!isOwnerOf(currentRoom, userEmail, database)) return;
        const targetId = String(msg.clientId || '');
        if (msg.type === 'admit') admitPeer(currentRoom, targetId, database);
        else rejectPeer(currentRoom, targetId, database, msg.reason == null ? undefined : String(msg.reason));
      }
    });

    ws.on('close', () => {
      if (!currentRoom) return;
      const live = liveRooms.get(currentRoom);
      if (!live) return;
      if (state === 'admitted') {
        live.admitted.delete(clientId);
        for (const [, peer] of live.admitted) {
          send(peer.ws, { type: 'peer-left', clientId });
        }
        console.log(`[room ${currentRoom}] - ${myName} (${clientId})  admitted=${live.admitted.size}`);
      } else if (state === 'pending') {
        live.pending.delete(clientId);
        broadcastToOwners(live, currentRoom, { type: 'knock-cancelled', clientId }, database);
        console.log(`[room ${currentRoom}] CANCEL ${myName} (${clientId})  pending=${live.pending.size}`);
      }
      if (live.admitted.size === 0 && live.pending.size === 0) liveRooms.delete(currentRoom);
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
