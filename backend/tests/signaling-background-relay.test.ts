import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

describe('signaling media-state background relay', () => {
  it('relays sanitized camera-off background descriptors to admitted peers', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Background relay', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const guest = await connectWs(url);

    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const knock = await nextMessage(owner, (msg) => msg.type === 'knock');
    owner.send(JSON.stringify({ type: 'admit', clientId: knock.clientId }));
    await nextMessage(guest, (msg) => msg.type === 'admitted');

    owner.send(
      JSON.stringify({
        type: 'media-state',
        mic: true,
        cam: false,
        screenOn: false,
        background: { kind: 'image', id: 'city' },
      }),
    );
    const relayed = await nextMessage(guest, (msg) => msg.type === 'media-state');

    expect(relayed).toMatchObject({
      type: 'media-state',
      clientId: ownerAdmitted.clientId,
      mic: true,
      cam: false,
      screenOn: false,
      background: { kind: 'image', id: 'city' },
    });

    closeWs(owner);
    closeWs(guest);
    await closeServer(server);
  });
});
