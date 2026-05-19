import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { openSession } from '../src/modules/sessions/store.js';
import { createApp } from '../src/server.js';
import { createTestDb } from './helpers.js';

const recordingDirs: string[] = [];

function createRecordingDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-poc-session-recordings-'));
  recordingDirs.push(dir);
  process.env.MEET_RECORDINGS_DIR = dir;
  return dir;
}

function insertUser(db: Database.Database, email: string): void {
  db.prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    email,
    '00:00',
    Date.now(),
    Date.now(),
  );
}

function insertEndedSession(
  db: Database.Database,
  roomId: string,
  hostEmail: string,
  startedAt: number,
  endedAt: number,
  admittedPeak: number,
  reason = 'last-peer-left',
): string {
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO meeting_sessions (id, room_id, host_email, started_at, ended_at, ended_reason, admitted_peak) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, roomId, hostEmail, startedAt, endedAt, reason, admittedPeak);
  return id;
}

afterEach(() => {
  delete process.env.MEET_RECORDINGS_DIR;
  for (const dir of recordingDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('meeting sessions API', () => {
  it('S1.6 lists only active sessions for the authenticated owner', async () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    const roomA = createRoom('Daily', 'jrom@silverjrom.app', db);
    const roomB = createRoom('Planning', 'jrom@silverjrom.app', db);
    const roomC = createRoom('Other', 'other@silverjrom.app', db);
    openSession(roomA.id, 'jrom@silverjrom.app', db);
    openSession(roomB.id, 'jrom@silverjrom.app', db);
    openSession(roomC.id, 'other@silverjrom.app', db);
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db))
      .get('/api/meeting-sessions?status=active')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions.map((session: { roomTitle: string }) => session.roomTitle).sort()).toEqual(['Daily', 'Planning']);
    expect(res.body.sessions[0]).toMatchObject({
      id: expect.any(String),
      roomId: expect.any(String),
      roomTitle: expect.any(String),
      hostEmail: 'jrom@silverjrom.app',
      startedAtIso: expect.any(String),
      admittedPeak: 0,
    });
  });

  it('S1.7 filters ended-session junk by admitted_peak and minimum duration', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Past', 'jrom@silverjrom.app', db);
    const now = Date.now();
    insertEndedSession(db, room.id, 'jrom@silverjrom.app', now - 30000, now, 2);
    insertEndedSession(db, room.id, 'jrom@silverjrom.app', now - 5000, now, 1);
    insertEndedSession(db, room.id, 'jrom@silverjrom.app', now - 60000, now, 0);
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db))
      .get('/api/meeting-sessions?status=ended')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0]).toMatchObject({
      roomTitle: 'Past',
      endedReason: 'last-peer-left',
      admittedPeak: 2,
      durationMs: 30000,
    });
  });

  it('S1.8 paginates ended sessions with a capped positive page size', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Archive', 'jrom@silverjrom.app', db);
    const now = Date.now();
    for (let i = 0; i < 25; i += 1) {
      const endedAt = now - i * 1000;
      insertEndedSession(db, room.id, 'jrom@silverjrom.app', endedAt - 30000, endedAt, 2);
    }
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db);

    const page1 = await request(app)
      .get('/api/meeting-sessions?status=ended&page=1&pageSize=20')
      .set('Cookie', cookie)
      .expect(200);
    const page2 = await request(app)
      .get('/api/meeting-sessions?status=ended&page=2&pageSize=20')
      .set('Cookie', cookie)
      .expect(200);

    expect(page1.body).toMatchObject({ page: 1, pageSize: 20, total: 25 });
    expect(page1.body.sessions).toHaveLength(20);
    expect(page2.body).toMatchObject({ page: 2, pageSize: 20, total: 25 });
    expect(page2.body.sessions).toHaveLength(5);
  });

  it('S4.3 includes recordingsCount on ended session rows', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Archive', 'jrom@silverjrom.app', db);
    const now = Date.now();
    const sessionId = insertEndedSession(db, room.id, 'jrom@silverjrom.app', now - 60000, now, 2);
    const dir = createRecordingDir();
    fs.writeFileSync(path.join(dir, `2026-05-19T03-00-00-000Z_${sessionId}_${room.id}_Archive_111111.webm`), Buffer.alloc(5));
    fs.writeFileSync(path.join(dir, `2026-05-19T03-01-00-000Z_${sessionId}_${room.id}_Archive_222222.webm`), Buffer.alloc(6));
    fs.writeFileSync(path.join(dir, `2026-05-19T03-02-00-000Z_${room.id}_Archive_333333.webm`), Buffer.alloc(7));
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;

    const res = await request(createApp(db))
      .get('/api/meeting-sessions?status=ended')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0]).toMatchObject({
      id: sessionId,
      roomTitle: 'Archive',
      recordingsCount: 2,
    });
  });
});
