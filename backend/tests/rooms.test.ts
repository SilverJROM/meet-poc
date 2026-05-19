import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createApp } from '../src/server.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createTestDb } from './helpers.js';

describe('rooms API', () => {
  it('S2.1 creates a room for an authenticated user with a 12-hex id', async () => {
    const db = createTestDb();
    seedUser(db);
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db)).post('/api/rooms').set('Cookie', cookie).send({ title: 'Team sync' }).expect(200);

    expect(res.body.room).toMatchObject({
      title: 'Team sync',
      ownerEmail: 'jrom@silverjrom.app',
    });
    expect(res.body.room.id).toMatch(/^[a-f0-9]{12}$/);
    expect(typeof res.body.room.createdAt).toBe('number');
  });

  it('S2.2 rejects unauthenticated room creation', async () => {
    const db = createTestDb();
    seedUser(db);

    await request(createApp(db)).post('/api/rooms').send({ title: 'Nope' }).expect(401, { error: 'unauthorized' });
  });

  it('S2.3 lists only owned rooms newest-first', async () => {
    const db = createTestDb();
    seedUser(db);
    db.prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      'other@silverjrom.app',
      '00:00',
      Date.now(),
      Date.now(),
    );
    db.prepare('INSERT INTO rooms (id, title, owner_email, created_at) VALUES (?, ?, ?, ?)').run('aaa111aaa111', 'First', 'jrom@silverjrom.app', 1);
    db.prepare('INSERT INTO rooms (id, title, owner_email, created_at) VALUES (?, ?, ?, ?)').run('bbb222bbb222', 'Second', 'jrom@silverjrom.app', 2);
    db.prepare('INSERT INTO rooms (id, title, owner_email, created_at) VALUES (?, ?, ?, ?)').run('ccc333ccc333', 'Other', 'other@silverjrom.app', 3);
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db)).get('/api/rooms').set('Cookie', cookie).expect(200);

    expect(res.body.rooms.map((room: { title: string }) => room.title)).toEqual(['Second', 'First']);
  });

  it('S4.1 paginates owned rooms while preserving legacy list shape', async () => {
    const db = createTestDb();
    seedUser(db);
    for (let i = 0; i < 25; i += 1) {
      db.prepare('INSERT INTO rooms (id, title, owner_email, created_at) VALUES (?, ?, ?, ?)').run(
        `${i.toString(16).padStart(12, '0')}`,
        `Room ${i + 1}`,
        'jrom@silverjrom.app',
        i + 1,
      );
    }
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);

    const legacy = await request(app).get('/api/rooms').set('Cookie', cookie).expect(200);
    const page1 = await request(app).get('/api/rooms?page=1&pageSize=20').set('Cookie', cookie).expect(200);
    const page2 = await request(app).get('/api/rooms?page=2&pageSize=20').set('Cookie', cookie).expect(200);

    expect(legacy.body).toEqual({ rooms: expect.any(Array) });
    expect(legacy.body.rooms).toHaveLength(25);
    expect(legacy.body.page).toBeUndefined();
    expect(page1.body).toMatchObject({ page: 1, pageSize: 20, total: 25 });
    expect(page1.body.rooms).toHaveLength(20);
    expect(page1.body.rooms[0].title).toBe('Room 25');
    expect(page2.body).toMatchObject({ page: 2, pageSize: 20, total: 25 });
    expect(page2.body.rooms).toHaveLength(5);
  });

  it("S2.4 deletes owned rooms and returns 403 for another user's room", async () => {
    const db = createTestDb();
    seedUser(db);
    db.prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      'other@silverjrom.app',
      '00:00',
      Date.now(),
      Date.now(),
    );
    db.prepare('INSERT INTO rooms (id, title, owner_email, created_at) VALUES (?, ?, ?, ?)').run('aaa111aaa111', 'Mine', 'jrom@silverjrom.app', 1);
    db.prepare('INSERT INTO rooms (id, title, owner_email, created_at) VALUES (?, ?, ?, ?)').run('bbb222bbb222', 'Other', 'other@silverjrom.app', 2);
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);

    await request(app).delete('/api/rooms/aaa111aaa111').set('Cookie', cookie).expect(200, { ok: true });
    await request(app).delete('/api/rooms/bbb222bbb222').set('Cookie', cookie).expect(403, { error: 'forbidden' });
    await request(app).delete('/api/rooms/missing').set('Cookie', cookie).expect(404, { error: 'not found' });
    const list = await request(app).get('/api/rooms').set('Cookie', cookie).expect(200);
    expect(list.body.rooms).toEqual([]);
  });

  it('S2.5 exposes public room existence with title', async () => {
    const db = createTestDb();
    seedUser(db);
    db.prepare('INSERT INTO rooms (id, title, owner_email, created_at) VALUES (?, ?, ?, ?)').run('aaa111aaa111', 'Team sync', 'jrom@silverjrom.app', 1);
    const app = createApp(db);

    await request(app).get('/api/rooms/aaa111aaa111/exists').expect(200, { exists: true, title: 'Team sync' });
    await request(app).get('/api/rooms/missing/exists').expect(200, { exists: false });
  });
});
