import request from 'supertest';
import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { runMigrations } from '../src/db.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import {
  getDiagnosticsGloballyEnabled,
  setDiagnosticsGloballyEnabled,
} from '../src/modules/app-settings/store.js';
import { createApp } from '../src/server.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

function insertNonAdmin(db: Database.Database, email: string): void {
  db.prepare(
    'INSERT INTO users (email, password_hash, created_at, updated_at, is_admin) VALUES (?, ?, ?, ?, ?)',
  ).run(email, '00:00', Date.now(), Date.now(), 0);
}

// seedUser() inserts the user AFTER runMigrations, so migration 0010's
// admin-seed UPDATE (which targets pre-existing rows) does not flip it.
// Grant admin explicitly to mirror the deployed superuser state.
function grantAdmin(db: Database.Database, email: string): void {
  db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run(email);
}

function samplePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'sample',
    roomId: 'room',
    roomTitle: 'Diagnostics room',
    clientId: 'owner-client',
    participantId: 'owner-participant',
    clientKey: 'owner-key',
    clientName: 'Owner',
    createdAt: Date.now(),
    wsStatus: 'connected',
    wsReconnectAttempts: 0,
    forceRelay: false,
    manualAudioOnly: false,
    peers: [],
    ...overrides,
  };
}

function diagnosticsCount(db: Database.Database, sessionId: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM meeting_session_diagnostics WHERE session_id = ?').get(sessionId) as {
      n: number;
    }
  ).n;
}

