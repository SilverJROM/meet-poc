import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export const ownerEmail = 'jrom@silverjrom.app';

export function openE2eDb(): Database.Database {
  const dbPath = process.env.MEET_DB_PATH || path.resolve(process.cwd(), '..', 'data', 'meet-poc.sqlite');
  return new Database(dbPath);
}

export function recordingsDir(): string {
  return process.env.MEET_RECORDINGS_DIR || path.resolve(process.cwd(), '..', 'recordings');
}

export function insertRoom(db: Database.Database, id: string, title: string, createdAt: number): void {
  db.prepare('INSERT INTO rooms (id, title, owner_email, created_at) VALUES (?, ?, ?, ?)').run(id, title, ownerEmail, createdAt);
}

export function insertMeetingSession(
  db: Database.Database,
  values: {
    id: string;
    roomId: string;
    startedAt: number;
    endedAt: number | null;
    admittedPeak: number;
    endedReason?: string | null;
  },
): void {
  db.prepare(
    'INSERT INTO meeting_sessions (id, room_id, host_email, started_at, ended_at, ended_reason, admitted_peak) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(values.id, values.roomId, ownerEmail, values.startedAt, values.endedAt, values.endedReason || null, values.admittedPeak);
}

export function cleanupRoomsByPrefix(prefix: string): void {
  const db = openE2eDb();
  try {
    const ids = db.prepare('SELECT id FROM rooms WHERE owner_email = ? AND title LIKE ?').all(ownerEmail, `${prefix}%`) as { id: string }[];
    for (const row of ids) {
      db.prepare('DELETE FROM meeting_sessions WHERE room_id = ?').run(row.id);
    }
    db.prepare('DELETE FROM rooms WHERE owner_email = ? AND title LIKE ?').run(ownerEmail, `${prefix}%`);
  } finally {
    db.close();
  }
}

export function cleanupRecordingsByPrefix(prefix: string): void {
  const dir = recordingsDir();
  if (!fs.existsSync(dir)) return;
  for (const filename of fs.readdirSync(dir)) {
    if (filename.includes(prefix)) fs.rmSync(path.join(dir, filename), { force: true });
  }
}
