import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

describe('signaling peer-left', () => {
  it('S2.10 broadcasts peer-left when an admitted peer disconnects', async () => {
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
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const guestAdmitted = await nextMessage(guest);
    await nextMessage(owner, (msg) => msg.type === 'peer-joined');
    closeWs(guest);
    const peerLeft = await nextMessage(owner, (msg) => msg.type === 'peer-left');

    expect(peerLeft).toEqual({ type: 'peer-left', clientId: guestAdmitted.clientId });
    closeWs(owner);
    await closeServer(server);
  });
});
