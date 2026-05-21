import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';

async function joinOwner(url: string, cookie: string, roomId: string, mobile = false) {
  const owner = await connectWs(url, cookie, mobile ? { 'User-Agent': MOBILE_UA } : undefined);
  owner.send(JSON.stringify({ type: 'join', room: roomId, name: 'Owner', mobile }));
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
  it('S5.3 admits 5 mobile peers (no SFU mobile cap; was mesh DR-50 MAX_MOBILE_ADMITTED=4)', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Mobile cap', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id, true);
    const peers = [];

    // admit 4 more mobile peers (owner + 4 = 5 total) — all must succeed under SFU product cap
    for (let i = 0; i < 4; i += 1) {
      peers.push(await joinAndAdmit(owner, url, room.id, `mobile-${i}`, true, MOBILE_UA));
    }

    expect(peers.length).toBe(4);
    for (const peer of peers) closeWs(peer);
    closeWs(owner);
    await closeServer(server);
  });

  it('S5.5 mobile peers count against the global SFU product cap only (no separate mobile limit)', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Mixed cap', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await joinOwner(url, ownerCookie, room.id);
    const peers = [];

    // admit 5 mobile peers (owner + 5 = 6 total) — previously hit mobile cap at 4+owner=5, now all admitted
    for (let i = 0; i < 5; i += 1) {
      peers.push(await joinAndAdmit(owner, url, room.id, `mobile-${i}`, true, MOBILE_UA));
    }

    expect(peers.length).toBe(5);
    for (const peer of peers) closeWs(peer);
    closeWs(owner);
    await closeServer(server);
  });
});
