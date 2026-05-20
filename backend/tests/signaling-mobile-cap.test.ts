import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';

async function joinOwner(url: string, cookie: string, roomId: string) {
  const owner = await connectWs(url, cookie);
  owner.send(JSON.stringify({ type: 'join', room: roomId, name: 'Owner' }));
  await nextMessage(owner, (msg) => msg.type === 'admitted');
  return owner;
}

async function joinAndAdmit(owner: Awaited<ReturnType<typeof connectWs>>, url: string, roomId: string, name: string, mobile: boolean, userAgent: string) {
  const peer = await connectWs(url, undefined, { 'User-Agent': userAgent });
  peer.send(JSON.stringify({ type: 'join', room: roomId, name, mobile }));
  const knocking = await nextMessage(peer, (msg) => msg.type === 'knocking');
  await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === knocking.clientId);
  owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
  await nextMessage(peer, (msg) => msg.type === 'admitted');
  await nextMessage(owner, (msg) => msg.type === 'peer-joined' && msg.clientId === knocking.clientId);
  return peer;
}

describe('signaling mobile cap', () => {
  it('S5.3 admits 4 client-declared mobile peers and rejects the 5th mobile peer', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Mobile cap', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id);
    const peers = [];

    for (let i = 0; i < 4; i += 1) {
      peers.push(await joinAndAdmit(owner, url, room.id, `mobile-${i}`, true, DESKTOP_UA));
    }

    const fifth = await connectWs(url, undefined, { 'User-Agent': MOBILE_UA });
    const closed = new Promise<void>((resolve) => fifth.once('close', () => resolve()));
    fifth.send(JSON.stringify({ type: 'join', room: room.id, name: 'mobile-5', mobile: true }));
    const error = await nextMessage(fifth);
    await closed;

    expect(error).toEqual({ type: 'error', error: 'mobile room full (4 max)' });
    closeWs(fifth);
    for (const peer of peers) closeWs(peer);
    closeWs(owner);
    await closeServer(server);
  });

  it('S5.5 stacks the mobile cap with the global 8-peer cap', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Mixed cap', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id);
    const peers = [];

    for (let i = 0; i < 4; i += 1) {
      peers.push(await joinAndAdmit(owner, url, room.id, `mobile-${i}`, true, DESKTOP_UA));
    }
    for (let i = 0; i < 2; i += 1) {
      peers.push(await joinAndAdmit(owner, url, room.id, `desktop-${i}`, false, MOBILE_UA));
    }

    const fifthMobile = await connectWs(url);
    const fifthMobileClosed = new Promise<void>((resolve) => fifthMobile.once('close', () => resolve()));
    fifthMobile.send(JSON.stringify({ type: 'join', room: room.id, name: 'mobile-blocked', mobile: true }));
    const mobileError = await nextMessage(fifthMobile);
    await fifthMobileClosed;
    expect(mobileError).toEqual({ type: 'error', error: 'mobile room full (4 max)' });

    const eighthDesktop = await joinAndAdmit(owner, url, room.id, 'desktop-2', false, DESKTOP_UA);
    peers.push(eighthDesktop);

    const ninthDesktop = await connectWs(url);
    const ninthDesktopClosed = new Promise<void>((resolve) => ninthDesktop.once('close', () => resolve()));
    ninthDesktop.send(JSON.stringify({ type: 'join', room: room.id, name: 'desktop-5', mobile: false }));
    const roomFull = await nextMessage(ninthDesktop);
    await ninthDesktopClosed;
    expect(roomFull).toEqual({ type: 'error', error: 'room full (max 8)' });

    closeWs(fifthMobile);
    closeWs(ninthDesktop);
    for (const peer of peers) closeWs(peer);
    closeWs(owner);
    await closeServer(server);
  });
});
