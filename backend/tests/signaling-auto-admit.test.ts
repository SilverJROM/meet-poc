import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

describe('signaling owner auto-admit', () => {
  it('S2.6 admits an owner immediately with legacy message shape', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);

    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    const admitted = await nextMessage(owner);

    expect(admitted).toEqual({
      type: 'admitted',
      clientId: expect.any(String),
      peers: [],
      roomTitle: 'Team sync',
      isOwner: true,
      hostClientId: expect.any(String),
    });
    expect(admitted.hostClientId).toBe(admitted.clientId);
    closeWs(owner);
    await closeServer(server);
  });
});
