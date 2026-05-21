import { describe, expect, it } from 'vitest';
import type { WebSocket as WsType, RawData } from 'ws';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, startWsServer } from './signaling-helpers.js';

type WsMsg = Record<string, unknown>;

/**
 * Buffered message queue — avoids the race where admitted+sfu-roster arrive
 * in the same TCP read and the second nextMessage call misses the event.
 */
function makeQueue(ws: WsType): {
  next: (predicate?: (m: WsMsg) => boolean, timeoutMs?: number) => Promise<WsMsg>;
} {
  const buffer: WsMsg[] = [];
  const waiters: {
    predicate: (m: WsMsg) => boolean;
    resolve: (m: WsMsg) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];

  ws.on('message', (raw: RawData) => {
    const msg = JSON.parse(String(raw)) as WsMsg;
    for (let i = 0; i < waiters.length; i++) {
      if (waiters[i].predicate(msg)) {
        const [waiter] = waiters.splice(i, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
        return;
      }
    }
    buffer.push(msg);
  });

  return {
    next(predicate: (m: WsMsg) => boolean = () => true, timeoutMs = 2000): Promise<WsMsg> {
      const idx = buffer.findIndex(predicate);
      if (idx >= 0) return Promise.resolve(buffer.splice(idx, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const i = waiters.findIndex((w) => w.resolve === resolve);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error('timed out waiting for ws message'));
        }, timeoutMs);
        waiters.push({ predicate, resolve, reject, timer });
      });
    },
  };
}

async function admitGuestQ(
  ownerQ: ReturnType<typeof makeQueue>,
  guestWs: WsType,
  guestQ: ReturnType<typeof makeQueue>,
  roomId: string,
  name: string,
): Promise<{ clientId: string; participantId: string }> {
  guestWs.send(JSON.stringify({ type: 'join', room: roomId, name }));
  const knocking = await guestQ.next((m) => m.type === 'knocking');
  await ownerQ.next((m) => m.type === 'knock' && m.clientId === knocking.clientId);
  // ownerWs is the underlying socket — we need it. Pass via closure in the test.
  return { clientId: String(knocking.clientId), participantId: '' };
}

function makeTracks(n = 1): { trackName: string; kind: string }[] {
  return Array.from({ length: n }, (_, i) => ({ trackName: `p:1000:audio:track-${i}`, kind: 'audio' }));
}

