import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  delete process.env.MEET_TRANSCRIBE_DISABLED;
  delete process.env.MEET_TRANSCRIBE_PYTHON;
  delete process.env.MEET_TRANSCRIBE_SCRIPT;
  for (const dir of recordingDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('recording API', () => {
  beforeEach(() => {
    process.env.MEET_TRANSCRIBE_DISABLED = '1';
  });

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

  it('FIX-B4 transcript endpoint returns an owned transcript sidecar when present', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const filename = '2026-05-19T06-00-00-000Z_aaa111aaa111_Mine_111111.webm';
    const transcript = {
      schemaVersion: 1,
      audioFile: filename,
      language: 'en',
      lines: [{ startMs: 0, endMs: 1000, clientId: 'host', name: 'Host', text: 'hello', confidence: 0.9 }],
      words: [{ startMs: 0, endMs: 500, text: 'hello', clientId: 'host', name: 'Host', confidence: 0.9 }],
    };
    fs.writeFileSync(path.join(dir, filename), Buffer.alloc(5));
    fs.writeFileSync(path.join(dir, `${filename}.transcript.json`), JSON.stringify(transcript));
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db)).get(`/api/recordings/${filename}/transcript`).set('Cookie', cookie).expect(200);

    expect(res.body).toEqual(transcript);
  });

  it('FIXC4 transcript txt endpoint returns subtitle-style plain text', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const filename = '2026-05-19T06-10-00-000Z_aaa111aaa111_Mine_111111.webm';
    fs.writeFileSync(path.join(dir, filename), Buffer.alloc(5));
    fs.writeFileSync(
      path.join(dir, `${filename}.transcript.json`),
      JSON.stringify({
        schemaVersion: 1,
        audioFile: filename,
        language: 'en',
        lines: [
          { startMs: 0, endMs: 1000, clientId: 'a', name: 'Ari', text: 'hello team', confidence: 0.9 },
          { startMs: 154_000, endMs: 155_000, clientId: 'b', name: '?', text: 'fallback speaker', confidence: 0.8 },
        ],
        words: [],
      }),
    );
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db))
      .get(`/api/recordings/${filename}/transcript.txt`)
      .set('Cookie', cookie)
      .expect('Content-Type', /text\/plain/)
      .expect('Content-Disposition', /attachment; filename="2026-05-19T06-10-00-000Z_aaa111aaa111_Mine_111111\.txt"/)
      .expect(200);

    expect(res.text).toBe('[00:00] Ari: hello team\n[02:34] Speaker: fallback speaker\n');
  });

  it('FIXC4 transcript txt endpoint returns 404 when transcript is missing', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const filename = '2026-05-19T06-11-00-000Z_aaa111aaa111_Mine_222222.webm';
    fs.writeFileSync(path.join(dir, filename), Buffer.alloc(5));
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db)).get(`/api/recordings/${filename}/transcript.txt`).set('Cookie', cookie).expect(404, { error: 'transcript not found' });
  });

  it('FIXC4 transcript delete removes only transcript and lock sidecars', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const filename = '2026-05-19T06-12-00-000Z_aaa111aaa111_Mine_333333.webm';
    fs.writeFileSync(path.join(dir, filename), Buffer.alloc(5));
    fs.writeFileSync(path.join(dir, `${filename}.meta.json`), '{}');
    fs.writeFileSync(path.join(dir, `${filename}.transcript.json`), '{"lines":[]}');
    fs.writeFileSync(path.join(dir, `${filename}.transcribe.lock`), '{}');
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db)).delete(`/api/recordings/${filename}/transcript`).set('Cookie', cookie).expect(204);

    expect(fs.existsSync(path.join(dir, filename))).toBe(true);
    expect(fs.existsSync(path.join(dir, `${filename}.meta.json`))).toBe(true);
    expect(fs.existsSync(path.join(dir, `${filename}.transcript.json`))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${filename}.transcribe.lock`))).toBe(false);
  });

  it('FIXC4 transcript delete returns 404 when transcript is missing', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const filename = '2026-05-19T06-13-00-000Z_aaa111aaa111_Mine_444444.webm';
    fs.writeFileSync(path.join(dir, filename), Buffer.alloc(5));
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db)).delete(`/api/recordings/${filename}/transcript`).set('Cookie', cookie).expect(404, { error: 'transcript not found' });
  });

  it('FIXC4 single recording delete still cascades transcript sidecars', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const filename = '2026-05-19T06-14-00-000Z_aaa111aaa111_Mine_555555.webm';
    fs.writeFileSync(path.join(dir, filename), Buffer.alloc(5));
    fs.writeFileSync(path.join(dir, `${filename}.meta.json`), '{}');
    fs.writeFileSync(path.join(dir, `${filename}.transcript.json`), '{"lines":[]}');
    fs.writeFileSync(path.join(dir, `${filename}.transcribe.lock`), '{}');
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db)).delete(`/api/recordings/${filename}`).set('Cookie', cookie).expect(200, { ok: true });

    expect(fs.existsSync(path.join(dir, filename))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${filename}.meta.json`))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${filename}.transcript.json`))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${filename}.transcribe.lock`))).toBe(false);
  });

  it('FIX-B4 manual transcribe spawns the configured worker', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const filename = '2026-05-19T06-01-00-000Z_aaa111aaa111_Mine_222222.webm';
    const filepath = path.join(dir, filename);
    const fakeWorker = path.join(dir, 'fake-worker.cjs');
    fs.writeFileSync(filepath, Buffer.alloc(5));
    fs.writeFileSync(
      fakeWorker,
      [
        "const fs = require('node:fs');",
        'const file = process.argv[2];',
        "fs.writeFileSync(`${file}.transcript.json`, JSON.stringify({ schemaVersion: 1, audioFile: require('node:path').basename(file), lines: [], words: [] }));",
        'process.exit(0);',
      ].join('\n'),
    );
    delete process.env.MEET_TRANSCRIBE_DISABLED;
    process.env.MEET_TRANSCRIBE_PYTHON = process.execPath;
    process.env.MEET_TRANSCRIBE_SCRIPT = fakeWorker;
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db))
      .post(`/api/recordings/${filename}/transcribe`)
      .set('Cookie', cookie)
      .send({ force: true })
      .expect(200, { ok: true, status: 'started' });

    await waitForFile(path.join(dir, `${filename}.transcript.json`));
    expect(fs.existsSync(path.join(dir, `${filename}.transcribe.lock`))).toBe(false);
  });

  it('FIX-B4 bulk-delete removes transcript and lock sidecars', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const filename = '2026-05-19T06-02-00-000Z_aaa111aaa111_Mine_333333.webm';
    fs.writeFileSync(path.join(dir, filename), Buffer.alloc(5));
    fs.writeFileSync(path.join(dir, `${filename}.meta.json`), '{}');
    fs.writeFileSync(path.join(dir, `${filename}.transcript.json`), '{}');
    fs.writeFileSync(path.join(dir, `${filename}.transcribe.lock`), '{}');
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db)).post('/api/recordings/bulk-delete').set('Cookie', cookie).send({ filenames: [filename] }).expect(200);

    expect(fs.existsSync(path.join(dir, filename))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${filename}.meta.json`))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${filename}.transcript.json`))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${filename}.transcribe.lock`))).toBe(false);
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

  it('FIX-B2 upload-metadata writes a sidecar for an owned recording', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const filename = '2026-05-19T05-00-00-000Z_aaa111aaa111_Mine_111111.webm';
    fs.writeFileSync(path.join(dir, filename), Buffer.alloc(5));
    const metadata = {
      schemaVersion: 1,
      sessionId: 'session-1',
      roomId: 'aaa111aaa111',
      recordingStartedAtIso: '2026-05-19T05:00:00.000Z',
      recordingDurationMs: 1200,
      participants: [{ clientId: 'host', displayName: 'Host', isHost: true, joinedAtMs: 0, leftAtMs: null }],
      segments: [{ startMs: 0, endMs: 500, clientId: 'host', source: 'active-speaker-rms' }],
    };
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db))
      .post('/api/recordings/upload-metadata')
      .set('Cookie', cookie)
      .send({ filename, metadata })
      .expect(200);

    expect(res.body).toMatchObject({ ok: true, metaFile: `${filename}.meta.json`, bytes: expect.any(Number) });
    expect(JSON.parse(fs.readFileSync(path.join(dir, `${filename}.meta.json`), 'utf8'))).toEqual(metadata);
  });

  it('FIX-B2 upload-metadata rejects traversal, missing recordings, non-owners, and bad schema', async () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    insertRoom(db, 'aaa111aaa111', 'Mine');
    insertRoom(db, 'bbb222bbb222', 'Other', 'other@silverjrom.app');
    const dir = createRecordingDir();
    const owned = '2026-05-19T05-01-00-000Z_aaa111aaa111_Mine_222222.webm';
    const otherOwned = '2026-05-19T05-02-00-000Z_bbb222bbb222_Other_333333.webm';
    fs.writeFileSync(path.join(dir, owned), Buffer.alloc(5));
    fs.writeFileSync(path.join(dir, otherOwned), Buffer.alloc(6));
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);
    const metadata = { schemaVersion: 1 };

    await request(app)
      .post('/api/recordings/upload-metadata')
      .set('Cookie', cookie)
      .send({ filename: '../etc/passwd', metadata })
      .expect(400, { error: 'invalid filename' });
    await request(app)
      .post('/api/recordings/upload-metadata')
      .set('Cookie', cookie)
      .send({ filename: '2026-05-19T05-03-00-000Z_aaa111aaa111_Mine_444444.webm', metadata })
      .expect(404, { error: 'recording not found' });
    await request(app)
      .post('/api/recordings/upload-metadata')
      .set('Cookie', cookie)
      .send({ filename: otherOwned, metadata })
      .expect(403, { error: 'forbidden' });
    await request(app)
      .post('/api/recordings/upload-metadata')
      .set('Cookie', cookie)
      .send({ filename: owned, metadata: { schemaVersion: 2 } })
      .expect(400, { error: 'invalid metadata' });
  });

  it('FIX-B2 list enrichment reports sidecar presence and speaker count', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const withMeta = '2026-05-19T05-04-00-000Z_aaa111aaa111_Mine_555555.webm';
    const withoutMeta = '2026-05-19T05-05-00-000Z_aaa111aaa111_Mine_666666.webm';
    fs.writeFileSync(path.join(dir, withMeta), Buffer.alloc(5));
    fs.writeFileSync(path.join(dir, withoutMeta), Buffer.alloc(6));
    fs.writeFileSync(
      path.join(dir, `${withMeta}.meta.json`),
      JSON.stringify({
        schemaVersion: 1,
        participants: [
          { clientId: 'host', displayName: 'Host', isHost: true, joinedAtMs: 0, leftAtMs: null },
          { clientId: 'guest', displayName: 'Guest', isHost: false, joinedAtMs: 100, leftAtMs: 900 },
        ],
        segments: [],
      }),
    );
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db)).get('/api/recordings').set('Cookie', cookie).expect(200);

    const enriched = res.body.recordings.find((recording: { filename: string }) => recording.filename === withMeta);
    const plain = res.body.recordings.find((recording: { filename: string }) => recording.filename === withoutMeta);
    expect(enriched).toMatchObject({ hasMetadata: true, speakerCount: 2 });
    expect(plain).toMatchObject({ hasMetadata: false, speakerCount: null });
  });
});

async function waitForFile(filepath: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (fs.existsSync(filepath)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${filepath}`);
}
