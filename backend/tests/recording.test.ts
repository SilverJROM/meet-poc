import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeOpenRouterTranscript } from '../src/modules/recording/openrouter-transcribe.js';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { openSession } from '../src/modules/sessions/store.js';
import { transcribeSessionRecordings } from '../src/modules/recording/index.js';
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.MEET_RECORDINGS_DIR;
  delete process.env.MEET_TRANSCRIBE_DISABLED;
  delete process.env.MEET_TRANSCRIBE_PYTHON;
  delete process.env.MEET_TRANSCRIBE_SCRIPT;
  delete process.env.WHISPER_MODEL;
  delete process.env.OPENROUTER_API_KEY;
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await request(createApp(db))
      .post('/upload')
      .set('Cookie', cookie)
      .set('Content-Type', 'audio/webm')
      .set('X-Ext', 'webm')
      .set('X-Room', 'abc123abc123')
      .send(Buffer.from('webm-bytes'))
      .expect(403, { error: 'forbidden' });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[rec] rejected owner-mismatch room=abc123abc123 user=other@silverjrom.app'));
  });

  it('S2.3 upload rejects an owner when no meeting session is open', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'abc123abc123', 'Team Sync!');
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await request(createApp(db))
      .post('/upload')
      .set('Cookie', cookie)
      .set('Content-Type', 'audio/webm')
      .set('X-Ext', 'webm')
      .set('X-Room', 'abc123abc123')
      .send(Buffer.from('webm-bytes'))
      .expect(409, { error: 'no open meeting session' });

    expect(fs.readdirSync(dir)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[rec] rejected no-open-or-recent-session room=abc123abc123 user=jrom@silverjrom.app'));
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

  it('B2 accepts an owner upload for a session ended within the recording grace window', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'abc123abc123', 'Team Sync!');
    const session = openSession('abc123abc123', 'jrom@silverjrom.app', db);
    db.prepare('UPDATE meeting_sessions SET ended_at = ?, ended_reason = ? WHERE id = ?').run(
      Date.now() - 10_000,
      'host-close-room',
      session.id,
    );
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db))
      .post('/upload')
      .set('Cookie', cookie)
      .set('Content-Type', 'audio/webm')
      .set('X-Ext', 'webm')
      .set('X-Room', 'abc123abc123')
      .send(Buffer.from('webm-bytes'))
      .expect(200);

    expect(res.body.file).toContain(`_${session.id}_abc123abc123_`);
    expect(fs.readFileSync(path.join(dir, res.body.file), 'utf8')).toBe('webm-bytes');
  });

  it('B2 rejects an owner upload for a session ended outside the recording grace window', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'abc123abc123', 'Team Sync!');
    const session = openSession('abc123abc123', 'jrom@silverjrom.app', db);
    db.prepare('UPDATE meeting_sessions SET ended_at = ?, ended_reason = ? WHERE id = ?').run(
      Date.now() - 301_000,
      'host-close-room',
      session.id,
    );
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

  it('B2 keeps wrong-owner upload rejected even inside the recording grace window', async () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    createRecordingDir();
    insertRoom(db, 'abc123abc123', 'Team Sync!');
    const session = openSession('abc123abc123', 'jrom@silverjrom.app', db);
    db.prepare('UPDATE meeting_sessions SET ended_at = ?, ended_reason = ? WHERE id = ?').run(
      Date.now() - 10_000,
      'host-close-room',
      session.id,
    );
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
      path.join(dir, `${filename}.participant.json`),
      JSON.stringify({ displayName: 'Host', clientId: 'host', isPerUser: true }),
    );
    fs.writeFileSync(
      fakeWorker,
      [
        "const fs = require('node:fs');",
        'const file = process.argv[2];',
        "const provider = 'local';",
        "const model = process.env.WHISPER_MODEL || 'medium';",
        "const safe = model.replace(/[^a-zA-Z0-9._-]+/g, '-');",
        "fs.writeFileSync(`${file}.transcript.${provider}-${safe}.json`, JSON.stringify({ schemaVersion: 1, audioFile: require('node:path').basename(file), provider, model, lines: [], words: [] }));",
        "fs.writeFileSync(`${file}.transcript.primary.json`, JSON.stringify({ provider, model }));",
        'process.exit(0);',
      ].join('\n'),
    );
    delete process.env.MEET_TRANSCRIBE_DISABLED;
    process.env.MEET_TRANSCRIBE_PYTHON = process.execPath;
    process.env.MEET_TRANSCRIBE_SCRIPT = fakeWorker;
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);

    await request(app).put('/api/llm/settings').set('Cookie', cookie).send({ transcriberModel: 'small' }).expect(200);

    await request(app)
      .post(`/api/recordings/${filename}/transcribe`)
      .set('Cookie', cookie)
      .send({ force: true })
      .expect(200, { ok: true, status: 'started' });

    await waitForFile(path.join(dir, `${filename}.transcript.local-small.json`));
    expect(JSON.parse(fs.readFileSync(path.join(dir, `${filename}.transcript.local-small.json`), 'utf8')).model).toBe('small');
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

  it('B1a rejects transcription for mixed recordings', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'd98896162f09', 'AGENTROOM');
    const mixed = '2026-06-21T05-38-39-199Z_80fa7254-1f91-42b0-a7d0-62d2411f9fc6_d98896162f09_AGENTROOM_dc411e.webm';
    fs.writeFileSync(path.join(dir, mixed), Buffer.alloc(8));
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    await request(createApp(db))
      .post(`/api/recordings/${mixed}/transcribe`)
      .set('Cookie', cookie)
      .send({})
      .expect(400, { error: 'mixed recordings are not transcribed' });
  });

  it('B1a session transcription queues only per-user recordings', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'd98896162f09', 'AGENTROOM');
    const sessionId = '80fa7254-1f91-42b0-a7d0-62d2411f9fc6';
    const mixed = `2026-06-21T05-38-39-199Z_${sessionId}_d98896162f09_AGENTROOM_dc411e.webm`;
    const host = `2026-06-21T05-38-39-223Z_${sessionId}_d98896162f09_AGENTROOM_host_90ee5f.webm`;
    const guest = `2026-06-21T05-38-39-224Z_${sessionId}_d98896162f09_AGENTROOM_peer2_91aa6f.webm`;
    for (const filename of [mixed, host, guest]) {
      fs.writeFileSync(path.join(dir, filename), Buffer.alloc(8));
    }
    fs.writeFileSync(
      path.join(dir, `${host}.participant.json`),
      JSON.stringify({ displayName: 'host', clientId: 'local', isPerUser: true }),
    );
    fs.writeFileSync(
      path.join(dir, `${guest}.participant.json`),
      JSON.stringify({ displayName: 'Peer2', clientId: 'guest-1', isPerUser: true }),
    );

    const queued = transcribeSessionRecordings(sessionId, 'jrom@silverjrom.app', db, { force: false });

    expect(queued).toBe(2);
  });

  it('B1a named-transcript merges owner-labeled lines with zero question marks', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'd98896162f09', 'AGENTROOM');
    const sessionId = '80fa7254-1f91-42b0-a7d0-62d2411f9fc6';
    const host = `2026-06-21T05-38-39-223Z_${sessionId}_d98896162f09_AGENTROOM_host_90ee5f.webm`;
    const guest = `2026-06-21T05-38-39-224Z_${sessionId}_d98896162f09_AGENTROOM_peer2_91aa6f.webm`;
    for (const filename of [host, guest]) {
      fs.writeFileSync(path.join(dir, filename), Buffer.alloc(8));
    }
    fs.writeFileSync(
      path.join(dir, `${host}.participant.json`),
      JSON.stringify({ displayName: 'host', clientId: 'local', isPerUser: true }),
    );
    fs.writeFileSync(
      path.join(dir, `${guest}.participant.json`),
      JSON.stringify({ displayName: 'Peer2', clientId: 'guest-1', isPerUser: true }),
    );
    fs.writeFileSync(
      path.join(dir, `${host}.transcript.json`),
      JSON.stringify({
        schemaVersion: 1,
        audioFile: host,
        language: 'en',
        lines: [{ startMs: 2000, endMs: 2500, clientId: 'local', name: 'host', text: 'second', confidence: 0.9 }],
        words: [],
      }),
    );
    fs.writeFileSync(
      path.join(dir, `${guest}.transcript.json`),
      JSON.stringify({
        schemaVersion: 1,
        audioFile: guest,
        language: 'en',
        lines: [{ startMs: 1000, endMs: 1500, clientId: 'guest-1', name: 'Peer2', text: 'first', confidence: 0.9 }],
        words: [],
      }),
    );
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db))
      .get(`/api/recordings/named-transcript/${sessionId}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.speakers).toEqual(expect.arrayContaining(['host', 'Peer2']));
    expect(res.body.transcript.map((line: { name: string }) => line.name)).toEqual(['Peer2', 'host']);
    expect(res.body.transcript.some((line: { name: string }) => line.name === '?')).toBe(false);
  });

  it('shifts a mid-joiner transcript onto the call timeline using sidecar joinedAtMs', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'd98896162f09', 'AGENTROOM');
    const sessionId = 'aaaaaaaa-1111-2222-3333-444444444444';
    const host = `2026-07-01T05-00-00-000Z_${sessionId}_d98896162f09_AGENTROOM_host_a0a0a0.webm`;
    const joiner = `2026-07-01T05-00-00-001Z_${sessionId}_d98896162f09_AGENTROOM_peer2_b1b1b1.webm`;
    for (const filename of [host, joiner]) fs.writeFileSync(path.join(dir, filename), Buffer.alloc(8));
    // Host present at recording start → offset 0. Peer2 joins 2 minutes in → offset 120000ms.
    fs.writeFileSync(
      path.join(dir, `${host}.participant.json`),
      JSON.stringify({ displayName: 'host', clientId: 'local', joinedAtMs: 0, isPerUser: true }),
    );
    fs.writeFileSync(
      path.join(dir, `${joiner}.participant.json`),
      JSON.stringify({ displayName: 'Peer2', clientId: 'guest-1', joinedAtMs: 120000, isPerUser: true }),
    );
    // Whisper timestamps each file from ~0 (its own recording start).
    fs.writeFileSync(
      path.join(dir, `${host}.transcript.json`),
      JSON.stringify({ schemaVersion: 1, audioFile: host, language: 'en', lines: [{ startMs: 1000, endMs: 1500, clientId: 'local', name: 'host', text: 'hello at start', confidence: 0.9 }], words: [] }),
    );
    fs.writeFileSync(
      path.join(dir, `${joiner}.transcript.json`),
      JSON.stringify({ schemaVersion: 1, audioFile: joiner, language: 'en', lines: [{ startMs: 500, endMs: 1200, clientId: 'guest-1', name: 'Peer2', text: 'joining late', confidence: 0.9 }], words: [] }),
    );
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db))
      .get(`/api/recordings/named-transcript/${sessionId}`)
      .set('Cookie', cookie)
      .expect(200);

    const peer2 = res.body.transcript.find((l: { name: string }) => l.name === 'Peer2');
    const hostLine = res.body.transcript.find((l: { name: string }) => l.name === 'host');
    // The mid-joiner's line is shifted by joinedAtMs (500 + 120000), NOT left at ~500.
    expect(peer2.startMs).toBe(120500);
    expect(peer2.endMs).toBe(121200);
    // Host offset is 0 → unchanged.
    expect(hostLine.startMs).toBe(1000);
    // Ordering now reflects the real call timeline: host (1s) before Peer2 (2m0.5s).
    expect(res.body.transcript.map((l: { name: string }) => l.name)).toEqual(['host', 'Peer2']);
  });

  it('falls back to meta.json joinedAtMs when the sidecar predates the field', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'd98896162f09', 'AGENTROOM');
    const sessionId = 'bbbbbbbb-5555-6666-7777-888888888888';
    const joiner = `2026-07-01T06-00-00-001Z_${sessionId}_d98896162f09_AGENTROOM_peer2_c2c2c2.webm`;
    fs.writeFileSync(path.join(dir, joiner), Buffer.alloc(8));
    // Legacy sidecar: no joinedAtMs.
    fs.writeFileSync(
      path.join(dir, `${joiner}.participant.json`),
      JSON.stringify({ displayName: 'Peer2', clientId: 'guest-1', isPerUser: true }),
    );
    // But the file's meta.json carries participants[].joinedAtMs.
    fs.writeFileSync(
      path.join(dir, `${joiner}.meta.json`),
      JSON.stringify({
        schemaVersion: 1,
        sessionId,
        roomId: 'd98896162f09',
        recordingStartedAtIso: '2026-07-01T06:00:00.000Z',
        recordingDurationMs: 180000,
        participants: [
          { clientId: 'local', displayName: 'host', isHost: true, joinedAtMs: 0, leftAtMs: null },
          { clientId: 'guest-1', displayName: 'Peer2', isHost: false, joinedAtMs: 90000, leftAtMs: null },
        ],
        segments: [],
      }),
    );
    fs.writeFileSync(
      path.join(dir, `${joiner}.transcript.json`),
      JSON.stringify({ schemaVersion: 1, audioFile: joiner, language: 'en', lines: [{ startMs: 500, endMs: 1200, clientId: 'guest-1', name: 'Peer2', text: 'joining late', confidence: 0.9 }], words: [] }),
    );
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db))
      .get(`/api/recordings/named-transcript/${sessionId}`)
      .set('Cookie', cookie)
      .expect(200);

    const peer2 = res.body.transcript.find((l: { name: string }) => l.name === 'Peer2');
    expect(peer2.startMs).toBe(90500);
    expect(peer2.endMs).toBe(91200);
  });

  it('named-transcript interleaves join/leave events from the mixed recording meta.json', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'd98896162f09', 'AGENTROOM');
    const sessionId = 'cccccccc-1111-2222-3333-444444444444';
    const mixed = `2026-07-02T00-00-00-000Z_${sessionId}_d98896162f09_AGENTROOM_aaaaaa.webm`;
    const host = `2026-07-02T00-00-00-001Z_${sessionId}_d98896162f09_AGENTROOM_host_b0b0b0.webm`;
    const guest = `2026-07-02T00-00-00-002Z_${sessionId}_d98896162f09_AGENTROOM_peer2_c0c0c0.webm`;
    for (const filename of [mixed, host, guest]) fs.writeFileSync(path.join(dir, filename), Buffer.alloc(8));
    // The mixed (non-per-user) recording carries NO .participant.json — that's how it's
    // distinguished from per-user files — but DOES carry the full participants[] roster.
    fs.writeFileSync(
      path.join(dir, `${mixed}.meta.json`),
      JSON.stringify({
        schemaVersion: 1,
        sessionId,
        roomId: 'd98896162f09',
        recordingStartedAtIso: '2026-07-02T00:00:00.000Z',
        recordingDurationMs: 300000,
        participants: [
          { clientId: 'local', displayName: 'host', isHost: true, joinedAtMs: 0, leftAtMs: null },
          { clientId: 'guest-1', displayName: 'Peer2', isHost: false, joinedAtMs: 123000, leftAtMs: 290000 },
        ],
        segments: [],
      }),
    );
    fs.writeFileSync(
      path.join(dir, `${host}.participant.json`),
      JSON.stringify({ displayName: 'host', clientId: 'local', joinedAtMs: 0, isPerUser: true }),
    );
    fs.writeFileSync(
      path.join(dir, `${guest}.participant.json`),
      JSON.stringify({ displayName: 'Peer2', clientId: 'guest-1', joinedAtMs: 123000, isPerUser: true }),
    );
    fs.writeFileSync(
      path.join(dir, `${host}.transcript.json`),
      JSON.stringify({ schemaVersion: 1, audioFile: host, language: 'en', lines: [{ startMs: 1000, endMs: 1500, clientId: 'local', name: 'host', text: 'hello', confidence: 0.9 }], words: [] }),
    );
    fs.writeFileSync(
      path.join(dir, `${guest}.transcript.json`),
      JSON.stringify({ schemaVersion: 1, audioFile: guest, language: 'en', lines: [{ startMs: 500, endMs: 1200, clientId: 'guest-1', name: 'Peer2', text: 'joining now', confidence: 0.9 }], words: [] }),
    );
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);

    const res = await request(app)
      .get(`/api/recordings/named-transcript/${sessionId}`)
      .set('Cookie', cookie)
      .expect(200);

    const kinds = res.body.transcript.map((l: { kind: string; name: string; text: string; startMs: number }) => ({ kind: l.kind, name: l.name, text: l.text, startMs: l.startMs }));
    expect(kinds).toEqual([
      { kind: 'event', name: 'host', text: 'host joined', startMs: 0 },
      { kind: 'speech', name: 'host', text: 'hello', startMs: 1000 },
      { kind: 'event', name: 'Peer2', text: 'Peer2 joined', startMs: 123000 },
      { kind: 'speech', name: 'Peer2', text: 'joining now', startMs: 123500 },
      { kind: 'event', name: 'Peer2', text: 'Peer2 left', startMs: 290000 },
    ]);

    const download = await request(app)
      .get(`/api/recordings/named-transcript/${sessionId}/download`)
      .set('Cookie', cookie)
      .expect(200);
    expect(download.headers['content-disposition']).toContain(`meeting-transcript-${sessionId}.txt`);
    expect(download.text).toContain('[00:00] — host joined —');
    expect(download.text).toContain('[00:01] host: hello');
    expect(download.text).toContain('[02:03] — Peer2 joined —');
    expect(download.text).toContain('[04:50] — Peer2 left —');
  });

  it('DELETE named-transcript removes all speaker transcripts but keeps the recordings', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'd98896162f09', 'AGENTROOM');
    const sessionId = 'dddddddd-1111-2222-3333-444444444444';
    const host = `2026-07-02T00-00-00-001Z_${sessionId}_d98896162f09_AGENTROOM_host_b0b0b0.webm`;
    const guest = `2026-07-02T00-00-00-002Z_${sessionId}_d98896162f09_AGENTROOM_peer2_c0c0c0.webm`;
    for (const filename of [host, guest]) fs.writeFileSync(path.join(dir, filename), Buffer.alloc(8));
    fs.writeFileSync(path.join(dir, `${host}.participant.json`), JSON.stringify({ displayName: 'host', clientId: 'local', joinedAtMs: 0, isPerUser: true }));
    fs.writeFileSync(path.join(dir, `${guest}.participant.json`), JSON.stringify({ displayName: 'Peer2', clientId: 'guest-1', joinedAtMs: 0, isPerUser: true }));
    fs.writeFileSync(
      path.join(dir, `${host}.transcript.json`),
      JSON.stringify({ schemaVersion: 1, audioFile: host, language: 'en', lines: [{ startMs: 0, endMs: 500, clientId: 'local', name: 'host', text: 'hi', confidence: 0.9 }], words: [] }),
    );
    fs.writeFileSync(
      path.join(dir, `${guest}.transcript.json`),
      JSON.stringify({ schemaVersion: 1, audioFile: guest, language: 'en', lines: [{ startMs: 0, endMs: 500, clientId: 'guest-1', name: 'Peer2', text: 'hey', confidence: 0.9 }], words: [] }),
    );
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);

    const del = await request(app).delete(`/api/recordings/named-transcript/${sessionId}`).set('Cookie', cookie).expect(200);
    expect(del.body).toEqual({ ok: true, deleted: 2 });

    // Transcripts gone.
    expect(fs.existsSync(path.join(dir, `${host}.transcript.json`))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${guest}.transcript.json`))).toBe(false);
    // Recording audio + participant sidecars untouched.
    expect(fs.existsSync(path.join(dir, host))).toBe(true);
    expect(fs.existsSync(path.join(dir, guest))).toBe(true);
    expect(fs.existsSync(path.join(dir, `${host}.participant.json`))).toBe(true);

    await request(app).get(`/api/recordings/named-transcript/${sessionId}`).set('Cookie', cookie).expect(404, { error: 'no transcripts ready yet' });
  });

  it('B1b normalizes mocked OpenRouter output with owner-only labels', () => {
    const filename = 'host.webm';
    const owner = { clientId: 'host-1', name: 'Host' };
    const payload = normalizeOpenRouterTranscript(
      {
        words: [
          { word: 'Kumusta', start: 0.0, end: 0.4, probability: 0.91 },
          { word: 'team', start: 0.5, end: 0.9, probability: 0.88 },
        ],
      },
      filename,
      owner,
      'openai/whisper-1',
    );

    expect(payload.provider).toBe('openrouter');
    expect(payload.model).toBe('openai/whisper-1');
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0].name).toBe('Host');
    expect(payload.lines[0].clientId).toBe('host-1');
    expect(payload.words.every((word) => word.name === 'Host')).toBe(true);
    expect(payload.words.some((word) => word.name === '?')).toBe(false);
  });

  it('B1b mocked OpenRouter HTTP writes a versioned owner-labeled transcript', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const filename = '2026-06-23T06-00-00-000Z_aaa111aaa111_Mine_111111.webm';
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, Buffer.alloc(32));
    fs.writeFileSync(
      path.join(dir, `${filename}.participant.json`),
      JSON.stringify({ displayName: 'Host', clientId: 'host-1', isPerUser: true }),
    );
    delete process.env.MEET_TRANSCRIBE_DISABLED;
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          words: [
            { word: 'hello', start: 0.0, end: 0.4, probability: 0.95 },
            { word: 'world', start: 0.5, end: 0.9, probability: 0.93 },
          ],
        }),
      })),
    );
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);

    await request(app)
      .put('/api/llm/settings')
      .set('Cookie', cookie)
      .send({ transcriptionProvider: 'openrouter' })
      .expect(200);

    await request(app)
      .post(`/api/recordings/${filename}/transcribe`)
      .set('Cookie', cookie)
      .send({ force: true, provider: 'openrouter', model: 'openai/whisper-1' })
      .expect(200, { ok: true, status: 'started' });

    const versionPath = path.join(dir, `${filename}.transcript.openrouter-openai-whisper-1.json`);
    await waitForFile(versionPath);
    const transcript = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    expect(transcript.provider).toBe('openrouter');
    expect(transcript.model).toBe('openai/whisper-1');
    expect(transcript.lines[0].name).toBe('Host');
    expect(transcript.words.every((word: { name: string }) => word.name === 'Host')).toBe(true);
  });

  it('B1b missing OPENROUTER_API_KEY is a logged no-op that never errors transcribe', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const filename = '2026-06-23T06-01-00-000Z_aaa111aaa111_Mine_222222.webm';
    fs.writeFileSync(path.join(dir, filename), Buffer.alloc(32));
    fs.writeFileSync(
      path.join(dir, `${filename}.participant.json`),
      JSON.stringify({ displayName: 'Host', clientId: 'host-1', isPerUser: true }),
    );
    delete process.env.MEET_TRANSCRIBE_DISABLED;
    delete process.env.OPENROUTER_API_KEY;
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);

    await request(app)
      .put('/api/llm/settings')
      .set('Cookie', cookie)
      .send({ transcriptionProvider: 'openrouter' })
      .expect(200);

    await request(app)
      .post(`/api/recordings/${filename}/transcribe`)
      .set('Cookie', cookie)
      .send({ force: true, provider: 'openrouter', model: 'openai/whisper-1' })
      .expect(200, { ok: true, status: 'started' });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(fs.existsSync(path.join(dir, `${filename}.transcript.openrouter-openai-whisper-1.json`))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${filename}.transcribe.lock`))).toBe(false);
  });

  it('B1b versioned transcripts coexist, delete one, and primary resolves', async () => {
    const db = createTestDb();
    seedUser(db);
    const dir = createRecordingDir();
    insertRoom(db, 'aaa111aaa111', 'Mine');
    const filename = '2026-06-23T06-02-00-000Z_aaa111aaa111_Mine_333333.webm';
    fs.writeFileSync(path.join(dir, filename), Buffer.alloc(8));
    const smallPath = path.join(dir, `${filename}.transcript.local-small.json`);
    const mediumPath = path.join(dir, `${filename}.transcript.local-medium.json`);
    fs.writeFileSync(
      smallPath,
      JSON.stringify({
        schemaVersion: 1,
        provider: 'local',
        model: 'small',
        audioFile: filename,
        lines: [{ startMs: 0, endMs: 500, clientId: 'host', name: 'Host', text: 'small run', confidence: 0.9 }],
        words: [],
      }),
    );
    fs.writeFileSync(
      mediumPath,
      JSON.stringify({
        schemaVersion: 1,
        provider: 'local',
        model: 'medium',
        audioFile: filename,
        lines: [{ startMs: 0, endMs: 500, clientId: 'host', name: 'Host', text: 'medium run', confidence: 0.9 }],
        words: [],
      }),
    );
    fs.writeFileSync(path.join(dir, `${filename}.transcript.primary.json`), JSON.stringify({ provider: 'local', model: 'small' }));
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);

    const versions = await request(app)
      .get(`/api/recordings/${filename}/transcript/versions`)
      .set('Cookie', cookie)
      .expect(200);

    expect(versions.body.versions).toHaveLength(2);

    const primary = await request(app).get(`/api/recordings/${filename}/transcript`).set('Cookie', cookie).expect(200);
    expect(primary.body.model).toBe('small');
    expect(primary.body.lines[0].text).toBe('small run');

    await request(app)
      .delete(`/api/recordings/${filename}/transcript/versions`)
      .query({ provider: 'local', model: 'small' })
      .set('Cookie', cookie)
      .expect(204);

    expect(fs.existsSync(smallPath)).toBe(false);
    expect(fs.existsSync(mediumPath)).toBe(true);

    await request(app)
      .put(`/api/recordings/${filename}/transcript/primary`)
      .set('Cookie', cookie)
      .send({ provider: 'local', model: 'medium' })
      .expect(200, { ok: true, provider: 'local', model: 'medium' });

    const resolved = await request(app).get(`/api/recordings/${filename}/transcript`).set('Cookie', cookie).expect(200);
    expect(resolved.body.model).toBe('medium');
    expect(resolved.body.lines[0].text).toBe('medium run');
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
