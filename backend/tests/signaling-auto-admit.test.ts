import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { getHostClientId, hasLiveRoom } from '../src/modules/signaling/index.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

const AGENTROOM_ID = 'd98896162f09';

function insertAgentRoom(db: ReturnType<typeof createTestDb>): void {
  db.prepare(
    'INSERT INTO rooms (id, title, slug, owner_email, is_open, auto_admit, created_at) VALUES (?, ?, ?, ?, 0, 1, ?)',
  ).run(AGENTROOM_ID, 'AGENTROOM', 'agentroom', 'jrom@silverjrom.app', Date.now());
}

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

describe('signaling closed-room auto-admit', () => {
  it('admits a non-owner guest into closed AGENTROOM when auto_admit=1', async () => {
    const db = createTestDb();
    seedUser(db);
    insertAgentRoom(db);
    const { server, url } = await startWsServer(db);
    const guest = await connectWs(url);

    guest.send(JSON.stringify({ type: 'join', room: AGENTROOM_ID, name: 'Guest' }));
    const admitted = await nextMessage(guest);

    expect(admitted).toEqual({
      type: 'admitted',
      clientId: expect.any(String),
      participantId: expect.any(String),
      peers: [],
      roomTitle: 'AGENTROOM',
      isOwner: false,
      hostClientId: null,
      sessionId: expect.any(String),
    });

    closeWs(guest);
    await closeServer(server);
  });

  it('still sends non-owner guests to the waiting room when auto_admit=0', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Closed wait', 'jrom@silverjrom.app', db);
    const { server, url } = await startWsServer(db);
    const guest = await connectWs(url);

    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const waiting = await nextMessage(guest);

    expect(waiting).toMatchObject({
      type: 'waiting-room',
      clientId: expect.any(String),
      roomTitle: 'Closed wait',
      isOpen: false,
    });

    closeWs(guest);
    await closeServer(server);
  });
});
