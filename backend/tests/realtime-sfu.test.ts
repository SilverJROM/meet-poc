import { config as loadEnv } from 'dotenv';
import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';
import { clearSfuSessionOwnersForTests } from '../src/modules/realtime-sfu/index.js';

// .env lives at the project root, one level up from backend/
loadEnv({ path: '../.env' });
const SFU_TOKEN = process.env.SFU_TOKEN ?? '';

async function admitOwner(url: string, roomId: string, clientKey: string, ownerCookie: string) {
  const ws = await connectWs(url, ownerCookie);
  ws.send(JSON.stringify({ type: 'join', room: roomId, name: 'Owner', clientKey }));
  const admitted = await nextMessage(ws, (msg) => msg.type === 'admitted');
  return {
    ws,
    clientKey,
    participantId: admitted.participantId as string,
    sessionId: admitted.sessionId as string,
  };
}

describe('realtime-sfu proxy', () => {
  afterEach(() => {
    clearSfuSessionOwnersForTests();
    vi.unstubAllGlobals();
  });

  it('B1-1 smoke: creates a real CF session, response has sessionId and token is absent', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('SFU smoke', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    const caller = await admitOwner(url, room.id, 'ck-smoke-1', ownerCookie);

    const res = await request(server)
      .post('/api/sfu/session')
      .send({ clientKey: caller.clientKey, participantId: caller.participantId, sessionId: caller.sessionId });

    expect(
      res.status,
      `CF session create failed (${res.status}) — check SFU_APP_ID/SFU_TOKEN creds and network: ${JSON.stringify(res.body)}`,
    ).toBe(200);
    expect(typeof res.body.sessionId, 'sessionId should be a string').toBe('string');
    expect(res.body.sessionId.length, 'sessionId should be non-empty').toBeGreaterThan(0);
    // Token must never appear in any response field
    if (SFU_TOKEN) expect(JSON.stringify(res.body)).not.toContain(SFU_TOKEN);

    closeWs(caller.ws);
    await closeServer(server);
  });

  it('B1-2 CF 4xx passthrough: error description returned, token never leaked', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('SFU error', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    const caller = await admitOwner(url, room.id, 'ck-error-1', ownerCookie);

    // Stub fetch so the CF call returns a 400 with an errorDescription
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 400,
      json: async () => ({ errorDescription: 'test-cf-error' }),
    }));

    const res = await request(server)
      .post('/api/sfu/session')
      .send({ clientKey: caller.clientKey, participantId: caller.participantId, sessionId: caller.sessionId });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('test-cf-error');
    if (SFU_TOKEN) expect(JSON.stringify(res.body)).not.toContain(SFU_TOKEN);

    closeWs(caller.ws);
    await closeServer(server);
  });

  it('B1-3 authz: unadmitted → 403; admitted caller with foreign cfSessionId → 403', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('SFU authz', 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    // (a) completely unadmitted caller
    const resUnauth = await request(server)
      .post('/api/sfu/session')
      .send({ clientKey: 'not-real-key', participantId: 'not-real-pid', sessionId: 'not-real-session' });
    expect(resUnauth.status).toBe(403);

    // (b) admitted caller tries to operate on a cfSessionId it does not own
    const caller = await admitOwner(url, room.id, 'ck-authz-1', ownerCookie);
    const resForeign = await request(server)
      .post('/api/sfu/tracks')
      .send({
        clientKey: caller.clientKey,
        participantId: caller.participantId,
        sessionId: caller.sessionId,
        cfSessionId: 'foreign-session-not-in-owners',
      });
    expect(resForeign.status).toBe(403);

    closeWs(caller.ws);
    await closeServer(server);
  });
});
