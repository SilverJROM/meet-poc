import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

async function expectNoMessage(ws: import('ws').WebSocket, timeoutMs = 100): Promise<void> {
  await expect(
    new Promise<void>((resolve, reject) => {
      let timeout: NodeJS.Timeout;
      const onMessage = (raw: import('ws').RawData) => {
        clearTimeout(timeout);
        ws.off('message', onMessage);
        reject(new Error(`unexpected message: ${String(raw)}`));
      };
      timeout = setTimeout(() => {
        ws.off('message', onMessage);
        resolve();
      }, timeoutMs);
      timeout.unref?.();
      ws.once('message', onMessage);
    }),
  ).resolves.toBeUndefined();
}

describe('signaling media-state', () => {
  it('S6.3 relays media-state to other admitted peers only', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    await nextMessage(owner, (msg) => msg.type === 'admitted');

    const guest1 = await connectWs(url);
    guest1.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest One' }));
    const knocking1 = await nextMessage(guest1, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === knocking1.clientId);
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking1.clientId }));
    const guest1Admitted = await nextMessage(guest1, (msg) => msg.type === 'admitted');
    await nextMessage(owner, (msg) => msg.type === 'peer-joined' && msg.clientId === guest1Admitted.clientId);

    const guest2 = await connectWs(url);
    guest2.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest Two' }));
    const knocking2 = await nextMessage(guest2, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === knocking2.clientId);
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking2.clientId }));
    await nextMessage(guest2, (msg) => msg.type === 'admitted');
    await nextMessage(owner, (msg) => msg.type === 'peer-joined' && msg.clientId === knocking2.clientId);
    await nextMessage(guest1, (msg) => msg.type === 'peer-joined' && msg.clientId === knocking2.clientId);

    guest1.send(JSON.stringify({ type: 'media-state', mic: false, cam: true }));
    const ownerState = await nextMessage(owner, (msg) => msg.type === 'media-state');
    const guest2State = await nextMessage(guest2, (msg) => msg.type === 'media-state');

    expect(ownerState).toEqual({ type: 'media-state', clientId: guest1Admitted.clientId, mic: false, cam: true });
    expect(guest2State).toEqual(ownerState);
    await expectNoMessage(guest1);

    closeWs(guest2);
    closeWs(guest1);
    closeWs(owner);
    await closeServer(server);
  });
});
