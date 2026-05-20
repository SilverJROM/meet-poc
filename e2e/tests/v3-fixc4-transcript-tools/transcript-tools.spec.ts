import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix, insertMeetingSession, openE2eDb, recordingsDir } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const PREFIX = 'FIXC4TR';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc4/screenshots';
const fixtureDir = path.resolve(process.cwd(), 'fixtures', 'audio');
const fixtureAudio = path.join(fixtureDir, 'synth-taglish.webm');
const fixtureMeta = path.join(fixtureDir, 'synth-taglish.meta.json');

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
});

test.afterEach(() => {
  cleanupRecordingsByPrefix(PREFIX);
  cleanupRoomsByPrefix(PREFIX);
});

test('FIXC4.1 transcript Download produces subtitle-style txt', async ({ page, request }) => {
  cleanupRecordingsByPrefix(PREFIX);
  const room = await createFixRoom(request, 'download');
  const seeded = seedFixtureRecording(room, 'download', true);
  await loginAsJrom(page);
  await page.goto('/app/transcripts');

  const row = page.locator('.transcript-row').filter({ hasText: seeded.filename });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Download' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Delete transcript' })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/transcripts-with-download-delete.png`, fullPage: true });

  const downloadPromise = page.waitForEvent('download');
  await row.getByRole('button', { name: 'Download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(seeded.filename.replace(/\.[^.]+$/, '.txt'));
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  const content = fs.readFileSync(downloadedPath as string, 'utf8').trim();
  const lines = content.split(/\r?\n/);
  expect(lines).toHaveLength(3);
  for (const line of lines) {
    expect(line).toMatch(/^\[\d\d:\d\d\] [^:]+: .+/);
  }
  expect(lines).toEqual([
    '[00:00] Ari: Hello JROM this is speaker one starting the transcript test.',
    '[00:04] Bela: Speaker two replies kumusta team the audio fixture is ready.',
    '[00:09] Ari: Closing the meeting with action items and next steps.',
  ]);
});

test('FIXC4.2 transcript delete removes only transcript and keeps audio metadata', async ({ page, request }) => {
  const room = await createFixRoom(request, 'delete');
  const seeded = seedFixtureRecording(room, 'delete', true);
  await loginAsJrom(page);
  await page.goto('/app/transcripts');

  const row = page.locator('.transcript-row').filter({ hasText: seeded.filename });
  await expect(row.getByText('Ready')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await row.getByRole('button', { name: 'Delete transcript' }).click();

  await expect(row.getByRole('button', { name: 'Transcribe' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'View' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Download' })).toHaveCount(0);
  await expect.poll(() => browserRecording(page, seeded.filename)).toMatchObject({ hasTranscript: false });
  expect(fs.existsSync(path.join(recordingsDir(), seeded.filename))).toBe(true);
  expect(fs.existsSync(path.join(recordingsDir(), `${seeded.filename}.meta.json`))).toBe(true);
  expect(fs.existsSync(path.join(recordingsDir(), `${seeded.filename}.transcript.json`))).toBe(false);
});

test('FIXC4.3 deleting the open transcript clears the viewer', async ({ page, request }) => {
  const room = await createFixRoom(request, 'viewer-clear');
  const seeded = seedFixtureRecording(room, 'viewer-clear', true);
  await loginAsJrom(page);
  await page.goto('/app/transcripts');

  const row = page.locator('.transcript-row').filter({ hasText: seeded.filename });
  await row.getByRole('button', { name: 'View' }).click();
  await expect(page.locator('.viewer')).toBeVisible();
  await expect(page.locator('.transcript-line')).toHaveCount(3);

  page.once('dialog', (dialog) => void dialog.accept());
  await row.getByRole('button', { name: 'Delete transcript' }).click();
  await expect(page.locator('.viewer')).toHaveCount(0);
  await expect(page.locator('.transcript-line')).toHaveCount(0);
});

async function createFixRoom(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${PREFIX} ${suffix} ${Date.now()}`);
}

async function browserRecording(page: import('@playwright/test').Page, filename: string): Promise<Record<string, unknown> | null> {
  return page.evaluate(async (target) => {
    const response = await fetch('/api/recordings?page=1&pageSize=100');
    const body = await response.json();
    return body.recordings.find((recording: { filename: string }) => recording.filename === target) ?? null;
  }, filename);
}

function seedFixtureRecording(room: TestRoom, label: string, withTranscript: boolean): { filename: string } {
  const suffix = crypto.randomBytes(3).toString('hex');
  const sessionId = crypto.randomUUID();
  const now = Date.now() - 4 * 60 * 60 * 1000;
  const filename = `2026-05-19T12-0${withTranscript ? '0' : '1'}-00-000Z_${sessionId}_${room.id}_${PREFIX}_${label}_${suffix}.webm`;
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
      {
        startMs: 9333,
        endMs: 13_500,
        clientId: 'speaker-one',
        name: 'Ari',
        text: 'Closing the meeting with action items and next steps.',
        confidence: 0.92,
      },
    ],
    words: [
      { startMs: 0, endMs: 500, text: 'Hello', clientId: 'speaker-one', name: 'Ari', confidence: 0.96 },
      { startMs: 4097, endMs: 4700, text: 'Speaker', clientId: 'speaker-two', name: 'Bela', confidence: 0.94 },
    ],
  };
}
