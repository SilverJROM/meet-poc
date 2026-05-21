import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

describe('signaling wire format', () => {
  it('S2.12 preserves signaling message shapes with admitted session diagnostics context', async () => {
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

    expect(Object.keys(ownerAdmitted)).toEqual(['type', 'clientId', 'participantId', 'peers', 'roomTitle', 'isOwner', 'hostClientId', 'sessionId']);
    expect(Object.keys(knocking)).toEqual(['type', 'clientId', 'roomTitle']);
    expect(Object.keys(knock)).toEqual(['type', 'clientId', 'name']);
    expect(Object.keys(guestAdmitted)).toEqual(['type', 'clientId', 'participantId', 'peers', 'roomTitle', 'isOwner', 'hostClientId', 'sessionId']);
    expect(Object.keys(peerJoined)).toEqual(['type', 'clientId', 'participantId', 'name', 'isMobile']);
    expect(Object.keys(knockCancelled)).toEqual(['type', 'clientId']);
    expect(Object.keys(signal)).toEqual(['type', 'from', 'data']);
    expect(Object.keys(peerLeft)).toEqual(['type', 'clientId', 'participantId']);
    expect(ownerAdmitted).toMatchObject({ type: 'admitted', peers: [], roomTitle: 'Team sync', isOwner: true, sessionId: expect.any(String) });
    expect(guestAdmitted).toMatchObject({
      type: 'admitted',
      peers: [{ id: ownerAdmitted.clientId, participantId: ownerAdmitted.participantId, name: 'Owner', host: true, isMobile: false }],
      roomTitle: 'Team sync',
      isOwner: false,
      hostClientId: ownerAdmitted.clientId,
      sessionId: ownerAdmitted.sessionId,
    });
    expect(signal).toEqual({ type: 'signal', from: ownerAdmitted.clientId, data: { sdp: 'fake-offer' } });
    expect(peerLeft).toEqual({ type: 'peer-left', clientId: guestAdmitted.clientId, participantId: guestAdmitted.participantId });

    closeWs(owner);
    await closeServer(server);
  });
});
