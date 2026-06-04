import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { notifyRoomAccessChanged } from '../src/modules/signaling/index.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, dropWs, nextMessage } from './signaling-helpers.js';
import { startWsServer } from './signaling-helpers.js';

describe('signaling waiting room access gate', () => {
  it('puts fresh guests in a timed closed-room wait and kicks them on timeout', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Closed wait', 'jrom@silverjrom.app', db);
    const access = setRoomAccess(room.id, { waitTimeoutMinutes: 0.001 }, 'jrom@silverjrom.app', db);
    expect(access.ok).toBe(true);
    const { server, url } = await startWsServer(db);
    const guest = await connectWs(url);

    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const waiting = await nextMessage(guest, (msg) => msg.type === 'waiting-room');
    const timedOut = await nextMessage(guest, (msg) => msg.type === 'waiting-timeout');

    expect(waiting).toMatchObject({
      type: 'waiting-room',
      clientId: expect.any(String),
      roomTitle: 'Closed wait',
      isOpen: false,
    });
    expect(Number(waiting.waitTimeoutMs)).toBeGreaterThanOrEqual(1);
    expect(timedOut).toEqual({
      type: 'waiting-timeout',
      message: "This room wasn't opened by the host in time. Please try again later.",
    });

    closeWs(guest);
    await closeServer(server);
  });

  it('restarts the closed-room wait timer when a guest reconnects', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Closed reconnect wait', 'jrom@silverjrom.app', db);
    const access = setRoomAccess(room.id, { waitTimeoutMinutes: 0.02 }, 'jrom@silverjrom.app', db);
    expect(access.ok).toBe(true);
    const { server, url } = await startWsServer(db);
    const first = await connectWs(url);

    first.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const firstWaiting = await nextMessage(first, (msg) => msg.type === 'waiting-room');
    dropWs(first);

    const second = await connectWs(url);
    second.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const secondWaiting = await nextMessage(second, (msg) => msg.type === 'waiting-room');

    expect(Number(secondWaiting.expiresAt)).toBeGreaterThan(Number(firstWaiting.expiresAt));

    closeWs(second);
    await closeServer(server);
  });

  it('promotes closed-room waiters into the normal admit flow when the owner joins and auto-opens the room', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Open during wait', 'jrom@silverjrom.app', db);
    const access = setRoomAccess(room.id, { waitTimeoutMinutes: 0.02 }, 'jrom@silverjrom.app', db);
    expect(access.ok).toBe(true);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    await nextMessage(guest, (msg) => msg.type === 'waiting-room' && msg.isOpen === false);

    const owner = await connectWs(url, ownerCookie);
    const ownerAdmittedPromise = nextMessage(owner, (msg) => msg.type === 'admitted');
    const stateUpdatePromise = nextMessage(guest, (msg) => msg.type === 'waiting-room' && msg.isOpen === true);
    const knockingPromise = nextMessage(guest, (msg) => msg.type === 'knocking');
    const knockPromise = nextMessage(owner, (msg) => msg.type === 'knock');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));

    const ownerAdmitted = await ownerAdmittedPromise;
    const stateUpdate = await stateUpdatePromise;
    const knocking = await knockingPromise;
    const knock = await knockPromise;

    expect(ownerAdmitted).toMatchObject({ type: 'admitted', isOwner: true, roomTitle: 'Open during wait' });
    expect(stateUpdate).toMatchObject({ type: 'waiting-room', isOpen: true, roomTitle: 'Open during wait' });
    expect(knocking).toMatchObject({ type: 'knocking', roomTitle: 'Open during wait' });
    expect(knock).toMatchObject({ type: 'knock', name: 'Guest' });

    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    await nextMessage(guest, (msg) => msg.type === 'admitted');

    closeWs(guest);
    closeWs(owner);
    await closeServer(server);
  });

  it('lets owners enter a closed room and open rooms use the unlimited pending flow', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Owner bypass', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);

    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    expect(ownerAdmitted).toMatchObject({ type: 'admitted', isOwner: true, roomTitle: 'Owner bypass' });

    const opened = setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    expect(opened.ok).toBe(true);
    if (opened.ok) notifyRoomAccessChanged(opened.room.id, opened.room.isOpen, opened.room.waitTimeoutMinutes, db);

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    const knock = await nextMessage(owner, (msg) => msg.type === 'knock');

    expect(knocking).toMatchObject({ type: 'knocking' });
    expect(knock).toMatchObject({ type: 'knock', name: 'Guest' });

    closeWs(guest);
    closeWs(owner);
    await closeServer(server);
  });
});
