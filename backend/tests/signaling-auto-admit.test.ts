import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { getHostClientId, hasLiveRoom } from '../src/modules/signaling/index.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

describe('signaling owner auto-admit', () => {
  it('S2.6 admits an owner immediately with session diagnostics context', async () => {
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
      participantId: expect.any(String),
      peers: [],
      roomTitle: 'Team sync',
      isOwner: true,
      hostClientId: expect.any(String),
      sessionId: expect.any(String),
    });
    expect(admitted.hostClientId).toBe(admitted.clientId);
    closeWs(owner);
    await closeServer(server);
  });

  it('DR-15 accepts a room slug on join but stores live state under the canonical room id', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Slug Team Sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);

    owner.send(JSON.stringify({ type: 'join', room: room.slug, name: 'Owner' }));
    const admitted = await nextMessage(owner);

    expect(admitted.type).toBe('admitted');
    expect(hasLiveRoom(room.id)).toBe(true);
    expect(hasLiveRoom(room.slug)).toBe(false);
    expect(getHostClientId(room.id, db)).toBe(admitted.clientId);

    closeWs(owner);
    await closeServer(server);
  });
});
