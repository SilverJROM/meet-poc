import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

describe('signaling reconnect', () => {
  it('resumes a previously admitted guest with an opt-in reconnect token', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
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
    const peerLeftPromise = nextMessage(owner, (msg) => msg.type === 'peer-left' && msg.clientId === knocking.clientId);
    closeWs(guest);
    await peerLeftPromise;

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
    const rejoin = await nextMessage(owner, (msg) => msg.type === 'peer-joined');

    expect(resumedAdmitted).toMatchObject({
      type: 'admitted',
      roomTitle: 'Team sync',
      isOwner: false,
      hostClientId: ownerAdmitted.clientId,
      peers: [{ id: ownerAdmitted.clientId, name: 'Owner', host: true }],
    });
    expect(resumedAdmitted.clientId).not.toBe(knocking.clientId);
    expect(rejoin).toEqual({ type: 'peer-joined', clientId: resumedAdmitted.clientId, name: 'Guest' });

    closeWs(resumed);
    closeWs(owner);
    await closeServer(server);
  });

  it('does not let an unadmitted guest bypass knocking with a bogus token', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
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
});
