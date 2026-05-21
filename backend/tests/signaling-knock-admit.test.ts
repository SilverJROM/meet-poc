import { WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

describe('signaling knock, admit, reject', () => {
  it('S2.7 moves guest from knocking to admitted and notifies owner', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    const ownerAdmitted = await nextMessage(owner);

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const knocking = await nextMessage(guest);
    const knock = await nextMessage(owner, (msg) => msg.type === 'knock');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const guestAdmitted = await nextMessage(guest);
    const peerJoined = await nextMessage(owner, (msg) => msg.type === 'peer-joined');

    expect(knocking).toEqual({ type: 'knocking', clientId: expect.any(String), roomTitle: 'Team sync' });
    expect(knock).toEqual({ type: 'knock', clientId: knocking.clientId, name: 'Guest' });
    expect(guestAdmitted).toEqual({
      type: 'admitted',
      clientId: knocking.clientId,
      participantId: expect.any(String),
      peers: [{ id: ownerAdmitted.clientId, participantId: ownerAdmitted.participantId, name: 'Owner', host: true, isMobile: false }],
      roomTitle: 'Team sync',
      isOwner: false,
      hostClientId: ownerAdmitted.clientId,
      sessionId: ownerAdmitted.sessionId,
    });
    expect(peerJoined).toEqual({ type: 'peer-joined', clientId: knocking.clientId, participantId: guestAdmitted.participantId, name: 'Guest', isMobile: false });
    closeWs(guest);
    closeWs(owner);
    await closeServer(server);
  });

  it('S2.8 rejects a knocking guest with the supplied reason and closes', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    await nextMessage(owner);

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const knocking = await nextMessage(guest);
    await nextMessage(owner, (msg) => msg.type === 'knock');
    const closed = new Promise<void>((resolve) => guest.once('close', () => resolve()));
    owner.send(JSON.stringify({ type: 'reject', clientId: knocking.clientId, reason: 'no' }));
    const rejected = await nextMessage(guest);
    const cancelled = await nextMessage(owner, (msg) => msg.type === 'knock-cancelled');
    await closed;

    expect(rejected).toEqual({ type: 'rejected', reason: 'no' });
    expect(cancelled).toEqual({ type: 'knock-cancelled', clientId: knocking.clientId });
    expect(guest.readyState).toBe(WebSocket.CLOSED);
    closeWs(owner);
    await closeServer(server);
  });

  it('broadcasts an authoritative pending-list when a guest knocks after the owner is admitted', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    await nextMessage(owner, (msg) => msg.type === 'admitted');

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Late Guest' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    const pendingListPromise = nextMessage(owner, (msg) => msg.type === 'pending-list');
    await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === knocking.clientId);
    const pendingList = await pendingListPromise;

    expect(pendingList).toEqual({ type: 'pending-list', knockers: [{ id: knocking.clientId, name: 'Late Guest' }] });

    closeWs(guest);
    closeWs(owner);
    await closeServer(server);
  });
});
