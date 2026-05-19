import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
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

afterEach(() => {
  delete process.env.MEET_RECORDINGS_DIR;
  for (const dir of recordingDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('recording API', () => {
  it('S5 backend upload writes a webm file with sanitized room metadata', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'abc123abc123', 'Team Sync!');

    const res = await request(createApp(db))
      .post('/upload')
      .set('Content-Type', 'audio/webm')
      .set('X-Ext', 'webm')
      .set('X-Room', 'abc123abc123')
      .send(Buffer.from('webm-bytes'))
      .expect(200);

    expect(res.body).toMatchObject({ ok: true, bytes: 10 });
    expect(res.body.file).toMatch(/^\d{4}-.*_abc123abc123_Team_Sync_[a-f0-9]{6}\.webm$/);
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
    db.prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      'other@silverjrom.app',
      '00:00',
      Date.now(),
      Date.now(),
    );
    insertRoom(db, 'aaa111aaa111', 'Mine');
    insertRoom(db, 'bbb222bbb222', 'Other', 'other@silverjrom.app');
    const dir = createRecordingDir();
    const oldFile = '2026-05-19T01-00-00-000Z_aaa111aaa111_Mine_111111.webm';
    const newFile = '2026-05-19T02-00-00-000Z_aaa111aaa111_Mine_222222.webm';
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
      roomId: 'aaa111aaa111',
      roomTitle: 'Mine',
    });
  });

  it('S5 backend download rejects a non-owned room recording', async () => {
    const db = createTestDb();
    seedUser(db);
    db.prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      'other@silverjrom.app',
      '00:00',
      Date.now(),
      Date.now(),
    );
    insertRoom(db, 'bbb222bbb222', 'Other', 'other@silverjrom.app');
    const dir = createRecordingDir();
    const filename = '2026-05-19T03-00-00-000Z_bbb222bbb222_Other_333333.webm';
    fs.writeFileSync(path.join(dir, filename), Buffer.alloc(7));
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db)).get(`/api/recordings/${filename}/download`).set('Cookie', cookie).expect(403, { error: 'forbidden' });
  });
});
