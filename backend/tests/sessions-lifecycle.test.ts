import { WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { getHostClientId } from '../src/modules/signaling/index.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

type SessionRow = {
  id: string;
  room_id: string;
  host_email: string;
  started_at: number;
  ended_at: number | null;
  ended_reason: string | null;
  admitted_peak: number;
};

function sessionRows(db: Database.Database, roomId: string): SessionRow[] {
  return db
    .prepare('SELECT id, room_id, host_email, started_at, ended_at, ended_reason, admitted_peak FROM meeting_sessions WHERE room_id = ? ORDER BY started_at ASC')
    .all(roomId) as SessionRow[];
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('timed out waiting for condition');
}

function waitForClose(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => ws.once('close', () => resolve()));
}

async function closeAndWait(ws: WebSocket): Promise<void> {
  closeWs(ws);
  await waitForClose(ws);
}

async function joinOwner(url: string, cookie: string, roomId: string): Promise<{ ws: WebSocket; clientId: string }> {
  const ws = await connectWs(url, cookie);
  ws.send(JSON.stringify({ type: 'join', room: roomId, name: 'Owner' }));
  const admitted = await nextMessage(ws, (msg) => msg.type === 'admitted');
  return { ws, clientId: String(admitted.clientId) };
}

async function joinAndAdmitGuest(owner: WebSocket, url: string, roomId: string, name: string): Promise<{ ws: WebSocket; clientId: string }> {
  const ws = await connectWs(url);
  ws.send(JSON.stringify({ type: 'join', room: roomId, name }));
  const knocking = await nextMessage(ws, (msg) => msg.type === 'knocking');
  await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === knocking.clientId);
  owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
  const admitted = await nextMessage(ws, (msg) => msg.type === 'admitted');
  await nextMessage(owner, (msg) => msg.type === 'peer-joined' && msg.clientId === knocking.clientId);
  return { ws, clientId: String(admitted.clientId) };
}

describe('meeting session lifecycle', () => {
  it('S1.1 opens on first WS join and reuses the active room session', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const beforeJoin = Date.now();
    const owner = await connectWs(url, ownerCookie);

    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    await nextMessage(owner, (msg) => msg.type === 'admitted');
    const afterOwnerJoin = sessionRows(db, room.id);

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    await nextMessage(guest, (msg) => msg.type === 'knocking');
    const afterGuestJoin = sessionRows(db, room.id);

    expect(afterOwnerJoin).toHaveLength(1);
    expect(afterOwnerJoin[0]).toMatchObject({
      room_id: room.id,
      host_email: 'jrom@silverjrom.app',
      ended_at: null,
      admitted_peak: 1,
    });
    expect(afterOwnerJoin[0].started_at).toBeGreaterThanOrEqual(beforeJoin - 1000);
    expect(afterGuestJoin).toHaveLength(1);
    expect(afterGuestJoin[0].id).toBe(afterOwnerJoin[0].id);

    await closeAndWait(guest);
    await closeAndWait(owner);
    await closeServer(server);
  });

  it('S1.2 updates admitted_peak only when admitted size reaches a new high', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id);
    const guest1 = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest One');

    await waitFor(() => sessionRows(db, room.id)[0]?.admitted_peak === 2);
    closeWs(guest1.ws);
    await nextMessage(owner.ws, (msg) => msg.type === 'peer-left' && msg.clientId === guest1.clientId);
    await waitForClose(guest1.ws);

    const guest2 = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest Two');
    await waitFor(() => sessionRows(db, room.id)[0]?.admitted_peak === 2);

    expect(sessionRows(db, room.id)[0].admitted_peak).toBe(2);
    await closeAndWait(guest2.ws);
    await closeAndWait(owner.ws);
    await closeServer(server);
  });

  it('S1.3 closes with host-end when the host ends the meeting', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id);
    const guest = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest');

    owner.ws.send(JSON.stringify({ type: 'meeting-ended-by-host' }));
    const ownerEnded = await nextMessage(owner.ws, (msg) => msg.type === 'meeting-ended');
    const guestEnded = await nextMessage(guest.ws, (msg) => msg.type === 'meeting-ended');
    await Promise.all([waitForClose(owner.ws), waitForClose(guest.ws)]);
    await waitFor(() => sessionRows(db, room.id)[0]?.ended_reason === 'host-end');

    expect(ownerEnded).toEqual({ type: 'meeting-ended', reason: 'host-end' });
    expect(guestEnded).toEqual({ type: 'meeting-ended', reason: 'host-end' });
    expect(sessionRows(db, room.id)[0]).toMatchObject({ ended_at: expect.any(Number), ended_reason: 'host-end' });
    expect(getHostClientId(room.id, db)).toBeNull();

    await closeServer(server);
  });

  it('S1.4 closes with last-peer-left when the final admitted non-host leaves', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id);
    const guest = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest');

    closeWs(owner.ws);
    await nextMessage(guest.ws, (msg) => msg.type === 'peer-left' && msg.clientId === owner.clientId);
    await waitForClose(owner.ws);
    closeWs(guest.ws);
    await waitFor(() => sessionRows(db, room.id)[0]?.ended_reason === 'last-peer-left');
    await waitForClose(guest.ws);

    const row = sessionRows(db, room.id)[0];
    expect(row.ended_at).toEqual(expect.any(Number));
    expect(row.ended_reason).toBe('last-peer-left');
    await closeServer(server);
  });

  it('S1.5 closes with host-disconnect-empty when the owner leaves alone', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id);

    await closeAndWait(owner.ws);
    await waitFor(() => sessionRows(db, room.id)[0]?.ended_reason === 'host-disconnect-empty');

    const row = sessionRows(db, room.id)[0];
    expect(row.ended_at).toEqual(expect.any(Number));
    expect(row.ended_reason).toBe('host-disconnect-empty');
    await closeServer(server);
  });
});
