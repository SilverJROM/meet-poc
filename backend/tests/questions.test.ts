import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import type { LlmProviderId } from '../src/modules/llm/index.js';
import { runAutoAnalysesForRecording } from '../src/modules/questions/index.js';
import { createApp } from '../src/server.js';
import { createTestDb } from './helpers.js';

const recordingDirs: string[] = [];

const fakeLlmService = {
  availability: async () => ({ claude: true, codex: true, ollama: true }),
  get: (provider: LlmProviderId) => ({
    id: provider,
    available: async () => true,
    invoke: async (req: { prompt: string; model?: string }) => ({
      text: `fake ${provider}: ${req.prompt.slice(0, 24)}`,
      provider,
      model: req.model || 'fake-model',
      latencyMs: 1,
    }),
  }),
};

function createRecordingDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-poc-questions-'));
  recordingDirs.push(dir);
  process.env.MEET_RECORDINGS_DIR = dir;
  return dir;
}

function insertRoom(db: Database.Database, id = 'abc123abc123', title = 'Team Sync', ownerEmail = 'jrom@silverjrom.app'): void {
  db.prepare('INSERT INTO rooms (id, title, owner_email, created_at) VALUES (?, ?, ?, ?)').run(id, title, ownerEmail, Date.now());
}

function insertUser(db: Database.Database, email: string): void {
  db.prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    email,
    '00:00',
    Date.now(),
    Date.now(),
  );
}

function authCookie(db: Database.Database, email = 'jrom@silverjrom.app'): string {
  return `session=${createSession(email, db)}`;
}

function writeRecordingWithTranscript(dir: string, filename = '2026-05-19T03-00-00-000Z_abc123abc123_Team_Sync_111111.webm'): string {
  fs.writeFileSync(path.join(dir, filename), Buffer.from('audio'));
  fs.writeFileSync(
    path.join(dir, `${filename}.transcript.json`),
    JSON.stringify({
      schemaVersion: 1,
      audioFile: filename,
      language: 'en',
      lines: [
        { startMs: 0, endMs: 1200, clientId: 'a', name: 'Alice', text: 'We should ship the settings page.', confidence: 0.9 },
        { startMs: 1300, endMs: 2400, clientId: 'b', name: 'Bob', text: 'I will own the follow up.', confidence: 0.88 },
      ],
      words: [],
    }),
  );
  return filename;
}

