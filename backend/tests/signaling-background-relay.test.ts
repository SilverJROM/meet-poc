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

  it('relays a broadcast background-image thumbnail to admitted peers (R8b)', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Background image relay', 'jrom@silverjrom.app', db);
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

    const thumbnail = `data:image/jpeg;base64,${'A'.repeat(100)}`;
    owner.send(JSON.stringify({ type: 'background-image', image: thumbnail }));
    const relayed = await nextMessage(guest, (msg) => msg.type === 'background-image');

    expect(relayed).toMatchObject({ type: 'background-image', clientId: ownerAdmitted.clientId, image: thumbnail });

    closeWs(owner);
    closeWs(guest);
    await closeServer(server);
  });

  it('drops an oversized background-image instead of relaying it — server does not trust client-side compression', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Background image cap', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const guest = await connectWs(url);

    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    await nextMessage(owner, (msg) => msg.type === 'admitted');
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const knock = await nextMessage(owner, (msg) => msg.type === 'knock');
    owner.send(JSON.stringify({ type: 'admit', clientId: knock.clientId }));
    await nextMessage(guest, (msg) => msg.type === 'admitted');

    const oversized = `data:image/jpeg;base64,${'A'.repeat(200_001)}`;
    const valid = `data:image/jpeg;base64,${'B'.repeat(100)}`;
    owner.send(JSON.stringify({ type: 'background-image', image: oversized }));
    owner.send(JSON.stringify({ type: 'background-image', image: valid }));

    // If the oversized payload had been relayed it would arrive first (messages are ordered
    // over one connection); asserting the FIRST background-image the guest sees is the valid
    // one proves the oversized one was silently dropped server-side.
    const relayed = await nextMessage(guest, (msg) => msg.type === 'background-image');
    expect(relayed.image).toBe(valid);

    closeWs(owner);
    closeWs(guest);
    await closeServer(server);
  });

  it('rejects a background-image payload that is not a data:image/* URL', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Background image format', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const guest = await connectWs(url);

    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    await nextMessage(owner, (msg) => msg.type === 'admitted');
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const knock = await nextMessage(owner, (msg) => msg.type === 'knock');
    owner.send(JSON.stringify({ type: 'admit', clientId: knock.clientId }));
    await nextMessage(guest, (msg) => msg.type === 'admitted');

    const malformed = `javascript:alert(1)//${'A'.repeat(50)}`;
    const valid = `data:image/png;base64,${'C'.repeat(50)}`;
    owner.send(JSON.stringify({ type: 'background-image', image: malformed }));
    owner.send(JSON.stringify({ type: 'background-image', image: valid }));

    const relayed = await nextMessage(guest, (msg) => msg.type === 'background-image');
    expect(relayed.image).toBe(valid);

    closeWs(owner);
    closeWs(guest);
    await closeServer(server);
  });
});
