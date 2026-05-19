import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';

describe('signaling mobile cap', () => {
  it('S5.3 admits 4 client-declared mobile peers and rejects the 5th mobile peer', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Mobile cap', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const peers = [];

    for (let i = 0; i < 4; i += 1) {
      const peer = await connectWs(url, ownerCookie, { 'User-Agent': DESKTOP_UA });
      peer.send(JSON.stringify({ type: 'join', room: room.id, name: `mobile-${i}`, mobile: true }));
      await nextMessage(peer, (msg) => msg.type === 'admitted');
      peers.push(peer);
    }

    const fifth = await connectWs(url, ownerCookie, { 'User-Agent': MOBILE_UA });
    const closed = new Promise<void>((resolve) => fifth.once('close', () => resolve()));
    fifth.send(JSON.stringify({ type: 'join', room: room.id, name: 'mobile-5', mobile: true }));
    const error = await nextMessage(fifth);
    await closed;

    expect(error).toEqual({ type: 'error', error: 'mobile room full (4 max)' });
    closeWs(fifth);
    for (const peer of peers) closeWs(peer);
    await closeServer(server);
  });

  it('S5.5 stacks the mobile cap with the global 8-peer cap', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Mixed cap', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const peers = [];

    for (let i = 0; i < 4; i += 1) {
      const peer = await connectWs(url, ownerCookie, { 'User-Agent': DESKTOP_UA });
      peer.send(JSON.stringify({ type: 'join', room: room.id, name: `mobile-${i}`, mobile: true }));
      await nextMessage(peer, (msg) => msg.type === 'admitted');
      peers.push(peer);
    }
    for (let i = 0; i < 3; i += 1) {
      const peer = await connectWs(url, ownerCookie, { 'User-Agent': MOBILE_UA });
      peer.send(JSON.stringify({ type: 'join', room: room.id, name: `desktop-${i}`, mobile: false }));
      await nextMessage(peer, (msg) => msg.type === 'admitted');
      peers.push(peer);
    }

    const fifthMobile = await connectWs(url, ownerCookie);
    const fifthMobileClosed = new Promise<void>((resolve) => fifthMobile.once('close', () => resolve()));
    fifthMobile.send(JSON.stringify({ type: 'join', room: room.id, name: 'mobile-blocked', mobile: true }));
    const mobileError = await nextMessage(fifthMobile);
    await fifthMobileClosed;
    expect(mobileError).toEqual({ type: 'error', error: 'mobile room full (4 max)' });

    const eighthDesktop = await connectWs(url, ownerCookie);
    eighthDesktop.send(JSON.stringify({ type: 'join', room: room.id, name: 'desktop-4', mobile: false }));
    await nextMessage(eighthDesktop, (msg) => msg.type === 'admitted');
    peers.push(eighthDesktop);

    const ninthDesktop = await connectWs(url, ownerCookie);
    const ninthDesktopClosed = new Promise<void>((resolve) => ninthDesktop.once('close', () => resolve()));
    ninthDesktop.send(JSON.stringify({ type: 'join', room: room.id, name: 'desktop-5', mobile: false }));
    const roomFull = await nextMessage(ninthDesktop);
    await ninthDesktopClosed;
    expect(roomFull).toEqual({ type: 'error', error: 'room full (max 8)' });

    closeWs(fifthMobile);
    closeWs(ninthDesktop);
    for (const peer of peers) closeWs(peer);
    await closeServer(server);
  });
});