describe('signaling sfu-presence', () => {
  it('SR-3a: two clients publish and each sees the other; late joiner gets sfu-roster with both', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('SFU room', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    const ownerWs = await connectWs(url, ownerCookie);
    const ownerQ = makeQueue(ownerWs);
    ownerWs.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    const ownerAdmitted = await ownerQ.next((m) => m.type === 'admitted');
    // sfu-roster buffered alongside admitted — drain it
    const ownerRoster0 = await ownerQ.next((m) => m.type === 'sfu-roster');
    expect(ownerRoster0).toMatchObject({ type: 'sfu-roster', publishers: [] });

    const guestWs = await connectWs(url);
    const guestQ = makeQueue(guestWs);
    guestWs.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const guestKnocking = await guestQ.next((m) => m.type === 'knocking');
    await ownerQ.next((m) => m.type === 'knock' && m.clientId === guestKnocking.clientId);
    ownerWs.send(JSON.stringify({ type: 'admit', clientId: guestKnocking.clientId }));
    const guestAdmitted = await guestQ.next((m) => m.type === 'admitted');
    const guestRoster0 = await guestQ.next((m) => m.type === 'sfu-roster');
    await ownerQ.next((m) => m.type === 'peer-joined' && m.clientId === guestAdmitted.clientId);
    expect(guestRoster0).toMatchObject({ type: 'sfu-roster', publishers: [] });

    // Owner publishes
    const ownerTracks = makeTracks(2);
    ownerWs.send(JSON.stringify({ type: 'sfu-publish', cfSessionId: 'cf-owner-session-1', tracks: ownerTracks }));
    const guestSeesOwner = await guestQ.next((m) => m.type === 'sfu-presence');
    expect(guestSeesOwner).toMatchObject({
      type: 'sfu-presence',
      clientId: ownerAdmitted.clientId,
      cfSessionId: 'cf-owner-session-1',
      tracks: ownerTracks,
    });
    expect(typeof guestSeesOwner.revision).toBe('number');
    const ownerRevision = guestSeesOwner.revision as number;
    expect(ownerRevision >= 1).toBe(true);

    // Guest publishes
    const guestTracks = makeTracks(1);
    const guestClientId = String(guestAdmitted.clientId);
    guestWs.send(JSON.stringify({ type: 'sfu-publish', cfSessionId: 'cf-guest-session-2', tracks: guestTracks }));
    const ownerSeesGuest = await ownerQ.next((m) => m.type === 'sfu-presence');
    expect(ownerSeesGuest).toMatchObject({
      type: 'sfu-presence',
      clientId: guestClientId,
      cfSessionId: 'cf-guest-session-2',
      tracks: guestTracks,
    });
    expect((ownerSeesGuest.revision as number) > ownerRevision).toBe(true);

    // Late joiner receives sfu-roster with both publishers
    const lateWs = await connectWs(url);
    const lateQ = makeQueue(lateWs);
    lateWs.send(JSON.stringify({ type: 'join', room: room.id, name: 'Late' }));
    const lateKnocking = await lateQ.next((m) => m.type === 'knocking');
    await ownerQ.next((m) => m.type === 'knock' && m.clientId === lateKnocking.clientId);
    ownerWs.send(JSON.stringify({ type: 'admit', clientId: lateKnocking.clientId }));
    await lateQ.next((m) => m.type === 'admitted');
    const lateRoster = await lateQ.next((m) => m.type === 'sfu-roster');
    await ownerQ.next((m) => m.type === 'peer-joined' && m.clientId === lateKnocking.clientId);

    const publishers = lateRoster.publishers as { clientId: string; cfSessionId: string }[];
    expect(publishers.length).toBe(2);
    expect(publishers.some((p) => p.cfSessionId === 'cf-owner-session-1')).toBe(true);
    expect(publishers.some((p) => p.cfSessionId === 'cf-guest-session-2')).toBe(true);

    closeWs(lateWs);
    closeWs(guestWs);
    closeWs(ownerWs);
    await closeServer(server);
  });

  it('SR-3b: revision increments monotonically on repeated sfu-publish from the same client', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('SFU revision', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    const ownerWs = await connectWs(url, ownerCookie);
    const ownerQ = makeQueue(ownerWs);
    ownerWs.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    await ownerQ.next((m) => m.type === 'admitted');
    await ownerQ.next((m) => m.type === 'sfu-roster');

    const guestWs = await connectWs(url);
    const guestQ = makeQueue(guestWs);
    guestWs.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const guestKnocking = await guestQ.next((m) => m.type === 'knocking');
    await ownerQ.next((m) => m.type === 'knock' && m.clientId === guestKnocking.clientId);
    ownerWs.send(JSON.stringify({ type: 'admit', clientId: guestKnocking.clientId }));
    await guestQ.next((m) => m.type === 'admitted');
    await guestQ.next((m) => m.type === 'sfu-roster');
    await ownerQ.next((m) => m.type === 'peer-joined');

    // Owner publishes once
    ownerWs.send(JSON.stringify({ type: 'sfu-publish', cfSessionId: 'cf-owner-1', tracks: makeTracks(1) }));
    const first = await guestQ.next((m) => m.type === 'sfu-presence');
    const rev1 = first.revision as number;

    // Owner publishes again (track update)
    ownerWs.send(JSON.stringify({ type: 'sfu-publish', cfSessionId: 'cf-owner-1', tracks: makeTracks(2) }));
    const second = await guestQ.next((m) => m.type === 'sfu-presence');
    const rev2 = second.revision as number;

    expect(rev2).toBeGreaterThan(rev1);

    closeWs(guestWs);
    closeWs(ownerWs);
    await closeServer(server);
  });

  it('SR-3c: peer leaving clears its roster entry for new joiners', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('SFU leave', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    const ownerWs = await connectWs(url, ownerCookie);
    const ownerQ = makeQueue(ownerWs);
    ownerWs.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    await ownerQ.next((m) => m.type === 'admitted');
    await ownerQ.next((m) => m.type === 'sfu-roster');

    const guestWs = await connectWs(url);
    const guestQ = makeQueue(guestWs);
    guestWs.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const guestKnocking = await guestQ.next((m) => m.type === 'knocking');
    await ownerQ.next((m) => m.type === 'knock' && m.clientId === guestKnocking.clientId);
    ownerWs.send(JSON.stringify({ type: 'admit', clientId: guestKnocking.clientId }));
    const guestAdmitted = await guestQ.next((m) => m.type === 'admitted');
    await guestQ.next((m) => m.type === 'sfu-roster');
    await ownerQ.next((m) => m.type === 'peer-joined');
    const guestClientId = String(guestAdmitted.clientId);

    // Both publish
    ownerWs.send(JSON.stringify({ type: 'sfu-publish', cfSessionId: 'cf-owner-x', tracks: makeTracks(1) }));
    await guestQ.next((m) => m.type === 'sfu-presence');
    guestWs.send(JSON.stringify({ type: 'sfu-publish', cfSessionId: 'cf-guest-x', tracks: makeTracks(1) }));
    await ownerQ.next((m) => m.type === 'sfu-presence');

    // Guest leaves (send explicit leave then close to avoid reconnect grace ambiguity)
    guestWs.send(JSON.stringify({ type: 'leave' }));
    await ownerQ.next((m) => m.type === 'peer-left' || m.type === 'peer-reconnecting');

    // Late joiner sees only owner's entry
    const lateWs = await connectWs(url);
    const lateQ = makeQueue(lateWs);
    lateWs.send(JSON.stringify({ type: 'join', room: room.id, name: 'Late' }));
    const lateKnocking = await lateQ.next((m) => m.type === 'knocking');
    await ownerQ.next((m) => m.type === 'knock' && m.clientId === lateKnocking.clientId);
    ownerWs.send(JSON.stringify({ type: 'admit', clientId: lateKnocking.clientId }));
    await lateQ.next((m) => m.type === 'admitted');
    const lateRoster = await lateQ.next((m) => m.type === 'sfu-roster');
    await ownerQ.next((m) => m.type === 'peer-joined' && m.clientId === lateKnocking.clientId);

    const publishers = lateRoster.publishers as { clientId: string; cfSessionId: string }[];
    expect(publishers.every((p) => p.clientId !== guestClientId)).toBe(true);
    expect(publishers.some((p) => p.cfSessionId === 'cf-owner-x')).toBe(true);

    closeWs(lateWs);
    closeWs(ownerWs);
    await closeServer(server);
  });
});
