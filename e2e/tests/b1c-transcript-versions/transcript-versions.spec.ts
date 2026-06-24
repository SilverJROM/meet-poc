import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix, insertMeetingSession, openE2eDb, recordingsDir } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const PREFIX = 'B1CVER';
const SCREENSHOT_DIR = '../plan/WK_0623/projcore-run-2026-06-23/batch-B1c/screenshots';
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

test('B1c transcript versions panel lists versions with add/delete/set-primary controls', async ({ page, request }) => {
  cleanupRecordingsByPrefix(PREFIX);
  const room = await createRoomViaApi(request, `${PREFIX} Room ${Date.now()}`);
  const seeded = seedVersionedRecording(room);

  await loginAsJrom(page);
  await page.goto('/app/transcripts');

  const row = page.locator('.transcript-row').filter({ hasText: seeded.filename });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Track' }).click();

  const versionsPanel = page.locator('.versions-panel');
  await expect(versionsPanel).toBeVisible();
  await expect(versionsPanel.getByText('local / small')).toBeVisible();
  await expect(versionsPanel.getByText('local / medium')).toBeVisible();
  await expect(versionsPanel.getByText('Primary', { exact: true })).toBeVisible();
  await expect(versionsPanel.getByRole('button', { name: 'Set primary' })).toBeVisible();
  await expect(versionsPanel.getByRole('button', { name: 'Delete' })).toHaveCount(2);
  await expect(versionsPanel.getByRole('button', { name: 'Add transcription' })).toBeVisible();
  await expect(versionsPanel.locator('select').first()).toBeVisible();
  await expect(page.locator('.viewer-head span').filter({ hasText: 'local / small' })).toBeVisible();

  await page.screenshot({ path: `${SCREENSHOT_DIR}/transcript-versions-panel.png`, fullPage: true });
});

function seedVersionedRecording(room: TestRoom): { filename: string } {
  const suffix = crypto.randomBytes(3).toString('hex');
  const sessionId = crypto.randomUUID();
  const now = Date.now() - 2 * 60 * 60 * 1000;
  const filename = `2026-06-23T12-00-00-000Z_${sessionId}_${room.id}_${PREFIX}_${suffix}.webm`;
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
  fs.writeFileSync(
    path.join(dir, `${filename}.transcript.local-small.json`),
    JSON.stringify(versionPayload(filename, 'small', 'small run text'), null, 2),
  );
  fs.writeFileSync(
    path.join(dir, `${filename}.transcript.local-medium.json`),
    JSON.stringify(versionPayload(filename, 'medium', 'medium run text'), null, 2),
  );
  fs.writeFileSync(path.join(dir, `${filename}.transcript.primary.json`), JSON.stringify({ provider: 'local', model: 'small' }));
  return { filename };
}

function versionPayload(filename: string, model: string, text: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    provider: 'local',
    model,
    transcribedAtIso: '2026-06-23T12:00:15.000Z',
    audioFile: filename,
    language: 'en',
    lines: [{ startMs: 0, endMs: 500, clientId: 'host', name: 'Host', text, confidence: 0.9 }],
    words: [],
  };
}