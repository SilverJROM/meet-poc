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
});
