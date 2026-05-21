import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, dropWs, nextMessage, startWsServer } from './signaling-helpers.js';

describe('signaling reconnect', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resumes a previously admitted guest with an opt-in reconnect token', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const ownerAdmittedPromise = nextMessage(owner, (msg) => msg.type === 'admitted');
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const ownerAdmitted = await ownerAdmittedPromise;
    await ownerTokenPromise;

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    const guestAdmittedPromise = nextMessage(guest, (msg) => msg.type === 'admitted');
    const guestTokenPromise = nextMessage(guest, (msg) => msg.type === 'reconnect-token');
    const peerJoinedPromise = nextMessage(owner, (msg) => msg.type === 'peer-joined');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const guestAdmitted = await guestAdmittedPromise;
    const guestToken = await guestTokenPromise;
    await peerJoinedPromise;
    const peerReconnectingPromise = nextMessage(owner, (msg) => msg.type === 'peer-reconnecting' && msg.clientId === knocking.clientId);
    dropWs(guest);
    await peerReconnectingPromise;

    const resumed = await connectWs(url);
    resumed.send(
      JSON.stringify({
        type: 'join',
        room: room.id,
        name: 'Guest',
        supportsReconnect: true,
        reconnectToken: guestToken.token,
      }),
    );
    const resumedAdmitted = await nextMessage(resumed, (msg) => msg.type === 'admitted');
    const rejoin = await nextMessage(owner, (msg) => msg.type === 'peer-resumed');

    expect(resumedAdmitted).toMatchObject({
      type: 'admitted',
      roomTitle: 'Team sync',
      isOwner: false,
      hostClientId: ownerAdmitted.clientId,
      participantId: guestAdmitted.participantId,
      peers: [{ id: ownerAdmitted.clientId, participantId: ownerAdmitted.participantId, name: 'Owner', host: true }],
    });
    expect(resumedAdmitted.clientId).not.toBe(knocking.clientId);
    expect(rejoin).toEqual({
      type: 'peer-resumed',
      oldClientId: knocking.clientId,
      clientId: resumedAdmitted.clientId,
      participantId: guestAdmitted.participantId,
      name: 'Guest',
      host: false,
    });

    closeWs(resumed);
    closeWs(owner);
    await closeServer(server);
  });

  it('resumes a reconnecting guest by persistent clientKey without a reconnect token', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Client key reconnect', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    await ownerTokenPromise;

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'guest-client-key' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    const guestAdmittedPromise = nextMessage(guest, (msg) => msg.type === 'admitted');
    const guestTokenPromise = nextMessage(guest, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const guestAdmitted = await guestAdmittedPromise;
    await guestTokenPromise;
    await nextMessage(owner, (msg) => msg.type === 'peer-joined');

    const peerReconnectingPromise = nextMessage(owner, (msg) => msg.type === 'peer-reconnecting' && msg.clientId === knocking.clientId);
    dropWs(guest);
    await peerReconnectingPromise;

    const resumed = await connectWs(url);
    resumed.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'guest-client-key' }));
    const resumedAdmitted = await nextMessage(resumed, (msg) => msg.type === 'admitted');
    const resumedNotice = await nextMessage(owner, (msg) => msg.type === 'peer-resumed');

    expect(resumedAdmitted).toMatchObject({
      type: 'admitted',
      isOwner: false,
      participantId: guestAdmitted.participantId,
      hostClientId: ownerAdmitted.clientId,
    });
    expect(resumedNotice).toEqual({
      type: 'peer-resumed',
      oldClientId: knocking.clientId,
      clientId: resumedAdmitted.clientId,
      participantId: guestAdmitted.participantId,
      name: 'Guest',
      host: false,
    });

    closeWs(resumed);
    closeWs(owner);
    await closeServer(server);
  });

  it('auto-admits a durable admitted clientKey after reconnect grace removes the old peer', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Durable client key', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    await ownerTokenPromise;

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'durable-client-key' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    const guestAdmittedPromise = nextMessage(guest, (msg) => msg.type === 'admitted');
    const guestTokenPromise = nextMessage(guest, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const guestAdmitted = await guestAdmittedPromise;
    await guestTokenPromise;
    await nextMessage(owner, (msg) => msg.type === 'peer-joined');

    vi.useFakeTimers();
    const peerReconnectingPromise = nextMessage(owner, (msg) => msg.type === 'peer-reconnecting' && msg.clientId === knocking.clientId);
    guest.terminate();
    await peerReconnectingPromise;
    await vi.advanceTimersByTimeAsync(120_001);
    vi.useRealTimers();

    const returned = await connectWs(url);
    returned.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'durable-client-key' }));
    const returnedAdmitted = await nextMessage(returned, (msg) => msg.type === 'admitted');
    await nextMessage(owner, (msg) => msg.type === 'peer-joined' && msg.clientId === returnedAdmitted.clientId);

    expect(returnedAdmitted).toMatchObject({
      type: 'admitted',
      isOwner: false,
      participantId: guestAdmitted.participantId,
      hostClientId: ownerAdmitted.clientId,
    });
    expect(returnedAdmitted.clientId).not.toBe(knocking.clientId);

    closeWs(returned);
    closeWs(owner);
    await closeServer(server);
  });

  it('requires re-admit after an explicit leave message, then clears the revoke on owner admit', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Explicit leave revoke', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    await ownerTokenPromise;

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'leave-rejoin-key' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === knocking.clientId);
    const guestAdmittedPromise = nextMessage(guest, (msg) => msg.type === 'admitted');
    const guestTokenPromise = nextMessage(guest, (msg) => msg.type === 'reconnect-token');
    const guestJoinedPromise = nextMessage(owner, (msg) => msg.type === 'peer-joined');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const guestAdmitted = await guestAdmittedPromise;
    await guestTokenPromise;
    await guestJoinedPromise;

    guest.send(JSON.stringify({ type: 'leave' }));
    await nextMessage(owner, (msg) => msg.type === 'peer-left' && msg.clientId === guestAdmitted.clientId);

    const returned = await connectWs(url);
    returned.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'leave-rejoin-key' }));
    const returnedKnocking = await nextMessage(returned, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === returnedKnocking.clientId);
    const returnedAdmittedPromise = nextMessage(returned, (msg) => msg.type === 'admitted');
    const returnedTokenPromise = nextMessage(returned, (msg) => msg.type === 'reconnect-token');
    const returnedJoinedPromise = nextMessage(owner, (msg) => msg.type === 'peer-joined');
    owner.send(JSON.stringify({ type: 'admit', clientId: returnedKnocking.clientId }));
    const returnedAdmitted = await returnedAdmittedPromise;
    await returnedTokenPromise;
    await returnedJoinedPromise;

    const peerReconnectingPromise = nextMessage(owner, (msg) => msg.type === 'peer-reconnecting' && msg.clientId === returnedAdmitted.clientId);
    dropWs(returned);
    await peerReconnectingPromise;

    const resumed = await connectWs(url);
    resumed.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'leave-rejoin-key' }));
    const resumedAdmitted = await nextMessage(resumed, (msg) => msg.type === 'admitted');
    await nextMessage(owner, (msg) => msg.type === 'peer-resumed');

    expect(resumedAdmitted).toMatchObject({
      type: 'admitted',
      isOwner: false,
      participantId: returnedAdmitted.participantId,
      hostClientId: ownerAdmitted.clientId,
    });

    closeWs(resumed);
    closeWs(owner);
    await closeServer(server);
  });

  it('treats any bare socket close code or reason as a drop, not an explicit leave', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Close code is drop', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    await ownerTokenPromise;

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'close-code-drop-key' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === knocking.clientId);
    const guestAdmittedPromise = nextMessage(guest, (msg) => msg.type === 'admitted');
    const guestTokenPromise = nextMessage(guest, (msg) => msg.type === 'reconnect-token');
    const guestJoinedPromise = nextMessage(owner, (msg) => msg.type === 'peer-joined');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const guestAdmitted = await guestAdmittedPromise;
    await guestTokenPromise;
    await guestJoinedPromise;

    const peerReconnectingPromise = nextMessage(owner, (msg) => msg.type === 'peer-reconnecting' && msg.clientId === guestAdmitted.clientId);
    guest.close(4001, 'explicit leave');
    await peerReconnectingPromise;

    const resumed = await connectWs(url);
    resumed.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'close-code-drop-key' }));
    const resumedAdmitted = await nextMessage(resumed, (msg) => msg.type === 'admitted');
    await nextMessage(owner, (msg) => msg.type === 'peer-resumed');

    expect(resumedAdmitted).toMatchObject({
      type: 'admitted',
      isOwner: false,
      participantId: guestAdmitted.participantId,
      hostClientId: ownerAdmitted.clientId,
    });

    closeWs(resumed);
    closeWs(owner);
    await closeServer(server);
  });

  it('terminates a heartbeat-stale admitted socket as a drop that can resume by clientKey', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Heartbeat stale resume', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db, { heartbeat: { intervalMs: 20, missesBeforeTerminate: 2 } });
    const owner = await connectWs(url, ownerCookie);
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    await ownerTokenPromise;

    const guest = await connectWs(url, undefined, {}, { autoPong: false });
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'heartbeat-drop-key' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === knocking.clientId);
    const guestAdmittedPromise = nextMessage(guest, (msg) => msg.type === 'admitted');
    const guestTokenPromise = nextMessage(guest, (msg) => msg.type === 'reconnect-token');
    const guestJoinedPromise = nextMessage(owner, (msg) => msg.type === 'peer-joined');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const guestAdmitted = await guestAdmittedPromise;
    await guestTokenPromise;
    await guestJoinedPromise;

    const peerReconnectingPromise = nextMessage(owner, (msg) => msg.type === 'peer-reconnecting' && msg.clientId === guestAdmitted.clientId);
    await peerReconnectingPromise;

    const resumed = await connectWs(url);
    resumed.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'heartbeat-drop-key' }));
    const resumedAdmitted = await nextMessage(resumed, (msg) => msg.type === 'admitted');
    await nextMessage(owner, (msg) => msg.type === 'peer-resumed');

    expect(resumedAdmitted).toMatchObject({
      type: 'admitted',
      isOwner: false,
      participantId: guestAdmitted.participantId,
      hostClientId: ownerAdmitted.clientId,
    });

    guest.terminate();
    closeWs(resumed);
    closeWs(owner);
    await closeServer(server);
  });

  it('creates a new participantId for an unknown persistent clientKey', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Unknown client key', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    await nextMessage(owner, (msg) => msg.type === 'admitted');

    const first = await connectWs(url);
    first.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest One', clientKey: 'first-client-key' }));
    const firstKnock = await nextMessage(first, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    const firstAdmittedPromise = nextMessage(first, (msg) => msg.type === 'admitted');
    owner.send(JSON.stringify({ type: 'admit', clientId: firstKnock.clientId }));
    const firstAdmitted = await firstAdmittedPromise;
    await nextMessage(owner, (msg) => msg.type === 'peer-joined' && msg.clientId === firstAdmitted.clientId);

    const second = await connectWs(url);
    second.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest Two', clientKey: 'second-client-key' }));
    const secondKnock = await nextMessage(second, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock' && msg.clientId === secondKnock.clientId);
    const secondAdmittedPromise = nextMessage(second, (msg) => msg.type === 'admitted');
    owner.send(JSON.stringify({ type: 'admit', clientId: secondKnock.clientId }));
    const secondAdmitted = await secondAdmittedPromise;

    expect(secondAdmitted.participantId).toEqual(expect.any(String));
    expect(secondAdmitted.participantId).not.toBe(firstAdmitted.participantId);

    closeWs(second);
    closeWs(first);
    closeWs(owner);
    await closeServer(server);
  });

  it('does not let an unadmitted guest bypass knocking with a bogus token', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Team sync', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const ownerAdmittedPromise = nextMessage(owner, (msg) => msg.type === 'admitted');
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    await ownerAdmittedPromise;
    await ownerTokenPromise;

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, reconnectToken: 'not-real' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');

    expect(knocking).toMatchObject({ type: 'knocking', roomTitle: 'Team sync' });

    closeWs(guest);
    closeWs(owner);
    await closeServer(server);
  });

  it('resumes a tokened guest before the old socket close handler runs', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Guest race', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    await ownerTokenPromise;

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    const guestAdmittedPromise = nextMessage(guest, (msg) => msg.type === 'admitted');
    const guestTokenPromise = nextMessage(guest, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    const guestAdmitted = await guestAdmittedPromise;
    const guestToken = await guestTokenPromise;
    await nextMessage(owner, (msg) => msg.type === 'peer-joined' && msg.clientId === knocking.clientId);

    const oldClosed = new Promise<void>((resolve) => guest.once('close', () => resolve()));
    const resumed = await connectWs(url);
    resumed.send(
      JSON.stringify({
        type: 'join',
        room: room.id,
        name: 'Guest',
        supportsReconnect: true,
        reconnectToken: guestToken.token,
      }),
    );
    const resumedAdmitted = await nextMessage(resumed, (msg) => msg.type === 'admitted');
    const resumedNotice = await nextMessage(owner, (msg) => msg.type === 'peer-resumed');
    await oldClosed;

    expect(resumedAdmitted).toMatchObject({
      type: 'admitted',
      isOwner: false,
      participantId: guestAdmitted.participantId,
      hostClientId: ownerAdmitted.clientId,
    });
    expect(resumedNotice).toEqual({
      type: 'peer-resumed',
      oldClientId: knocking.clientId,
      clientId: resumedAdmitted.clientId,
      participantId: guestAdmitted.participantId,
      name: 'Guest',
      host: false,
    });

    closeWs(resumed);
    closeWs(owner);
    await closeServer(server);
  });

  it('auto-resumes a disconnected owner by ownership without knocking', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Owner reconnect', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    const firstAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');

    dropWs(owner);

    const resumed = await connectWs(url, ownerCookie);
    resumed.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner' }));
    const admitted = await nextMessage(resumed, (msg) => msg.type === 'admitted');

    expect(admitted).toMatchObject({
      type: 'admitted',
      roomTitle: 'Owner reconnect',
      isOwner: true,
      peers: [],
      participantId: firstAdmitted.participantId,
    });
    expect(admitted.clientId).not.toBe(firstAdmitted.clientId);

    closeWs(resumed);
    await closeServer(server);
  });

  it('resumes an owner by stable ownership before the old socket close handler runs', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Owner race', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const firstAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    await ownerTokenPromise;

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    await nextMessage(guest, (msg) => msg.type === 'admitted');
    await nextMessage(owner, (msg) => msg.type === 'peer-joined');

    const oldClosed = new Promise<void>((resolve) => owner.once('close', () => resolve()));
    const resumed = await connectWs(url, ownerCookie);
    resumed.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const admitted = await nextMessage(resumed, (msg) => msg.type === 'admitted');
    const resumedNotice = await nextMessage(guest, (msg) => msg.type === 'peer-resumed');
    await oldClosed;

    expect(admitted).toMatchObject({
      type: 'admitted',
      roomTitle: 'Owner race',
      isOwner: true,
      participantId: firstAdmitted.participantId,
    });
    expect(resumedNotice).toEqual({
      type: 'peer-resumed',
      oldClientId: firstAdmitted.clientId,
      clientId: admitted.clientId,
      participantId: firstAdmitted.participantId,
      name: 'Owner',
      host: true,
    });

    closeWs(guest);
    closeWs(resumed);
    await closeServer(server);
  });

  it('does not let a different user claim a reconnecting guest slot with a stolen token', async () => {
    const db = createTestDb();
    seedUser(db);
    db.prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      'other@silverjrom.app',
      '00:00',
      Date.now(),
      Date.now(),
    );
    const room = createRoom('Secure reconnect', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const otherCookie = `session=${createSession('other@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    const ownerAdmittedPromise = nextMessage(owner, (msg) => msg.type === 'admitted');
    const ownerTokenPromise = nextMessage(owner, (msg) => msg.type === 'reconnect-token');
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    await ownerAdmittedPromise;
    await ownerTokenPromise;

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    const guestAdmittedPromise = nextMessage(guest, (msg) => msg.type === 'admitted');
    const guestTokenPromise = nextMessage(guest, (msg) => msg.type === 'reconnect-token');
    const guestJoinedPromise = nextMessage(owner, (msg) => msg.type === 'peer-joined');
    owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
    await guestAdmittedPromise;
    const guestToken = await guestTokenPromise;
    await guestJoinedPromise;
    dropWs(guest);
    await nextMessage(owner, (msg) => msg.type === 'peer-reconnecting');

    const hijacker = await connectWs(url, otherCookie);
    hijacker.send(JSON.stringify({ type: 'join', room: room.id, name: 'Hijacker', supportsReconnect: true, reconnectToken: guestToken.token }));
    const hijackerState = await nextMessage(hijacker, (msg) => msg.type === 'knocking');

    expect(hijackerState).toMatchObject({ type: 'knocking', roomTitle: 'Secure reconnect' });

    closeWs(hijacker);
    closeWs(owner);
    await closeServer(server);
  });
});
