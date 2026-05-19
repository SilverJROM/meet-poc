import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import {
  cleanupRecordingsByPrefix,
  insertMeetingSession,
  openE2eDb,
  recordingsDir,
} from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const prefix = 'FIXB4TR';
const fixtureDir = path.resolve(process.cwd(), 'fixtures', 'audio');
const fixtureAudio = path.join(fixtureDir, 'synth-taglish.webm');
const fixtureMeta = path.join(fixtureDir, 'synth-taglish.meta.json');

test.afterEach(() => {
  cleanupRecordingsByPrefix(prefix);
});

test('FIX-B4 transcripts page lists, opens, and starts transcript work', async ({ page, request }) => {
  cleanupRecordingsByPrefix(prefix);
  const room = await createRoomViaApi(request, `${prefix} Room ${Date.now()}`);
  const ready = seedFixtureRecording(room, 'ready', true);
  const pending = seedFixtureRecording(room, 'pending', false);

  await loginAsJrom(page);
  await page.goto('/app/transcripts');

  const readyRow = page.locator('.transcript-row').filter({ hasText: ready.filename });
  const pendingRow = page.locator('.transcript-row').filter({ hasText: pending.filename });
  await expect(readyRow).toBeVisible();
  await expect(pendingRow).toBeVisible();
  await expect(readyRow.getByRole('button', { name: 'View' })).toBeVisible();
  await expect(pendingRow.getByRole('button', { name: 'Transcribe' })).toBeVisible();
  await expect(pendingRow.getByRole('button', { name: 'View' })).toHaveCount(0);

  await readyRow.getByRole('button', { name: 'View' }).click();
  await expect(page.locator('.transcript-line').filter({ hasText: 'Ari:' })).toContainText('Hello JROM this is speaker one');
  await expect(page.locator('.transcript-line').filter({ hasText: 'Bela:' })).toContainText('Speaker two replies kumusta team');

  await page.screenshot({
    path: '../plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixb/batch-fixb4/screenshots/transcripts-page-e2e.png',
    fullPage: true,
  });
});

function seedFixtureRecording(room: TestRoom, label: string, withTranscript: boolean): { filename: string } {
  const suffix = crypto.randomBytes(3).toString('hex');
  const sessionId = crypto.randomUUID();
  const now = Date.now() + 20_000_000;
  const filename = `2026-05-19T12-0${withTranscript ? '0' : '1'}-00-000Z_${sessionId}_${room.id}_${prefix}_${label}_${suffix}.webm`;
  const dir = recordingsDir();
  fs.mkdirSync(dir, { recursive: true });
  const db = openE2eDb();
  try {
    insertMeetingSession(db, {
      id: sessionId,
      roomId: room.id,
      startedAt: now,
      endedAt: now + 14_000,
      admittedPeak: 2,
      endedReason: 'test-fixture',
    });
  } finally {
    db.close();
  }
  fs.copyFileSync(fixtureAudio, path.join(dir, filename));
  fs.utimesSync(path.join(dir, filename), now / 1000, now / 1000);
  const meta = JSON.parse(fs.readFileSync(fixtureMeta, 'utf8')) as Record<string, unknown>;
  meta['sessionId'] = sessionId;
  meta['roomId'] = room.id;
  fs.writeFileSync(path.join(dir, `${filename}.meta.json`), JSON.stringify(meta, null, 2));
  if (withTranscript) {
    fs.writeFileSync(path.join(dir, `${filename}.transcript.json`), JSON.stringify(fakeTranscript(filename), null, 2));
  }
  return { filename };
}

function fakeTranscript(filename: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    transcribedAtIso: '2026-05-19T12:00:15.000Z',
    audioFile: filename,
    language: 'en',
    languageProbability: 0.99,
    model: 'medium',
    lines: [
      {
        startMs: 0,
        endMs: 4096,
        clientId: 'speaker-one',
        name: 'Ari',
        text: 'Hello JROM this is speaker one starting the transcript test.',
        confidence: 0.96,
      },
      {
        startMs: 4097,
        endMs: 9332,
        clientId: 'speaker-two',
        name: 'Bela',
        text: 'Speaker two replies kumusta team the audio fixture is ready.',
        confidence: 0.94,
      },
    ],
    words: [
      { startMs: 0, endMs: 500, text: 'Hello', clientId: 'speaker-one', name: 'Ari', confidence: 0.96 },
      { startMs: 4097, endMs: 4700, text: 'Speaker', clientId: 'speaker-two', name: 'Bela', confidence: 0.94 },
    ],
  };
}
