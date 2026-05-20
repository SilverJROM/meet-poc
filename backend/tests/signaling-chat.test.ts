import { WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

async function expectNoMessage(ws: WebSocket, timeoutMs = 120): Promise<void> {
  await expect(
    new Promise<void>((resolve, reject) => {
      let timeout: NodeJS.Timeout;
      const onMessage = (raw: WebSocket.RawData) => {
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

async function setupOpenRoom() {
  const db = createTestDb();
  seedUser(db);
  const room = createRoom('Chat sync', 'jrom@silverjrom.app', db);
  setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
  const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
  const serverInfo = await startWsServer(db);
  return { db, room, ownerCookie, ...serverInfo };
}

async function joinOwner(url: string, cookie: string, roomId: string) {
  const owner = await connectWs(url, cookie);
  owner.send(JSON.stringify({ type: 'join', room: roomId, name: 'Owner' }));
  const admitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
  return { ws: owner, clientId: String(admitted.clientId) };
}

async function joinAndAdmitGuest(owner: WebSocket, url: string, roomId: string, name: string) {
  const guest = await connectWs(url);
  guest.send(JSON.stringify({ type: 'join', room: roomId, name }));
  const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
  await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === knocking.clientId);
  owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
  const admitted = await nextMessage(guest, (msg) => msg.type === 'admitted');
  await nextMessage(owner, (msg) => msg.type === 'peer-joined' && msg.clientId === admitted.clientId);
  return { ws: guest, clientId: String(admitted.clientId) };
}

describe('signaling chat', () => {
  it('DR-27 relays chat to admitted peers with server-owned identity and capped text', async () => {
    const { room, ownerCookie, server, url } = await setupOpenRoom();
    const owner = await joinOwner(url, ownerCookie, room.id);
    const guest1 = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest One');
    const guest2 = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest Two');
    await nextMessage(guest1.ws, (msg) => msg.type === 'peer-joined' && msg.clientId === guest2.clientId);

    const longText = `  ${'x'.repeat(2105)}  `;
    guest1.ws.send(JSON.stringify({ type: 'chat', text: longText, sender: 'Imposter', clientId: 'fake' }));
    const ownerChat = await nextMessage(owner.ws, (msg) => msg.type === 'chat');
    const guest2Chat = await nextMessage(guest2.ws, (msg) => msg.type === 'chat');

    expect(ownerChat).toEqual({
      type: 'chat',
      id: expect.any(String),
      clientId: guest1.clientId,
      sender: 'Guest One',
      text: 'x'.repeat(2000),
      sentAt: expect.any(Number),
    });
    expect(guest2Chat).toEqual(ownerChat);
    await expectNoMessage(guest1.ws);

    closeWs(guest2.ws);
    closeWs(guest1.ws);
    closeWs(owner.ws);
    await closeServer(server);
  });

  it('DR-27 ignores empty messages and non-admitted senders', async () => {
    const { room, ownerCookie, server, url } = await setupOpenRoom();
    const owner = await joinOwner(url, ownerCookie, room.id);

    owner.ws.send(JSON.stringify({ type: 'chat', text: '   ' }));
    await expectNoMessage(owner.ws);

    const pending = await connectWs(url);
    pending.send(JSON.stringify({ type: 'join', room: room.id, name: 'Pending Guest' }));
    await nextMessage(pending, (msg) => msg.type === 'knocking');
    await nextMessage(owner.ws, (msg) => msg.type === 'knock');
    pending.send(JSON.stringify({ type: 'chat', text: 'not admitted' }));
    await expectNoMessage(owner.ws);

    closeWs(pending);
    closeWs(owner.ws);
    await closeServer(server);
  });

  it('DR-27 does not replay chat after everyone leaves and rejoins', async () => {
    const { room, ownerCookie, server, url } = await setupOpenRoom();
    const owner = await joinOwner(url, ownerCookie, room.id);
    const guest = await joinAndAdmitGuest(owner.ws, url, room.id, 'Guest');

    guest.ws.send(JSON.stringify({ type: 'chat', text: 'transient only' }));
    await nextMessage(owner.ws, (msg) => msg.type === 'chat');

    closeWs(guest.ws);
    closeWs(owner.ws);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const rejoinedOwner = await joinOwner(url, ownerCookie, room.id);
    await expectNoMessage(rejoinedOwner.ws);

    closeWs(rejoinedOwner.ws);
    await closeServer(server);
  });
});