describe('admin diagnostics global kill-switch (R5 / B3b)', () => {
  // A-1 — migration idempotency
  it('A-1 creates app_settings and re-running migrations does not throw', () => {
    const db = createTestDb(); // first runMigrations is inside createTestDb
    expect(() => runMigrations(db)).not.toThrow();

    const tableRow = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'")
      .get();
    expect(tableRow).toBeTruthy();

    const cols = (db.prepare('PRAGMA table_info(app_settings)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('key');
    expect(cols).toContain('value');
    expect(cols).toContain('updated_at');

    const migrationRows = db.prepare("SELECT name FROM _migrations WHERE name = '0012_app_settings.sql'").all();
    expect(migrationRows).toHaveLength(1);
  });

  // A-2 — default ON (absent row), read does not insert
  it('A-2 reads true with no app_settings row and does not insert one', () => {
    const db = createTestDb();
    const count = (db.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number }).n;
    expect(count).toBe(0);

    expect(getDiagnosticsGloballyEnabled(db)).toBe(true);

    const countAfter = (db.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number }).n;
    expect(countAfter).toBe(0);
  });

  // A-3 — admin PUT/GET round-trip + updated_at persisted, single row (upsert)
  it('A-3 admin PUT sets the flag and persists exactly one row with updated_at', async () => {
    const db = createTestDb();
    seedUser(db);
    grantAdmin(db, 'jrom@silverjrom.app');
    const app = createApp(db);
    const adminCookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res1 = await request(app)
      .put('/api/admin/settings/diagnostics')
      .set('Cookie', adminCookie)
      .send({ enabled: false })
      .expect(200);
    expect(res1.body.enabled).toBe(false);
    expect(getDiagnosticsGloballyEnabled(db)).toBe(false);

    const row = db
      .prepare("SELECT value, updated_at FROM app_settings WHERE key = 'diagnostics_globally_enabled'")
      .get() as { value: string; updated_at: number };
    expect(row).toBeTruthy();
    expect(row.value).toBe('0');
    expect(row.updated_at).toBeGreaterThan(0);

    const res2 = await request(app)
      .put('/api/admin/settings/diagnostics')
      .set('Cookie', adminCookie)
      .send({ enabled: true })
      .expect(200);
    expect(res2.body.enabled).toBe(true);
    expect(getDiagnosticsGloballyEnabled(db)).toBe(true);

    const row2 = db
      .prepare("SELECT value FROM app_settings WHERE key = 'diagnostics_globally_enabled'")
      .get() as { value: string };
    expect(row2.value).toBe('1');

    const rowCount = (db.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number }).n;
    expect(rowCount).toBe(1);
  });

  // A-4 — requireAdmin enforced on GET and PUT (no new middleware)
  it('A-4 enforces requireAdmin on GET and PUT (401 no cookie, 403 non-admin, 200 admin)', async () => {
    const db = createTestDb();
    seedUser(db);
    grantAdmin(db, 'jrom@silverjrom.app');
    insertNonAdmin(db, 'plain@example.com');
    const adminCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const plainCookie = `session=${createSession('plain@example.com', db)}`;
    const app = createApp(db);

    await request(app).get('/api/admin/settings/diagnostics').expect(401);
    await request(app).get('/api/admin/settings/diagnostics').set('Cookie', plainCookie).expect(403);
    const getRes = await request(app).get('/api/admin/settings/diagnostics').set('Cookie', adminCookie).expect(200);
    expect(typeof getRes.body.enabled).toBe('boolean');

    await request(app).put('/api/admin/settings/diagnostics').send({ enabled: false }).expect(401);
    await request(app)
      .put('/api/admin/settings/diagnostics')
      .set('Cookie', plainCookie)
      .send({ enabled: false })
      .expect(403);
    await request(app)
      .put('/api/admin/settings/diagnostics')
      .set('Cookie', adminCookie)
      .send({ enabled: false })
      .expect(200);
  });

  // A-5 — POST gate ON (default): admitted poster -> 200 with entry AND row inserted
  it('A-5 global ON: admitted poster gets 200 + entry and the row is persisted', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Diagnostics room', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', clientKey: 'owner-key' }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    const sessionId = String(ownerAdmitted.sessionId);

    expect(diagnosticsCount(db, sessionId)).toBe(0);

    const res = await request(server)
      .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
      .set('Cookie', ownerCookie)
      .send(samplePayload({ clientId: ownerAdmitted.clientId, participantId: ownerAdmitted.participantId }))
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.entry).toBeTruthy();

    expect(diagnosticsCount(db, sessionId)).toBe(1);

    closeWs(owner);
    await closeServer(server);
  });

  // A-6 — POST gate OFF: admitted poster -> 200 {ok:true,persisted:false} AND no row
  it('A-6 global OFF: admitted poster gets {ok:true,persisted:false} and no row is inserted', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Diagnostics room', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', clientKey: 'owner-key' }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    const sessionId = String(ownerAdmitted.sessionId);

    setDiagnosticsGloballyEnabled(false, db);
    const countBefore = diagnosticsCount(db, sessionId);

    const res = await request(server)
      .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
      .set('Cookie', ownerCookie)
      .send(samplePayload({ clientId: ownerAdmitted.clientId, participantId: ownerAdmitted.participantId }))
      .expect(200);
    expect(res.body).toEqual({ ok: true, persisted: false });

    expect(diagnosticsCount(db, sessionId)).toBe(countBefore);

    closeWs(owner);
    await closeServer(server);
  });

  // A-7 — admit check precedes the global gate: non-admitted -> 403 even when OFF
  it('A-7 global OFF: a non-admitted poster is still 403 (admit check runs first)', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Diagnostics room', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', clientKey: 'owner-key' }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    const sessionId = String(ownerAdmitted.sessionId);

    setDiagnosticsGloballyEnabled(false, db);

    await request(server)
      .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
      .send(
        samplePayload({ clientId: 'never-admitted', participantId: 'never-participant', clientKey: 'bad-key' }),
      )
      .expect(403);

    closeWs(owner);
    await closeServer(server);
  });

  // A-8 — /api/me carries the flag on BOTH paths, fail-open on error
  it('A-8a/A-8b guest path carries diagnosticsGloballyEnabled (true default, false when OFF)', async () => {
    const db = createTestDb();
    seedUser(db);
    const app = createApp(db);

    const r1 = await request(app).get('/api/me').expect(200);
    expect(r1.body.user).toBe(null);
    expect(r1.body.diagnosticsGloballyEnabled).toBe(true);

    setDiagnosticsGloballyEnabled(false, db);
    const r2 = await request(app).get('/api/me').expect(200);
    expect(r2.body.user).toBe(null);
    expect(r2.body.diagnosticsGloballyEnabled).toBe(false);
  });

  it('A-8c/A-8d signed-in path carries diagnosticsGloballyEnabled as a top-level field', async () => {
    const db = createTestDb();
    seedUser(db);
    const app = createApp(db);
    const adminCookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    setDiagnosticsGloballyEnabled(true, db);
    const r3 = await request(app).get('/api/me').set('Cookie', adminCookie).expect(200);
    expect(r3.body.user).toBeTruthy();
    expect(r3.body.user.email).toBe('jrom@silverjrom.app');
    expect(r3.body.diagnosticsGloballyEnabled).toBe(true);

    setDiagnosticsGloballyEnabled(false, db);
    const r4 = await request(app).get('/api/me').set('Cookie', adminCookie).expect(200);
    expect(r4.body.user).toBeTruthy();
    expect(r4.body.diagnosticsGloballyEnabled).toBe(false);
  });

  it('A-8e fail-open: a store read error yields diagnosticsGloballyEnabled true', async () => {
    const db = createTestDb();
    seedUser(db);
    const app = createApp(db);

    // Force the store read to fail: drop the table so the SELECT throws. The
    // store wraps reads in try/catch and returns true (fail-open).
    db.exec('DROP TABLE app_settings');
    expect(getDiagnosticsGloballyEnabled(db)).toBe(true);

    const r = await request(app).get('/api/me').expect(200);
    expect(r.body.diagnosticsGloballyEnabled).toBe(true);
  });
});
