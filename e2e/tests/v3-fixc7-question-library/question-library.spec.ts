import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, test } from '@playwright/test';
import { email, initialPassword, loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix, insertMeetingSession, openE2eDb, recordingsDir } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const PREFIX = 'FIXC7QL';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc7/screenshots';
const fixtureDir = path.resolve(process.cwd(), 'fixtures', 'audio');
const fixtureAudio = path.join(fixtureDir, 'synth-taglish.webm');
const fixtureMeta = path.join(fixtureDir, 'synth-taglish.meta.json');

type Question = {
  id: string;
  name: string;
  prompt: string;
  autoRun: boolean;
  providerOverride: string | null;
  isDefault: boolean;
};

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
});

test.afterEach(async ({ request }) => {
  await resetDefaultProvider(request);
  cleanupRecordingsByPrefix(PREFIX);
  cleanupRoomsByPrefix(PREFIX);
});

test('FIXC7.1 settings lists providers and seeded question library', async ({ page }) => {
  await loginAsJrom(page);
  await page.goto('/app/settings');

  await expect(page.getByRole('heading', { name: 'LLM Provider Default' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Claude Sonnet/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Codex gpt-5\.3-codex-spark/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ollama mistral-nemo:12b/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Question Library' })).toBeVisible();
  await expect(page.getByText('Summarize meeting', { exact: true })).toBeVisible();
  await expect(page.getByText('Extract action items', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/settings-question-library.png`, fullPage: true });
});

test('FIXC7.2 star selects the default LLM provider', async ({ page, request }) => {
  await loginAsJrom(page);
  await page.goto('/app/settings');

  await page.getByRole('button', { name: /Codex gpt-5\.3-codex-spark/ }).click();
  await expect(page.getByText('Default provider saved')).toBeVisible();

  await request.post('/api/login', { data: { email, password: initialPassword() } });
  const settings = await apiJson(request, '/api/llm/settings');
  expect(settings.defaultProvider).toBe('codex');
});

test('FIXC7.3 creates, edits, stars, and deletes a library question', async ({ page }) => {
  const name = `${PREFIX} Risks ${Date.now()}`;
  await loginAsJrom(page);
  await page.goto('/app/settings');

  await page.locator('#question-name').fill(name);
  await page.locator('#question-prompt').fill('List unresolved risks and blockers.');
  await page.getByLabel('Auto-run on transcribe').check();
  await page.locator('#provider-override').selectOption({ label: 'Codex gpt-5.3-codex-spark' });
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText(name)).toBeVisible();

  const row = page.locator('.question-row').filter({ hasText: name });
  await row.getByRole('button', { name: 'Edit question' }).click();
  await page.locator('#question-name').fill(`${name} updated`);
  await page.locator('#provider-override').selectOption({ label: 'Default provider' });
  await page.getByRole('button', { name: 'Update' }).click();
  await expect(page.getByText(`${name} updated`)).toBeVisible();

  const updatedRow = page.locator('.question-row').filter({ hasText: `${name} updated` });
  await updatedRow.getByRole('button', { name: 'Set default question' }).click();
  await expect(page.getByText('Default question saved')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await updatedRow.getByRole('button', { name: 'Delete question' }).click();
  await expect(page.getByText(`${name} updated`)).toHaveCount(0);
});

test('FIXC7.4 manual Run renders analysis on a transcript', async ({ page, request }) => {
  const room = await createFixRoom(request, 'manual-run');
  const seeded = seedFixtureRecording(room, 'manual-run');
  const question = await firstQuestion(request);
  await loginAsJrom(page);
  await page.goto('/app/transcripts');
  await page.locator('.transcript-row').filter({ hasText: seeded.filename }).getByRole('button', { name: 'View' }).click();

  await page.route(`**/api/recordings/${encodeURIComponent(seeded.filename)}/analyze`, async (route) => {
    const analysis = fakeAnalysis(seeded.filename, question);
    fs.writeFileSync(path.join(recordingsDir(), `${seeded.filename}.analysis.${analysis.questionSlug}.json`), JSON.stringify(analysis, null, 2));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ analysis }) });
  });

  await page.locator('.analysis-row').filter({ hasText: question.name }).getByRole('button', { name: 'Run' }).click();
  await expect(page.getByText('FIXC7 browser analysis result')).toBeVisible();
});

test('FIXC7.5 saved analysis sidecar persists across reload', async ({ page, request }) => {
  const room = await createFixRoom(request, 'persist');
  const seeded = seedFixtureRecording(room, 'persist');
  const question = await firstQuestion(request);
  const analysis = fakeAnalysis(seeded.filename, question);
  fs.writeFileSync(path.join(recordingsDir(), `${seeded.filename}.analysis.${analysis.questionSlug}.json`), JSON.stringify(analysis, null, 2));
  await loginAsJrom(page);
  await page.goto('/app/transcripts');

  await page.locator('.transcript-row').filter({ hasText: seeded.filename }).getByRole('button', { name: 'View' }).click();
  await expect(page.getByText('FIXC7 browser analysis result')).toBeVisible();
  await page.reload();
  await page.locator('.transcript-row').filter({ hasText: seeded.filename }).getByRole('button', { name: 'View' }).click();
  await expect(page.getByText('FIXC7 browser analysis result')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/transcript-with-analysis.png`, fullPage: true });
});

test('FIXC7.6 auto-run sidecar is surfaced with its question', async ({ page, request }) => {
  const room = await createFixRoom(request, 'auto-sidecar');
  const seeded = seedFixtureRecording(room, 'auto-sidecar');
  const question = await firstQuestion(request);
  const analysis = fakeAnalysis(seeded.filename, question, 'Auto-run summary persisted');
  fs.writeFileSync(path.join(recordingsDir(), `${seeded.filename}.analysis.${analysis.questionSlug}.json`), JSON.stringify(analysis, null, 2));
  await loginAsJrom(page);
  await page.goto('/app/transcripts');

  await page.locator('.transcript-row').filter({ hasText: seeded.filename }).getByRole('button', { name: 'View' }).click();
  const analysisRow = page.locator('.analysis-row').filter({ hasText: question.name });
  await expect(analysisRow).toContainText('Auto-run');
  await expect(analysisRow).toContainText('Auto-run summary persisted');
});

async function createFixRoom(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${PREFIX} ${suffix} ${Date.now()}`);
}

async function firstQuestion(request: APIRequestContext): Promise<Question> {
  await request.post('/api/login', { data: { email, password: initialPassword() } });
  const body = await apiJson(request, '/api/questions');
  return body.questions[0] as Question;
}

async function resetDefaultProvider(request: APIRequestContext): Promise<void> {
  await request.post('/api/login', { data: { email, password: initialPassword() } }).catch(() => undefined);
  await request.put('/api/llm/settings', { data: { defaultProvider: 'ollama' } }).catch(() => undefined);
}

async function apiJson(request: APIRequestContext, url: string): Promise<any> {
  const res = await request.get(url);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

function seedFixtureRecording(room: TestRoom, label: string): { filename: string } {
  const suffix = crypto.randomBytes(3).toString('hex');
  const sessionId = crypto.randomUUID();
  const now = Date.now() - 4 * 60 * 60 * 1000;
  const filename = `2026-05-19T13-00-00-000Z_${sessionId}_${room.id}_${PREFIX}_${label}_${suffix}.webm`;
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

function fakeAnalysis(filename: string, question: Question, text = 'FIXC7 browser analysis result'): Record<string, unknown> {
  return {
    schemaVersion: 1,
    filename,
    questionId: question.id,
    questionName: question.name,
    questionSlug: slugQuestionName(question.name),
    provider: 'ollama',
    model: 'mistral-nemo:12b',
    ranAtIso: new Date().toISOString(),
    text,
    latencyMs: 1,
  };
}

function fakeTranscript(filename: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    transcribedAtIso: '2026-05-19T13:00:15.000Z',
    audioFile: filename,
    language: 'en',
    languageProbability: 0.99,
    model: 'medium',
    lines: [
      { startMs: 0, endMs: 4096, clientId: 'speaker-one', name: 'Ari', text: 'Review the question library settings.', confidence: 0.96 },
      { startMs: 4097, endMs: 9332, clientId: 'speaker-two', name: 'Bela', text: 'Create action items after the transcript is ready.', confidence: 0.94 },
      { startMs: 9333, endMs: 13_500, clientId: 'speaker-one', name: 'Ari', text: 'Save the analysis sidecar for reload testing.', confidence: 0.92 },
    ],
    words: [],
  };
}

function slugQuestionName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'question';
}