afterEach(() => {
  delete process.env.MEET_RECORDINGS_DIR;
  delete process.env.MEET_LLM_ANALYZE_FAKE;
  delete process.env.MEET_LLM_FAKE_RESPONSE;
  for (const dir of recordingDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('FIXC7 question library and analysis API', () => {
  it('requires authentication for questions and llm settings', async () => {
    const db = createTestDb();
    seedUser(db);
    const app = createApp(db, { llmService: fakeLlmService });

    await request(app).get('/api/questions').expect(401, { error: 'unauthorized' });
    await request(app).get('/api/llm/settings').expect(401, { error: 'unauthorized' });
  });

  it('seeds default questions and Ollama mistral-nemo settings per owner', async () => {
    const db = createTestDb();
    seedUser(db);
    const app = createApp(db, { llmService: fakeLlmService });
    const cookie = authCookie(db);

    const questions = await request(app).get('/api/questions').set('Cookie', cookie).expect(200);
    const settings = await request(app).get('/api/llm/settings').set('Cookie', cookie).expect(200);

    expect(questions.body.questions).toHaveLength(2);
    expect(questions.body.questions[0]).toMatchObject({ name: 'Summarize meeting', autoRun: true, isDefault: true });
    expect(questions.body.questions[1]).toMatchObject({ name: 'Extract action items', autoRun: false });
    expect(settings.body).toEqual({
      defaultProvider: 'ollama',
      defaultOllamaModel: 'mistral-nemo:12b',
      transcriberModel: 'medium',
      transcriptionMode: 'auto',
      transcriptionProvider: 'local',
    });
  });

  it('creates, updates, stars, and deletes a question', async () => {
    const db = createTestDb();
    seedUser(db);
    const app = createApp(db, { llmService: fakeLlmService });
    const cookie = authCookie(db);

    const created = await request(app)
      .post('/api/questions')
      .set('Cookie', cookie)
      .send({ name: 'Risks', prompt: 'Find risks', autoRun: false, providerOverride: 'codex' })
      .expect(201);

    const updated = await request(app)
      .put(`/api/questions/${created.body.question.id}`)
      .set('Cookie', cookie)
      .send({ name: 'Risks and blockers', prompt: 'Find risks and blockers', autoRun: true, providerOverride: 'claude' })
      .expect(200);

    expect(updated.body.question).toMatchObject({ name: 'Risks and blockers', autoRun: true, providerOverride: 'claude' });

    const starred = await request(app).post(`/api/questions/${created.body.question.id}/star`).set('Cookie', cookie).send({}).expect(200);
    expect(starred.body.question.isDefault).toBe(true);

    await request(app).delete(`/api/questions/${created.body.question.id}`).set('Cookie', cookie).expect(204);
    await request(app).put(`/api/questions/${created.body.question.id}`).set('Cookie', cookie).send(updated.body.question).expect(404);
  });

  it('rejects invalid question payloads and providers', async () => {
    const db = createTestDb();
    seedUser(db);
    const app = createApp(db, { llmService: fakeLlmService });
    const cookie = authCookie(db);

    await request(app).post('/api/questions').set('Cookie', cookie).send({ name: '', prompt: 'x' }).expect(400);
    await request(app).post('/api/questions').set('Cookie', cookie).send({ name: 'x', prompt: 'x', providerOverride: 'bad' }).expect(400);
    await request(app).put('/api/llm/settings').set('Cookie', cookie).send({ defaultProvider: 'bad' }).expect(400);
    await request(app).put('/api/llm/settings').set('Cookie', cookie).send({ transcriberModel: 'tiny' }).expect(400);
  });

  it('keeps question libraries isolated by owner', async () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    const app = createApp(db, { llmService: fakeLlmService });

    const otherCreated = await request(app)
      .post('/api/questions')
      .set('Cookie', authCookie(db, 'other@silverjrom.app'))
      .send({ name: 'Other private', prompt: 'Do not show', autoRun: false })
      .expect(201);
    const mine = await request(app).get('/api/questions').set('Cookie', authCookie(db)).expect(200);

    expect(mine.body.questions.map((question: { id: string }) => question.id)).not.toContain(otherCreated.body.question.id);
  });

  it('persists default provider settings', async () => {
    const db = createTestDb();
    seedUser(db);
    const app = createApp(db, { llmService: fakeLlmService });
    const cookie = authCookie(db);

    await request(app).put('/api/llm/settings').set('Cookie', cookie).send({ defaultProvider: 'codex' }).expect(200);
    const settings = await request(app).get('/api/llm/settings').set('Cookie', cookie).expect(200);

    expect(settings.body.defaultProvider).toBe('codex');
  });

  it('persists transcriber model settings without resubmitting provider settings', async () => {
    const db = createTestDb();
    seedUser(db);
    const app = createApp(db, { llmService: fakeLlmService });
    const cookie = authCookie(db);

    const updated = await request(app).put('/api/llm/settings').set('Cookie', cookie).send({ transcriberModel: 'large-v3' }).expect(200);
    const settings = await request(app).get('/api/llm/settings').set('Cookie', cookie).expect(200);

    expect(updated.body).toMatchObject({ defaultProvider: 'ollama', transcriberModel: 'large-v3' });
    expect(settings.body).toMatchObject({ defaultProvider: 'ollama', transcriberModel: 'large-v3' });
  });

  it('partial provider updates preserve the selected transcriber model', async () => {
    const db = createTestDb();
    seedUser(db);
    const app = createApp(db, { llmService: fakeLlmService });
    const cookie = authCookie(db);

    await request(app).put('/api/llm/settings').set('Cookie', cookie).send({ transcriberModel: 'small' }).expect(200);
    const updated = await request(app).put('/api/llm/settings').set('Cookie', cookie).send({ defaultProvider: 'claude' }).expect(200);

    expect(updated.body).toMatchObject({ defaultProvider: 'claude', transcriberModel: 'small' });
  });

  it('runs manual analysis and writes a sidecar result', async () => {
    const db = createTestDb();
    seedUser(db);
    insertRoom(db);
    const dir = createRecordingDir();
    const filename = writeRecordingWithTranscript(dir);
    const app = createApp(db, { llmService: fakeLlmService });
    const cookie = authCookie(db);
    const question = (await request(app).get('/api/questions').set('Cookie', cookie).expect(200)).body.questions[0];

    const analyzed = await request(app)
      .post(`/api/recordings/${filename}/analyze`)
      .set('Cookie', cookie)
      .send({ questionId: question.id })
      .expect(200);
    const listed = await request(app).get(`/api/recordings/${filename}/analysis`).set('Cookie', cookie).expect(200);

    expect(analyzed.body.analysis).toMatchObject({ filename, questionId: question.id, provider: 'ollama', model: 'mistral-nemo:12b' });
    expect(listed.body.analyses).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, `${filename}.analysis.summarize-meeting.json`))).toBe(true);
  });

  it('rejects analysis for non-owned recordings and missing transcripts', async () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    insertRoom(db, 'abc123abc123', 'Team Sync', 'other@silverjrom.app');
    const dir = createRecordingDir();
    const filename = writeRecordingWithTranscript(dir);
    const app = createApp(db, { llmService: fakeLlmService });
    const cookie = authCookie(db);
    const question = (await request(app).get('/api/questions').set('Cookie', cookie).expect(200)).body.questions[0];

    await request(app).post(`/api/recordings/${filename}/analyze`).set('Cookie', cookie).send({ questionId: question.id }).expect(403);

    insertRoom(db, 'def456def456', 'Mine');
    const missingTranscript = '2026-05-19T03-00-00-000Z_def456def456_Mine_222222.webm';
    fs.writeFileSync(path.join(dir, missingTranscript), Buffer.from('audio'));
    await request(app).post(`/api/recordings/${missingTranscript}/analyze`).set('Cookie', cookie).send({ questionId: question.id }).expect(404);
  });

  it('auto-runs enabled questions after a transcript is ready', async () => {
    process.env.MEET_LLM_ANALYZE_FAKE = '1';
    process.env.MEET_LLM_FAKE_RESPONSE = 'auto summary';
    const db = createTestDb();
    seedUser(db);
    insertRoom(db);
    const dir = createRecordingDir();
    const filename = writeRecordingWithTranscript(dir);

    await runAutoAnalysesForRecording(filename, db, fakeLlmService);

    const sidecars = fs.readdirSync(dir).filter((entry) => entry.includes('.analysis.'));
    expect(sidecars).toEqual([`${filename}.analysis.summarize-meeting.json`]);
    expect(JSON.parse(fs.readFileSync(path.join(dir, sidecars[0]), 'utf8')).text).toBe('auto summary');
  });

  it('removes analysis sidecars when recording audio is deleted', async () => {
    const db = createTestDb();
    seedUser(db);
    insertRoom(db);
    const dir = createRecordingDir();
    const filename = writeRecordingWithTranscript(dir);
    fs.writeFileSync(path.join(dir, `${filename}.analysis.summarize-meeting.json`), JSON.stringify({ schemaVersion: 1 }));

    await request(createApp(db, { llmService: fakeLlmService }))
      .delete(`/api/recordings/${filename}`)
      .set('Cookie', authCookie(db))
      .expect(200);

    expect(fs.existsSync(path.join(dir, `${filename}.analysis.summarize-meeting.json`))).toBe(false);
  });
});
