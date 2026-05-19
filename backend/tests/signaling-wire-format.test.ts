import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

describe('signaling wire format', () => {
  it('S2.12 preserves legacy message type and payload key shapes', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    const ownerAdmitted = await nextMessage(owner);

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const knocking = await nextMessage(guest);
    const knock = await nextMessage(owner, (msg) => msg.type === 'knock');
    const peerJoinedPromise = nextMessage(owner, (msg) => msg.type === 'peer-joined');
    const knockCancelledPromise = nextMessage(owner, (msg) => msg.type === 'knock-cancelled');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const guestAdmitted = await nextMessage(guest);
    const peerJoined = await peerJoinedPromise;
    const knockCancelled = await knockCancelledPromise;
    owner.send(JSON.stringify({ type: 'signal', to: guestAdmitted.clientId, data: { sdp: 'fake-offer' } }));
    const signal = await nextMessage(guest, (msg) => msg.type === 'signal');
    closeWs(guest);
    const peerLeft = await nextMessage(owner, (msg) => msg.type === 'peer-left');

    expect(Object.keys(ownerAdmitted)).toEqual(['type', 'clientId', 'peers', 'roomTitle', 'isOwner']);
    expect(Object.keys(knocking)).toEqual(['type', 'clientId', 'roomTitle']);
    expect(Object.keys(knock)).toEqual(['type', 'clientId', 'name']);
    expect(Object.keys(guestAdmitted)).toEqual(['type', 'clientId', 'peers', 'roomTitle', 'isOwner']);
    expect(Object.keys(peerJoined)).toEqual(['type', 'clientId', 'name']);
    expect(Object.keys(knockCancelled)).toEqual(['type', 'clientId']);
    expect(Object.keys(signal)).toEqual(['type', 'from', 'data']);
    expect(Object.keys(peerLeft)).toEqual(['type', 'clientId']);
    expect(ownerAdmitted).toMatchObject({ type: 'admitted', peers: [], roomTitle: 'Team sync', isOwner: true });
    expect(guestAdmitted).toMatchObject({
      type: 'admitted',
      peers: [{ id: ownerAdmitted.clientId, name: 'Owner' }],
      roomTitle: 'Team sync',
      isOwner: false,
    });
    expect(signal).toEqual({ type: 'signal', from: ownerAdmitted.clientId, data: { sdp: 'fake-offer' } });
    expect(peerLeft).toEqual({ type: 'peer-left', clientId: guestAdmitted.clientId });

    closeWs(owner);
    await closeServer(server);
  });
});
