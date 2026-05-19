import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { openSession } from '../src/modules/sessions/store.js';
import { createApp } from '../src/server.js';
import { createTestDb } from './helpers.js';

const recordingDirs: string[] = [];

function createRecordingDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-poc-recordings-'));
  recordingDirs.push(dir);
  process.env.MEET_RECORDINGS_DIR = dir;
  return dir;
}

function insertRoom(db: ReturnType<typeof createTestDb>, id: string, title: string, ownerEmail = 'jrom@silverjrom.app'): void {
  db.prepare('INSERT INTO rooms (id, title, owner_email, created_at) VALUES (?, ?, ?, ?)').run(id, title, ownerEmail, Date.now());
}

function insertUser(db: ReturnType<typeof createTestDb>, email: string): void {
  db.prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    email,
    '00:00',
    Date.now(),
    Date.now(),
  );
}

afterEach(() => {
  delete process.env.MEET_RECORDINGS_DIR;
  for (const dir of recordingDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('recording API', () => {
  it('S2.1 upload requires a session cookie', async () => {
    const db = createTestDb();
    seedUser(db);
    createRecordingDir();
    insertRoom(db, 'abc123abc123', 'Team Sync!');

    await request(createApp(db))
      .post('/upload')
      .set('Content-Type', 'audio/webm')
      .set('X-Ext', 'webm')
      .set('X-Room', 'abc123abc123')
      .send(Buffer.from('webm-bytes'))
      .expect(401, { error: 'unauthorized' });
  });

  it('S2.2 upload rejects an authenticated non-owner', async () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    createRecordingDir();
    insertRoom(db, 'abc123abc123', 'Team Sync!');
    openSession('abc123abc123', 'jrom@silverjrom.app', db);
    const cookie = `session=${createSession('other@silverjrom.app', db)}`;

    await request(createApp(db))
      .post('/upload')
      .set('Cookie', cookie)
      .set('Content-Type', 'audio/webm')
      .set('X-Ext', 'webm')
      .set('X-Room', 'abc123abc123')
      .send(Buffer.from('webm-bytes'))
      .expect(403, { error: 'forbidden' });
  });

  it('S2.3 upload rejects an owner when no meeting session is open', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'abc123abc123', 'Team Sync!');
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db))
      .post('/upload')
      .set('Cookie', cookie)
      .set('Content-Type', 'audio/webm')
      .set('X-Ext', 'webm')
      .set('X-Room', 'abc123abc123')
      .send(Buffer.from('webm-bytes'))
      .expect(409, { error: 'no open meeting session' });

    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('S2.4 upload writes a webm file with the open meeting session id', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'abc123abc123', 'Team Sync!');
    const session = openSession('abc123abc123', 'jrom@silverjrom.app', db);
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db))
      .post('/upload')
      .set('Cookie', cookie)
      .set('Content-Type', 'audio/webm')
      .set('X-Ext', 'webm')
      .set('X-Room', 'abc123abc123')
      .send(Buffer.from('webm-bytes'))
      .expect(200);

    expect(res.body).toMatchObject({ ok: true, bytes: 10 });
    expect(res.body.file).toMatch(new RegExp(`^\\d{4}-.*_${session.id}_abc123abc123_Team_Sync_[a-f0-9]{6}\\.webm$`));
    expect(fs.readFileSync(path.join(dir, res.body.file), 'utf8')).toBe('webm-bytes');
  });

  it('S6.2 upload/list/download accepts mp4 extension from X-Ext', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'abc123abc123', 'Team Sync!');
    const session = openSession('abc123abc123', 'jrom@silverjrom.app', db);
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);

    const upload = await request(app)
      .post('/upload')
      .set('Cookie', cookie)
      .set('Content-Type', 'audio/mp4')
      .set('X-Ext', 'mp4')
      .set('X-Room', 'abc123abc123')
      .send(Buffer.from('mp4-bytes'))
      .expect(200);

    expect(upload.body.file).toMatch(new RegExp(`^\\d{4}-.*_${session.id}_abc123abc123_Team_Sync_[a-f0-9]{6}\\.mp4$`));
    expect(fs.readFileSync(path.join(dir, upload.body.file), 'utf8')).toBe('mp4-bytes');

    const listed = await request(app).get('/api/recordings').set('Cookie', cookie).expect(200);
    expect(listed.body.recordings.map((recording: { filename: string }) => recording.filename)).toEqual([upload.body.file]);

    await request(app)
      .get(`/api/recordings/${upload.body.file}/download`)
      .set('Cookie', cookie)
      .expect('Content-Type', /audio\/mp4/)
      .expect(200);
  });

  it('S5 backend recordings list requires authentication', async () => {
    const db = createTestDb();
    seedUser(db);
    createRecordingDir();

    await request(createApp(db)).get('/api/recordings').expect(401, { error: 'unauthorized' });
  });

  it('S5 backend recordings list is owner-filtered and newest-first', async () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    insertRoom(db, 'aaa111aaa111', 'Mine');
    insertRoom(db, 'bbb222bbb222', 'Other', 'other@silverjrom.app');
    const dir = createRecordingDir();
    const oldFile = '2026-05-19T01-00-00-000Z_aaa111aaa111_Mine_111111.webm';
    const sessionId = '11111111-2222-4333-8444-555555555555';
    const newFile = `2026-05-19T02-00-00-000Z_${sessionId}_aaa111aaa111_Mine_222222.webm`;
    const otherFile = '2026-05-19T03-00-00-000Z_bbb222bbb222_Other_333333.webm';
    fs.writeFileSync(path.join(dir, oldFile), Buffer.alloc(5));
    fs.writeFileSync(path.join(dir, newFile), Buffer.alloc(6));
    fs.writeFileSync(path.join(dir, otherFile), Buffer.alloc(7));
    const now = Date.now();
    fs.utimesSync(path.join(dir, oldFile), now / 1000 - 10, now / 1000 - 10);
    fs.utimesSync(path.join(dir, newFile), now / 1000, now / 1000);
    fs.utimesSync(path.join(dir, otherFile), now / 1000 + 10, now / 1000 + 10);
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db)).get('/api/recordings').set('Cookie', cookie).expect(200);

    expect(res.body.recordings.map((recording: { filename: string }) => recording.filename)).toEqual([newFile, oldFile]);
    expect(res.body.recordings[0]).toMatchObject({
      filename: newFile,
      sizeBytes: 6,
      sessionId,
      roomId: 'aaa111aaa111',
      roomTitle: 'Mine',
    });
    expect(res.body.recordings[1]).toMatchObject({
      filename: oldFile,
      sessionId: null,
      roomId: 'aaa111aaa111',
    });
  });

  it('S4.4 paginates recordings while preserving legacy list shape', async () => {
    const db = createTestDb();
    seedUser(db);
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const dir = createRecordingDir();
    const now = Date.now();
    for (let i = 0; i < 25; i += 1) {
      const filename = `2026-05-19T02-00-${String(i).padStart(2, '0')}-000Z_aaa111aaa111_Mine_${String(i).padStart(6, '0')}.webm`;
      fs.writeFileSync(path.join(dir, filename), Buffer.alloc(i + 1));
      fs.utimesSync(path.join(dir, filename), now / 1000 + i, now / 1000 + i);
    }
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);

    const legacy = await request(app).get('/api/recordings').set('Cookie', cookie).expect(200);
    const page1 = await request(app).get('/api/recordings?page=1&pageSize=20').set('Cookie', cookie).expect(200);
    const page2 = await request(app).get('/api/recordings?page=2&pageSize=20').set('Cookie', cookie).expect(200);

    expect(legacy.body).toEqual({ recordings: expect.any(Array) });
    expect(legacy.body.recordings).toHaveLength(25);
    expect(legacy.body.page).toBeUndefined();
    expect(page1.body).toMatchObject({ page: 1, pageSize: 20, total: 25 });
    expect(page1.body.recordings).toHaveLength(20);
    expect(page2.body).toMatchObject({ page: 2, pageSize: 20, total: 25 });
    expect(page2.body.recordings).toHaveLength(5);
  });

  it('S5 backend download rejects a non-owned room recording', async () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    insertRoom(db, 'bbb222bbb222', 'Other', 'other@silverjrom.app');
    const dir = createRecordingDir();
    const filename = '2026-05-19T03-00-00-000Z_bbb222bbb222_Other_333333.webm';
    fs.writeFileSync(path.join(dir, filename), Buffer.alloc(7));
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db)).get(`/api/recordings/${filename}/download`).set('Cookie', cookie).expect(403, { error: 'forbidden' });
  });

  it('FIX-B3 bulk-delete removes only owned safe recordings', async () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    insertRoom(db, 'aaa111aaa111', 'Mine');
    insertRoom(db, 'bbb222bbb222', 'Other', 'other@silverjrom.app');
    const dir = createRecordingDir();
    const owned1 = '2026-05-19T04-00-00-000Z_aaa111aaa111_Mine_111111.webm';
    const owned2 = '2026-05-19T04-01-00-000Z_aaa111aaa111_Mine_222222.webm';
    const otherOwned = '2026-05-19T04-02-00-000Z_bbb222bbb222_Other_333333.webm';
    const bogusRoom = '2026-05-19T04-03-00-000Z_ccc333ccc333_Ghost_444444.webm';
    for (const filename of [owned1, owned2, otherOwned, bogusRoom]) {
      fs.writeFileSync(path.join(dir, filename), Buffer.from(filename));
    }
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db))
      .post('/api/recordings/bulk-delete')
      .set('Cookie', cookie)
      .send({ filenames: [owned1, owned2, otherOwned, bogusRoom, '../etc/passwd'] })
      .expect(200, { ok: true, deleted: 2, requested: 5 });

    expect(fs.existsSync(path.join(dir, owned1))).toBe(false);
    expect(fs.existsSync(path.join(dir, owned2))).toBe(false);
    expect(fs.existsSync(path.join(dir, otherOwned))).toBe(true);
    expect(fs.existsSync(path.join(dir, bogusRoom))).toBe(true);
  });

  it('FIX-B3 bulk-delete rejects a missing filenames array', async () => {
    const db = createTestDb();
    seedUser(db);
    createRecordingDir();
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db))
      .post('/api/recordings/bulk-delete')
      .set('Cookie', cookie)
      .send({})
      .expect(400, { error: 'filenames array required' });
  });

  it('FIX-B3 bulk-delete accepts an empty filenames array', async () => {
    const db = createTestDb();
    seedUser(db);
    createRecordingDir();
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db))
      .post('/api/recordings/bulk-delete')
      .set('Cookie', cookie)
      .send({ filenames: [] })
      .expect(200, { ok: true, deleted: 0, requested: 0 });
  });

  it('FIX-B3 single delete is ownership-gated', async () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    insertRoom(db, 'aaa111aaa111', 'Mine');
    insertRoom(db, 'bbb222bbb222', 'Other', 'other@silverjrom.app');
    const dir = createRecordingDir();
    const owned = '2026-05-19T04-04-00-000Z_aaa111aaa111_Mine_555555.webm';
    const otherOwned = '2026-05-19T04-05-00-000Z_bbb222bbb222_Other_666666.webm';
    fs.writeFileSync(path.join(dir, owned), Buffer.alloc(5));
    fs.writeFileSync(path.join(dir, otherOwned), Buffer.alloc(6));
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);

    await request(app).delete(`/api/recordings/${owned}`).set('Cookie', cookie).expect(200, { ok: true });
    await request(app).delete(`/api/recordings/${otherOwned}`).set('Cookie', cookie).expect(403, { error: 'forbidden' });
    await request(app).delete('/api/recordings/../etc/passwd').set('Cookie', cookie).expect(404);

    expect(fs.existsSync(path.join(dir, owned))).toBe(false);
    expect(fs.existsSync(path.join(dir, otherOwned))).toBe(true);
  });
});
