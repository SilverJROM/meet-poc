import { WebSocket } from 'ws';
import { describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { getHostClientId, hasLiveRoom } from '../src/modules/signaling/index.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

type SessionRow = {
  id: string;
  ended_at: number | null;
  ended_reason: string | null;
};

type JoinedPeer = {
  ws: WebSocket;
  clientId: string;
};

function sessionRow(db: Database.Database, roomId: string): SessionRow {
  return db
    .prepare('SELECT id, ended_at, ended_reason FROM meeting_sessions WHERE room_id = ? ORDER BY started_at DESC LIMIT 1')
    .get(roomId) as SessionRow;
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

async function expectNoMessage(ws: WebSocket, timeoutMs = 100): Promise<void> {
  await expect(
    new Promise<void>((resolve, reject) => {
      let timeout: NodeJS.Timeout;
      const onMessage = (raw: WebSocket.RawData) => {
        clearTimeout(timeout);
        ws.off('message', onMessage);
        reject(new Error(`unexpected message: ${String(raw)}`));
      };
      timeout = setTimeout(() => {
        ws.off('message', onMessage);
        resolve();
      }, timeoutMs);
      timeout.unref?.();
      ws.once('message', onMessage);
    }),
  ).resolves.toBeUndefined();
}

async function joinOwner(url: string, cookie: string, roomId: string): Promise<JoinedPeer> {
  const ws = await connectWs(url, cookie);
  ws.send(JSON.stringify({ type: 'join', room: roomId, name: 'Owner' }));
  const admitted = await nextMessage(ws, (msg) => msg.type === 'admitted');
  return { ws, clientId: String(admitted.clientId) };
}

async function joinAndAdmitGuest(owner: WebSocket, url: string, roomId: string, name: string): Promise<JoinedPeer> {
  const ws = await connectWs(url);
  ws.send(JSON.stringify({ type: 'join', room: roomId, name }));
  const knocking = await nextMessage(ws, (msg) => msg.type === 'knocking');
  await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === knocking.clientId);
  owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
  const admitted = await nextMessage(ws, (msg) => msg.type === 'admitted');
  await nextMessage(owner, (msg) => msg.type === 'peer-joined' && msg.clientId === knocking.clientId);
  return { ws, clientId: String(admitted.clientId) };
}

describe('signaling host authority', () => {
  it('S2.5 broadcasts recording-started and recording-stopped from the host to all admitted peers', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id);
    const guest = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest');
    const session = sessionRow(db, room.id);

    owner.ws.send(JSON.stringify({ type: 'recording-state', state: 'started' }));
    const ownerStarted = await nextMessage(owner.ws, (msg) => msg.type === 'recording-started');
    const guestStarted = await nextMessage(guest.ws, (msg) => msg.type === 'recording-started');
    owner.ws.send(JSON.stringify({ type: 'recording-state', state: 'stopped' }));
    const ownerStopped = await nextMessage(owner.ws, (msg) => msg.type === 'recording-stopped');
    const guestStopped = await nextMessage(guest.ws, (msg) => msg.type === 'recording-stopped');

    expect(ownerStarted).toEqual({ type: 'recording-started', clientId: owner.clientId, sessionId: session.id });
    expect(guestStarted).toEqual(ownerStarted);
    expect(ownerStopped).toEqual({ type: 'recording-stopped', clientId: owner.clientId, sessionId: session.id });
    expect(guestStopped).toEqual(ownerStopped);

    await closeAndWait(guest.ws);
    await closeAndWait(owner.ws);
    await closeServer(server);
  });

  it('S2.6 meeting-ended-by-host closes the session and every socket', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id);
    const guest1 = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest One');
    const guest2 = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest Two');
    const knocker = await connectWs(url);
    knocker.send(JSON.stringify({ type: 'join', room: room.id, name: 'Knocker' }));
    await nextMessage(knocker, (msg) => msg.type === 'knocking');
    await nextMessage(owner.ws, (msg) => msg.type === 'knock');

    owner.ws.send(JSON.stringify({ type: 'meeting-ended-by-host' }));
    const endedMessages = await Promise.all([
      nextMessage(owner.ws, (msg) => msg.type === 'meeting-ended'),
      nextMessage(guest1.ws, (msg) => msg.type === 'meeting-ended'),
      nextMessage(guest2.ws, (msg) => msg.type === 'meeting-ended'),
    ]);
    const rejected = await nextMessage(knocker, (msg) => msg.type === 'rejected');
    await Promise.all([waitForClose(owner.ws), waitForClose(guest1.ws), waitForClose(guest2.ws), waitForClose(knocker)]);
    await waitFor(() => sessionRow(db, room.id).ended_reason === 'host-end');

    expect(endedMessages).toEqual([
      { type: 'meeting-ended', reason: 'host-end' },
      { type: 'meeting-ended', reason: 'host-end' },
      { type: 'meeting-ended', reason: 'host-end' },
    ]);
    expect(rejected).toEqual({ type: 'rejected', reason: 'meeting ended by host' });
    expect(sessionRow(db, room.id)).toMatchObject({ ended_at: expect.any(Number), ended_reason: 'host-end' });
    expect(hasLiveRoom(room.id)).toBe(false);
    await closeServer(server);
  });

  it('S2.7 sends mute-request only to the targeted peer', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id);
    const guest1 = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest One');
    const guest2 = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest Two');

    owner.ws.send(JSON.stringify({ type: 'mute-target', clientId: guest1.clientId }));
    const muteRequest = await nextMessage(guest1.ws, (msg) => msg.type === 'mute-request');

    expect(muteRequest).toEqual({ type: 'mute-request', from: owner.clientId });
    await expectNoMessage(guest2.ws);

    await closeAndWait(guest2.ws);
    await closeAndWait(guest1.ws);
    await closeAndWait(owner.ws);
    await closeServer(server);
  });

  it('S2.8 remove-peer closes the target and broadcasts peer-left to remaining admitted peers', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id);
    const guest1 = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest One');
    const guest2 = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest Two');

    owner.ws.send(JSON.stringify({ type: 'remove-peer', clientId: guest1.clientId }));
    const removed = await nextMessage(guest1.ws, (msg) => msg.type === 'peer-removed');
    await waitForClose(guest1.ws);
    const ownerPeerLeft = await nextMessage(owner.ws, (msg) => msg.type === 'peer-left');
    const guest2PeerLeft = await nextMessage(guest2.ws, (msg) => msg.type === 'peer-left');

    expect(removed).toEqual({ type: 'peer-removed', reason: 'removed by host' });
    expect(ownerPeerLeft).toEqual({ type: 'peer-left', clientId: guest1.clientId });
    expect(guest2PeerLeft).toEqual(ownerPeerLeft);

    await closeAndWait(guest2.ws);
    await closeAndWait(owner.ws);
    await closeServer(server);
  });

  it('S2.9 silently drops non-host commands and logs them at info level', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id);
    const guest = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest');
    const session = sessionRow(db, room.id);

    guest.ws.send(JSON.stringify({ type: 'recording-state', state: 'started' }));
    guest.ws.send(JSON.stringify({ type: 'mute-target', clientId: owner.clientId }));
    guest.ws.send(JSON.stringify({ type: 'remove-peer', clientId: owner.clientId }));
    guest.ws.send(JSON.stringify({ type: 'meeting-ended-by-host' }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(infoSpy).toHaveBeenCalledWith('[host-cmd-rejected]', 'recording-state', null, room.id);
    expect(infoSpy).toHaveBeenCalledWith('[host-cmd-rejected]', 'mute-target', null, room.id);
    expect(infoSpy).toHaveBeenCalledWith('[host-cmd-rejected]', 'remove-peer', null, room.id);
    expect(infoSpy).toHaveBeenCalledWith('[host-cmd-rejected]', 'meeting-ended-by-host', null, room.id);
    expect(sessionRow(db, room.id)).toMatchObject({ id: session.id, ended_at: null, ended_reason: null });
    expect(owner.ws.readyState).toBe(WebSocket.OPEN);
    expect(guest.ws.readyState).toBe(WebSocket.OPEN);
    expect(getHostClientId(room.id, db)).toBe(owner.clientId);
    await expectNoMessage(owner.ws);

    infoSpy.mockRestore();
    await closeAndWait(guest.ws);
    await closeAndWait(owner.ws);
    await closeServer(server);
  });
});
