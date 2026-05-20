import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, test } from '@playwright/test';
import { email, initialPassword, loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix, insertMeetingSession, openE2eDb, recordingsDir } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const PREFIX = 'FIXC8TC';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc8/screenshots';
const fixtureDir = path.resolve(process.cwd(), 'fixtures', 'audio');
const fixtureAudio = path.join(fixtureDir, 'synth-taglish.webm');
const fixtureMeta = path.join(fixtureDir, 'synth-taglish.meta.json');
const fakeWorker = path.resolve(process.cwd(), '.fixc8-fake-transcribe.cjs');

test.beforeAll(async () => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  fs.writeFileSync(
    fakeWorker,
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      'const file = process.argv[2];',
      "const model = process.env.WHISPER_MODEL || 'medium';",
      'const payload = { schemaVersion: 1, transcribedAtIso: new Date().toISOString(), audioFile: path.basename(file), language: "en", languageProbability: 1, model, lines: [], words: [] };',
      'fs.writeFileSync(`${file}.transcript.json`, JSON.stringify(payload, null, 2));',
      'process.exit(0);',
    ].join('\n'),
  );
  restartBackend({
    MEET_TRANSCRIBE_PYTHON: process.execPath,
    MEET_TRANSCRIBE_SCRIPT: fakeWorker,
  });
  await waitForHealth();
});

test.afterAll(async () => {
  restartBackend({ MEET_TRANSCRIBE_PYTHON: '', MEET_TRANSCRIBE_SCRIPT: '' });
  await waitForHealth();
  fs.rmSync(fakeWorker, { force: true });
});

test.afterEach(async ({ request }) => {
  await resetTranscriberModel(request);
  cleanupRecordingsByPrefix(PREFIX);
  cleanupRoomsByPrefix(PREFIX);
});

test('FIXC8.1 settings dropdown renders three options with medium default', async ({ page, request }) => {
  await resetTranscriberModel(request);
  await loginAsJrom(page);
  await page.goto('/app/settings');

  const dropdown = page.locator('#transcriber-model');
  await expect(dropdown).toBeVisible();
  await expect(dropdown).toHaveValue('medium');
  await expect(dropdown.locator('option')).toHaveCount(3);
  await expect(dropdown.locator('option')).toContainText(['small', 'medium', 'large-v3']);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/settings-transcriber-dropdown.png`, fullPage: true });
});

test('FIXC8.2 changing the dropdown persists after reload', async ({ page }) => {
  await loginAsJrom(page);
  await page.goto('/app/settings');

  await page.locator('#transcriber-model').selectOption('large-v3');
  await expect(page.getByText('Transcriber model saved')).toBeVisible();
  await page.reload();
  await expect(page.locator('#transcriber-model')).toHaveValue('large-v3');
});

test('FIXC8.3 force re-transcribe passes selected model into the sidecar', async ({ page, request }) => {
  const room = await createFixRoom(request, 'small-model');
  const seeded = seedFixtureRecording(room, 'small-model');
  await loginAsJrom(page);
  await page.goto('/app/settings');
  await page.locator('#transcriber-model').selectOption('small');
  await expect(page.getByText('Transcriber model saved')).toBeVisible();

  await request.post('/api/login', { data: { email, password: initialPassword() } });
  const res = await request.post(`/api/recordings/${encodeURIComponent(seeded.filename)}/transcribe`, { data: { force: true } });
  expect(res.ok()).toBeTruthy();

  const transcriptPath = path.join(recordingsDir(), `${seeded.filename}.transcript.json`);
  await expect.poll(() => transcriptModel(transcriptPath), { timeout: 8000 }).toBe('small');
});

async function createFixRoom(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${PREFIX} ${suffix} ${Date.now()}`);
}

async function resetTranscriberModel(request: APIRequestContext): Promise<void> {
  await request.post('/api/login', { data: { email, password: initialPassword() } }).catch(() => undefined);
  await request.put('/api/llm/settings', { data: { transcriberModel: 'medium' } }).catch(() => undefined);
}

function seedFixtureRecording(room: TestRoom, label: string): { filename: string } {
  const suffix = crypto.randomBytes(3).toString('hex');
  const sessionId = crypto.randomUUID();
  const now = Date.now() - 4 * 60 * 60 * 1000;
  const filename = `2026-05-19T14-00-00-000Z_${sessionId}_${room.id}_${PREFIX}_${label}_${suffix}.webm`;
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
  fs.writeFileSync(path.join(dir, `${filename}.transcript.json`), JSON.stringify(fakeTranscript(filename), null, 2));
  return { filename };
}

function fakeTranscript(filename: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    transcribedAtIso: '2026-05-19T14:00:15.000Z',
    audioFile: filename,
    language: 'en',
    languageProbability: 0.99,
    model: 'medium',
    lines: [{ startMs: 0, endMs: 1000, clientId: 'speaker-one', name: 'Ari', text: 'Initial transcript.', confidence: 0.96 }],
    words: [],
  };
}

function transcriptModel(transcriptPath: string): string | null {
  if (!fs.existsSync(transcriptPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(transcriptPath, 'utf8')).model ?? null;
  } catch {
    return null;
  }
}

function restartBackend(env: Record<string, string>): void {
  execFileSync('pm2', ['restart', 'meet-poc-be', '--update-env'], {
    cwd: path.resolve(process.cwd(), '..'),
    env: { ...process.env, ...env },
    stdio: 'ignore',
  });
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://localhost:4720/health');
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('backend health check timed out');
}
