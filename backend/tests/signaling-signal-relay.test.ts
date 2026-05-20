import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

describe('signaling relay', () => {
  it('S2.9 relays signal between admitted peers and drops signals to non-admitted clients', async () => {
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
    await nextMessage(owner, (msg) => msg.type === 'knock');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const guestAdmitted = await nextMessage(guest);
    await nextMessage(owner, (msg) => msg.type === 'peer-joined');

    owner.send(JSON.stringify({ type: 'signal', to: guestAdmitted.clientId, data: { sdp: 'fake-offer' } }));
    const relayed = await nextMessage(guest, (msg) => msg.type === 'signal');
    guest.send(JSON.stringify({ type: 'signal', to: 'not-admitted', data: { sdp: 'drop' } }));

    expect(relayed).toEqual({ type: 'signal', from: ownerAdmitted.clientId, data: { sdp: 'fake-offer' } });
    closeWs(guest);
    closeWs(owner);
    await closeServer(server);
  });
});
