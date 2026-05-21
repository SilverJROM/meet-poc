import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

describe('signaling room cap', () => {
  it('S2.11 admits 6 participants (SFU product cap raised from mesh DR-50=5 to 30)', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    await nextMessage(owner, (msg) => msg.type === 'admitted');
    const peers = [];

    for (let i = 0; i < 5; i += 1) {
      const peer = await connectWs(url);
      peer.send(JSON.stringify({ type: 'join', room: room.id, name: `Guest ${i}` }));
      const knocking = await nextMessage(peer, (msg) => msg.type === 'knocking');
      await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === knocking.clientId);
      owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
      await nextMessage(peer, (msg) => msg.type === 'admitted');
      await nextMessage(owner, (msg) => msg.type === 'peer-joined' && msg.clientId === knocking.clientId);
      peers.push(peer);
    }

    // 6th participant (owner + 5 guests) must be admitted — old mesh cap was 5, SFU cap is 30
    expect(peers.length).toBe(5);
    for (const peer of peers) closeWs(peer);
    closeWs(owner);
    await closeServer(server);
  });
});
