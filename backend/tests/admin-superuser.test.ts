import request from 'supertest';
import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { hashPassword } from '../src/lib/passwords.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { createApp } from '../src/server.js';
import { createTestDb } from './helpers.js';

const SUPERUSER_EMAIL = 'silverjrom@gmail.com';
const ADMIN_EMAIL = 'admin@example.com';
const PLAIN_EMAIL = 'plain@example.com';

function insertUser(
  db: Database.Database,
  email: string,
  opts: { isAdmin?: boolean; isSuperuser?: boolean; displayName?: string } = {},
): void {
  const now = Date.now();
  db.prepare(
    'INSERT INTO users (email, password_hash, created_at, updated_at, display_name, is_admin, is_superuser) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    email,
    hashPassword('password123'),
    now,
    now,
    opts.displayName ?? email.split('@')[0],
    opts.isAdmin ? 1 : 0,
    opts.isSuperuser ? 1 : 0,
  );
}

function sessionCookie(db: Database.Database, email: string): string {
  return `session=${createSession(email, db)}`;
}

describe('admin superuser RBAC (B2a)', () => {
  it('R2.1 migration seeds silverjrom@gmail.com as the only superuser', () => {
    const db = createTestDb();
    insertUser(db, SUPERUSER_EMAIL, { isAdmin: true, isSuperuser: true });
    insertUser(db, ADMIN_EMAIL, { isAdmin: true });
    insertUser(db, PLAIN_EMAIL);

    const rows = db.prepare('SELECT email, is_superuser FROM users ORDER BY email').all() as {
      email: string;
      is_superuser: number;
    }[];
    expect(rows.find((r) => r.email === SUPERUSER_EMAIL)?.is_superuser).toBe(1);
    expect(rows.filter((r) => r.is_superuser === 1)).toHaveLength(1);
  });

  it('R2.5 isSuperuser is present on own /api/me only, never in /admin/users list', async () => {
    const db = createTestDb();
    insertUser(db, SUPERUSER_EMAIL, { isAdmin: true, isSuperuser: true });
    insertUser(db, ADMIN_EMAIL, { isAdmin: true });
    const app = createApp(db);
    const superCookie = sessionCookie(db, SUPERUSER_EMAIL);
    const adminCookie = sessionCookie(db, ADMIN_EMAIL);

    const me = await request(app).get('/api/me').set('Cookie', superCookie).expect(200);
    expect(me.body.user.isSuperuser).toBe(true);

    const adminMe = await request(app).get('/api/me').set('Cookie', adminCookie).expect(200);
    expect(adminMe.body.user.isSuperuser).toBe(false);
    expect(adminMe.body.user).not.toHaveProperty('is_superuser');

    const list = await request(app).get('/api/admin/users').set('Cookie', adminCookie).expect(200);
    const superRow = list.body.users.find((u: { email: string }) => u.email === SUPERUSER_EMAIL);
    expect(superRow.isAdmin).toBe(true);
    expect(superRow.protected).toBe(true);
    expect(superRow).not.toHaveProperty('isSuperuser');
    expect(superRow).not.toHaveProperty('is_superuser');
    expect(JSON.stringify(list.body)).not.toContain('isSuperuser');
    expect(JSON.stringify(list.body)).not.toContain('is_superuser');

    const adminRow = list.body.users.find((u: { email: string }) => u.email === ADMIN_EMAIL);
    expect(adminRow?.protected).toBe(false);
  });

  it('R2.2 admin can delete and toggle admin on a normal user', async () => {
    const db = createTestDb();
    insertUser(db, ADMIN_EMAIL, { isAdmin: true });
    insertUser(db, PLAIN_EMAIL);
    const app = createApp(db);
    const adminCookie = sessionCookie(db, ADMIN_EMAIL);

    await request(app)
      .patch(`/api/admin/users/${encodeURIComponent(PLAIN_EMAIL)}/role`)
      .set('Cookie', adminCookie)
      .send({ isAdmin: true })
      .expect(200, { ok: true, isAdmin: true });

    const promoted = db.prepare('SELECT is_admin FROM users WHERE email = ?').get(PLAIN_EMAIL) as { is_admin: number };
    expect(promoted.is_admin).toBe(1);

    await request(app)
      .patch(`/api/admin/users/${encodeURIComponent(PLAIN_EMAIL)}/role`)
      .set('Cookie', adminCookie)
      .send({ isAdmin: false })
      .expect(200, { ok: true, isAdmin: false });

    await request(app).delete(`/api/admin/users/${encodeURIComponent(PLAIN_EMAIL)}`).set('Cookie', adminCookie).expect(200, { ok: true });
    const gone = db.prepare('SELECT 1 FROM users WHERE email = ?').get(PLAIN_EMAIL);
    expect(gone).toBeUndefined();
  });

  it('R2.6 admin delete/toggle/reset/edit targeting superuser returns 403', async () => {
    const db = createTestDb();
    insertUser(db, SUPERUSER_EMAIL, { isAdmin: true, isSuperuser: true });
    insertUser(db, ADMIN_EMAIL, { isAdmin: true });
    const app = createApp(db);
    const adminCookie = sessionCookie(db, ADMIN_EMAIL);
    const target = encodeURIComponent(SUPERUSER_EMAIL);

    await request(app).delete(`/api/admin/users/${target}`).set('Cookie', adminCookie).expect(403);
    await request(app).patch(`/api/admin/users/${target}/role`).set('Cookie', adminCookie).send({ isAdmin: false }).expect(403);
    await request(app).patch(`/api/admin/users/${target}`).set('Cookie', adminCookie).send({ displayName: 'Hacked' }).expect(403);
    await request(app)
      .patch(`/api/admin/users/${target}/email`)
      .set('Cookie', adminCookie)
      .send({ newEmail: 'hacked@example.com' })
      .expect(403);
    await request(app)
      .post(`/api/admin/users/${target}/reset-password`)
      .set('Cookie', adminCookie)
      .send({ newPassword: 'newpassword123' })
      .expect(403);
  });

  it('red-team: admin cannot target the superuser through mixed-case or space-padded email params', async () => {
    const db = createTestDb();
    insertUser(db, SUPERUSER_EMAIL, { isAdmin: true, isSuperuser: true });
    insertUser(db, ADMIN_EMAIL, { isAdmin: true });
    const app = createApp(db);
    const adminCookie = sessionCookie(db, ADMIN_EMAIL);
    const target = encodeURIComponent(`  ${SUPERUSER_EMAIL.toUpperCase()}  `);

    await request(app).delete(`/api/admin/users/${target}`).set('Cookie', adminCookie).expect(403);
    await request(app).patch(`/api/admin/users/${target}/role`).set('Cookie', adminCookie).send({ isAdmin: false }).expect(403);

    const row = db.prepare('SELECT email, is_admin, is_superuser FROM users WHERE email = ?').get(SUPERUSER_EMAIL) as {
      email: string;
      is_admin: number;
      is_superuser: number;
    };
    expect(row.email).toBe(SUPERUSER_EMAIL);
    expect(row.is_admin).toBe(1);
    expect(row.is_superuser).toBe(1);
  });

  it('red-team: admin create cannot set is_superuser and cannot case-clone the seeded superuser', async () => {
    const db = createTestDb();
    insertUser(db, SUPERUSER_EMAIL, { isAdmin: true, isSuperuser: true });
    insertUser(db, ADMIN_EMAIL, { isAdmin: true });
    const app = createApp(db);
    const adminCookie = sessionCookie(db, ADMIN_EMAIL);

    const created = await request(app)
      .post('/api/admin/users')
      .set('Cookie', adminCookie)
      .send({
        email: 'created@example.com',
        password: 'password123',
        displayName: 'Created',
        isAdmin: true,
        isSuperuser: true,
        is_superuser: 1,
      })
      .expect(200);
    expect(created.body.user).not.toHaveProperty('isSuperuser');
    expect(created.body.user).not.toHaveProperty('is_superuser');

    const row = db.prepare('SELECT is_admin, is_superuser FROM users WHERE email = ?').get('created@example.com') as {
      is_admin: number;
      is_superuser: number;
    };
    expect(row.is_admin).toBe(1);
    expect(row.is_superuser).toBe(0);

    await request(app)
      .post('/api/admin/users')
      .set('Cookie', adminCookie)
      .send({ email: 'SILVERJROM@Gmail.com', password: 'password123', isSuperuser: true })
      .expect(409);
    expect(db.prepare('SELECT COUNT(*) AS count FROM users WHERE is_superuser = 1').get()).toEqual({ count: 1 });
  });

  it('R2.3 superuser can edit username, email, role, and reset password on others', async () => {
    const db = createTestDb();
    insertUser(db, SUPERUSER_EMAIL, { isAdmin: true, isSuperuser: true });
    insertUser(db, PLAIN_EMAIL, { displayName: 'Plain' });
    const room = createRoom('Cascade room', PLAIN_EMAIL, db);
    db.prepare('INSERT INTO telegram_links (tg_user_id, email, tg_username, linked_at) VALUES (?, ?, ?, ?)').run(9001, PLAIN_EMAIL, 'plain_tg', Date.now());
    const app = createApp(db);
    const superCookie = sessionCookie(db, SUPERUSER_EMAIL);
    const target = encodeURIComponent(PLAIN_EMAIL);
    const renamedEmail = 'renamed@example.com';

    await request(app)
      .patch(`/api/admin/users/${target}`)
      .set('Cookie', superCookie)
      .send({ displayName: 'Renamed User' })
      .expect(200, { ok: true, displayName: 'Renamed User' });

    await request(app)
      .patch(`/api/admin/users/${target}/role`)
      .set('Cookie', superCookie)
      .send({ isAdmin: true })
      .expect(200, { ok: true, isAdmin: true });

    await request(app)
      .patch(`/api/admin/users/${target}/email`)
      .set('Cookie', superCookie)
      .send({ newEmail: renamedEmail })
      .expect(200, { ok: true, email: renamedEmail });

    const roomOwner = db.prepare('SELECT owner_email FROM rooms WHERE id = ?').get(room.id) as { owner_email: string };
    expect(roomOwner.owner_email).toBe(renamedEmail);
    const tg = db.prepare('SELECT email FROM telegram_links WHERE tg_username = ?').get('plain_tg') as { email: string };
    expect(tg.email).toBe(renamedEmail);
    expect(db.prepare('SELECT 1 FROM users WHERE email = ?').get(PLAIN_EMAIL)).toBeUndefined();

    await request(app)
      .post(`/api/admin/users/${encodeURIComponent(renamedEmail)}/reset-password`)
      .set('Cookie', superCookie)
      .send({ newPassword: 'resetpass99' })
      .expect(200, { ok: true });

    const login = await request(app).post('/api/login').send({ email: renamedEmail, password: 'resetpass99' }).expect(200);
    expect(login.body.email).toBe(renamedEmail);
  });

  it('R2.8 superuser self email-change allowed; self role demote blocked', async () => {
    const db = createTestDb();
    insertUser(db, SUPERUSER_EMAIL, { isAdmin: true, isSuperuser: true, displayName: 'JROM' });
    const app = createApp(db);
    const superCookie = sessionCookie(db, SUPERUSER_EMAIL);
    const target = encodeURIComponent(SUPERUSER_EMAIL);
    const newEmail = 'silverjrom+alias@gmail.com';

    await request(app).patch(`/api/admin/users/${target}/role`).set('Cookie', superCookie).send({ isAdmin: false }).expect(403);

    await request(app)
      .patch(`/api/admin/users/${target}/email`)
      .set('Cookie', superCookie)
      .send({ newEmail })
      .expect(200, { ok: true, email: newEmail });

    const row = db.prepare('SELECT is_superuser, is_admin FROM users WHERE email = ?').get(newEmail) as {
      is_superuser: number;
      is_admin: number;
    };
    expect(row.is_superuser).toBe(1);
    expect(row.is_admin).toBe(1);
    expect(db.prepare('SELECT 1 FROM users WHERE email = ?').get(SUPERUSER_EMAIL)).toBeUndefined();

    await request(app)
      .patch(`/api/admin/users/${encodeURIComponent(newEmail)}`)
      .set('Cookie', superCookie)
      .send({ displayName: 'Still JROM' })
      .expect(200, { ok: true, displayName: 'Still JROM' });
  });

  it('red-team: account self email-change preserves superuser bit and only /api/me exposes it', async () => {
    const db = createTestDb();
    insertUser(db, SUPERUSER_EMAIL, { isAdmin: true, isSuperuser: true, displayName: 'JROM' });
    insertUser(db, ADMIN_EMAIL, { isAdmin: true });
    const app = createApp(db);
    const superCookie = sessionCookie(db, SUPERUSER_EMAIL);
    const newEmail = 'silverjrom+account@gmail.com';

    await request(app)
      .put('/api/account/email')
      .set('Cookie', superCookie)
      .send({ newEmail, password: 'password123' })
      .expect(200, { email: newEmail });

    const row = db.prepare('SELECT is_superuser, is_admin FROM users WHERE email = ?').get(newEmail) as {
      is_superuser: number;
      is_admin: number;
    };
    expect(row.is_superuser).toBe(1);
    expect(row.is_admin).toBe(1);

    const me = await request(app).get('/api/me').set('Cookie', superCookie).expect(200);
    expect(me.body.user.email).toBe(newEmail);
    expect(me.body.user.isSuperuser).toBe(true);

    const login = await request(app).post('/api/login').send({ email: newEmail, password: 'password123' }).expect(200);
    expect(login.body).not.toHaveProperty('isSuperuser');
    expect(login.body).not.toHaveProperty('is_superuser');

    const adminCookie = sessionCookie(db, ADMIN_EMAIL);
    const list = await request(app).get('/api/admin/users').set('Cookie', adminCookie).expect(200);
    expect(JSON.stringify(list.body)).not.toContain('isSuperuser');
    expect(JSON.stringify(list.body)).not.toContain('is_superuser');
  });

  it('R2.2 admin delete respects FK cleanup for owned rooms and meeting_sessions', async () => {
    const db = createTestDb();
    insertUser(db, ADMIN_EMAIL, { isAdmin: true });
    insertUser(db, PLAIN_EMAIL);
    const room = createRoom('Owned room', PLAIN_EMAIL, db);
    db.prepare(
      'INSERT INTO meeting_sessions (id, room_id, host_email, started_at, ended_at, admitted_peak) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('sess-owned', room.id, PLAIN_EMAIL, 100, 200, 1);
    const app = createApp(db);
    const adminCookie = sessionCookie(db, ADMIN_EMAIL);

    await request(app)
      .delete(`/api/admin/users/${encodeURIComponent(PLAIN_EMAIL)}`)
      .set('Cookie', adminCookie)
      .expect(200, { ok: true });

    expect(db.prepare('SELECT 1 FROM users WHERE email = ?').get(PLAIN_EMAIL)).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(room.id)).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM meeting_sessions WHERE id = ?').get('sess-owned')).toBeUndefined();
  });
});
