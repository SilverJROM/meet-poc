import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, dropWs, nextMessage, startWsServer } from './signaling-helpers.js';

describe('signaling reconnect', () => {
  it('resumes a previously admitted guest with an opt-in reconnect token', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const ownerAdmittedPromise = nextMessage(owner, (msg) => msg.type === 'admitted');
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const ownerAdmitted = await ownerAdmittedPromise;
    await ownerTokenPromise;

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    const guestAdmittedPromise = nextMessage(guest, (msg) => msg.type === 'admitted');
    const guestTokenPromise = nextMessage(guest, (msg) => msg.type === 'reconnect-token');
    const peerJoinedPromise = nextMessage(owner, (msg) => msg.type === 'peer-joined');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    await guestAdmittedPromise;
    const guestToken = await guestTokenPromise;
    await peerJoinedPromise;
    const peerReconnectingPromise = nextMessage(owner, (msg) => msg.type === 'peer-reconnecting' && msg.clientId === knocking.clientId);
    dropWs(guest);
    await peerReconnectingPromise;

    const resumed = await connectWs(url);
    resumed.send(
      JSON.stringify({
        type: 'join',
        room: room.id,
        name: 'Guest',
        supportsReconnect: true,
        reconnectToken: guestToken.token,
      }),
    );
    const resumedAdmitted = await nextMessage(resumed, (msg) => msg.type === 'admitted');
    const rejoin = await nextMessage(owner, (msg) => msg.type === 'peer-resumed');

    expect(resumedAdmitted).toMatchObject({
      type: 'admitted',
      roomTitle: 'Team sync',
      isOwner: false,
      hostClientId: ownerAdmitted.clientId,
      peers: [{ id: ownerAdmitted.clientId, name: 'Owner', host: true }],
    });
    expect(resumedAdmitted.clientId).not.toBe(knocking.clientId);
    expect(rejoin).toEqual({ type: 'peer-resumed', oldClientId: knocking.clientId, clientId: resumedAdmitted.clientId, name: 'Guest', host: false });

    closeWs(resumed);
    closeWs(owner);
    await closeServer(server);
  });

  it('does not let an unadmitted guest bypass knocking with a bogus token', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const ownerAdmittedPromise = nextMessage(owner, (msg) => msg.type === 'admitted');
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    await ownerAdmittedPromise;
    await ownerTokenPromise;

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, reconnectToken: 'not-real' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');

    expect(knocking).toMatchObject({ type: 'knocking', roomTitle: 'Team sync' });

    closeWs(guest);
    closeWs(owner);
    await closeServer(server);
  });

  it('auto-resumes a disconnected owner by ownership without knocking', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Owner reconnect', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    const firstAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');

    dropWs(owner);

    const resumed = await connectWs(url, ownerCookie);
    resumed.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    const admitted = await nextMessage(resumed, (msg) => msg.type === 'admitted');

    expect(admitted).toMatchObject({
      type: 'admitted',
      roomTitle: 'Owner reconnect',
      isOwner: true,
      peers: [],
    });
    expect(admitted.clientId).not.toBe(firstAdmitted.clientId);

    closeWs(resumed);
    await closeServer(server);
  });

  it('does not let a different user claim a reconnecting guest slot with a stolen token', async () => {
    const db = createTestDb();
    seedUser(db);
    db.prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      'other@silverjrom.app',
      '00:00',
      Date.now(),
      Date.now(),
    );
    const room = createRoom('Secure reconnect', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const otherCookie = `session=${createSession('other@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const ownerAdmittedPromise = nextMessage(owner, (msg) => msg.type === 'admitted');
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    await ownerAdmittedPromise;
    await ownerTokenPromise;

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    const guestAdmittedPromise = nextMessage(guest, (msg) => msg.type === 'admitted');
    const guestTokenPromise = nextMessage(guest, (msg) => msg.type === 'reconnect-token');
    const guestJoinedPromise = nextMessage(owner, (msg) => msg.type === 'peer-joined');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    await guestAdmittedPromise;
    const guestToken = await guestTokenPromise;
    await guestJoinedPromise;
    dropWs(guest);
    await nextMessage(owner, (msg) => msg.type === 'peer-reconnecting');

    const hijacker = await connectWs(url, otherCookie);
    hijacker.send(JSON.stringify({ type: 'join', room: room.id, name: 'Hijacker', supportsReconnect: true, reconnectToken: guestToken.token }));
    const hijackerState = await nextMessage(hijacker, (msg) => msg.type === 'knocking');

    expect(hijackerState).toMatchObject({ type: 'knocking', roomTitle: 'Secure reconnect' });

    closeWs(hijacker);
    closeWs(owner);
    await closeServer(server);
  });
});
