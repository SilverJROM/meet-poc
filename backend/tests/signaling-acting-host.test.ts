import { WebSocket } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { getHostClientId } from '../src/modules/signaling/index.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, dropWs, nextMessage, startWsServer } from './signaling-helpers.js';

type JoinedPeer = {
  ws: WebSocket;
  clientId: string;
  participantId: string;
};

async function joinActingHost(url: string, roomId: string, name = 'Acting Host'): Promise<JoinedPeer> {
  const ws = await connectWs(url);
  ws.send(JSON.stringify({ type: 'join', room: roomId, name }));
  const admitted = await nextMessage(ws, (msg) => msg.type === 'admitted');
  return { ws, clientId: String(admitted.clientId), participantId: String(admitted.participantId) };
}

async function joinOwner(url: string, cookie: string, roomId: string): Promise<JoinedPeer> {
  const ws = await connectWs(url, cookie);
  ws.send(JSON.stringify({ type: 'join', room: roomId, name: 'Owner' }));
  const admitted = await nextMessage(ws, (msg) => msg.type === 'admitted');
  return { ws, clientId: String(admitted.clientId), participantId: String(admitted.participantId) };
}

async function joinAndAdmitByHost(host: WebSocket, url: string, roomId: string, name: string): Promise<JoinedPeer> {
  const ws = await connectWs(url);
  ws.send(JSON.stringify({ type: 'join', room: roomId, name }));
  const knocking = await nextMessage(ws, (msg) => msg.type === 'knocking');
  await nextMessage(host, (msg) => msg.type === 'knock' && msg.clientId === knocking.clientId);
  host.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
  const admitted = await nextMessage(ws, (msg) => msg.type === 'admitted');
  await nextMessage(host, (msg) => msg.type === 'peer-joined' && msg.clientId === knocking.clientId);
  return { ws, clientId: String(admitted.clientId), participantId: String(admitted.participantId) };
}

describe('signaling acting host handoff', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('admits the first open-room guest as acting host and lets them admit later guests', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Open room', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const { server, url } = await startWsServer(db);

    const acting = await joinActingHost(url, room.id);
    expect(getHostClientId(room.id, db)).toBe(acting.clientId);

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest B' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    const knock = await nextMessage(acting.ws, (msg) => msg.type === 'knock');
    acting.ws.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const admitted = await nextMessage(guest, (msg) => msg.type === 'admitted');

    expect(knock).toEqual({ type: 'knock', clientId: knocking.clientId, name: 'Guest B' });
    expect(admitted).toMatchObject({
      type: 'admitted',
      clientId: knocking.clientId,
      isOwner: false,
      hostClientId: acting.clientId,
      peers: [{ id: acting.clientId, participantId: acting.participantId, name: 'Acting Host', host: true, isMobile: false }],
    });

    closeWs(guest);
    closeWs(acting.ws);
    await closeServer(server);
  });

  it('transfers host authority to the owner when the owner joins', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Owner transfer', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    const acting = await joinActingHost(url, room.id);
    const guest = await joinAndAdmitByHost(acting.ws, url, room.id, 'Guest B');
    const demotionPromise = nextMessage(acting.ws, (msg) => msg.type === 'host-role' && msg.clientId === acting.clientId);
    const ownerJoinedPromise = nextMessage(guest.ws, (msg) => msg.type === 'peer-joined');
    const owner = await joinOwner(url, ownerCookie, room.id);
    const demotion = await demotionPromise;
    const ownerJoined = await ownerJoinedPromise;

    expect(demotion).toEqual({ type: 'host-role', clientId: acting.clientId, isHost: false });
    expect(ownerJoined).toMatchObject({ type: 'peer-joined', clientId: owner.clientId, name: 'Owner', host: true });
    expect(getHostClientId(room.id, db)).toBe(owner.clientId);

    closeWs(owner.ws);
    closeWs(guest.ws);
    closeWs(acting.ws);
    await closeServer(server);
  });

  it('promotes the next admitted guest when the acting host leaves before owner arrival', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Acting promotion', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const { server, url } = await startWsServer(db);

    const acting = await joinActingHost(url, room.id, 'Guest A');
    const nextHost = await joinAndAdmitByHost(acting.ws, url, room.id, 'Guest B');
    closeWs(acting.ws);
    const promotion = await nextMessage(nextHost.ws, (msg) => msg.type === 'host-role' && msg.clientId === nextHost.clientId);

    const guestC = await connectWs(url);
    guestC.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest C' }));
    const knocking = await nextMessage(guestC, (msg) => msg.type === 'knocking');
    const knock = await nextMessage(nextHost.ws, (msg) => msg.type === 'knock' && msg.clientId === knocking.clientId);
    nextHost.ws.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const admitted = await nextMessage(guestC, (msg) => msg.type === 'admitted');

    expect(promotion).toEqual({ type: 'host-role', clientId: nextHost.clientId, isHost: true });
    expect(knock).toEqual({ type: 'knock', clientId: knocking.clientId, name: 'Guest C' });
    expect(admitted).toMatchObject({ type: 'admitted', clientId: knocking.clientId, hostClientId: nextHost.clientId });

    closeWs(guestC);
    closeWs(nextHost.ws);
    await closeServer(server);
  });

  it('promotes an admitted guest after the owner disconnects and reconnect grace expires', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Owner grace promotion', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    const owner = await joinOwner(url, ownerCookie, room.id);
    const guest = await joinAndAdmitByHost(owner.ws, url, room.id, 'Guest A');
    expect(getHostClientId(room.id, db)).toBe(owner.clientId);

    vi.useFakeTimers();
    const ownerReconnectingPromise = nextMessage(guest.ws, (msg) => msg.type === 'peer-reconnecting' && msg.clientId === owner.clientId);
    dropWs(owner.ws);
    await ownerReconnectingPromise;
    expect(getHostClientId(room.id, db)).toBeNull();

    const pending = await connectWs(url);
    pending.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest B' }));
    const knocking = await nextMessage(pending, (msg) => msg.type === 'knocking');

    const guestMessages: Record<string, unknown>[] = [];
    const collectGuestMessage = (raw: WebSocket.RawData) => {
      guestMessages.push(JSON.parse(String(raw)) as Record<string, unknown>);
    };
    guest.ws.on('message', collectGuestMessage);
    await vi.advanceTimersByTimeAsync(120_001);
    guest.ws.off('message', collectGuestMessage);
    const ownerLeft = guestMessages.find((msg) => msg.type === 'peer-left' && msg.clientId === owner.clientId);
    const promotion = guestMessages.find((msg) => msg.type === 'host-role' && msg.clientId === guest.clientId);

    expect(ownerLeft).toEqual({ type: 'peer-left', clientId: owner.clientId, participantId: owner.participantId });
    expect(promotion).toEqual({ type: 'host-role', clientId: guest.clientId, isHost: true });
    expect(getHostClientId(room.id, db)).toBe(guest.clientId);

    guest.ws.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const admitted = await nextMessage(pending, (msg) => msg.type === 'admitted');
    expect(admitted).toMatchObject({ type: 'admitted', clientId: knocking.clientId, hostClientId: guest.clientId });

    vi.useRealTimers();
    closeWs(pending);
    closeWs(guest.ws);
    await closeServer(server);
  });
});
