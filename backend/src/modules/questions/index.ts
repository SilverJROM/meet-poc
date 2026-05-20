import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { LlmService, type LlmProviderId, type LlmResponse } from '../llm/index.js';
import { getRoom } from '../rooms/store.js';
import { ensureRecordingsDir, getRecordingsDir, parseRecordingFilename } from '../recording/index.js';
import {
  DEFAULT_OLLAMA_MODEL,
  createQuestion,
  deleteQuestion,
  getDefaultProvider,
  getQuestion,
  listAutoRunQuestions,
  listQuestions,
  setDefaultProvider,
  slugQuestionName,
  starQuestion,
  updateQuestion,
  type Question,
} from './store.js';

export type AnalysisResult = {
  schemaVersion: 1;
  filename: string;
  questionId: string;
  questionName: string;
  questionSlug: string;
  provider: LlmProviderId;
  model: string;
  ranAtIso: string;
  text: string;
  latencyMs: number;
};

type LlmInvoker = Pick<LlmService, 'get'>;

const autoRunQueues = new Map<string, Promise<void>>();

export function questionsRouter(
  database: Database.Database = getDb(),
  llmService: LlmInvoker = new LlmService(),
): Router {
  const router = Router();
  const auth = requireAuth(database);

  router.get('/questions', auth, (req, res) => {
    const authReq = req as AuthenticatedRequest;
    return res.json({ questions: listQuestions(authReq.user.email, database) });
  });

  router.post('/questions', auth, (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      return res.status(201).json({ question: createQuestion(req.body, authReq.user.email, database) });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  router.put('/questions/:id', auth, (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const question = updateQuestion(String(req.params.id), req.body, authReq.user.email, database);
      if (!question) return res.status(404).json({ error: 'not found' });
      return res.json({ question });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/questions/:id', auth, (req, res) => {
    const authReq = req as AuthenticatedRequest;
    if (!deleteQuestion(String(req.params.id), authReq.user.email, database)) return res.status(404).json({ error: 'not found' });
    return res.status(204).send();
  });

  router.post('/questions/:id/star', auth, (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const question = starQuestion(String(req.params.id), authReq.user.email, database);
    if (!question) return res.status(404).json({ error: 'not found' });
    return res.json({ question });
  });

  router.get('/llm/settings', auth, (req, res) => {
    const authReq = req as AuthenticatedRequest;
    return res.json({
      defaultProvider: getDefaultProvider(authReq.user.email, database),
      defaultOllamaModel: DEFAULT_OLLAMA_MODEL,
    });
  });

  router.put('/llm/settings', auth, (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      return res.json({
        defaultProvider: setDefaultProvider(authReq.user.email, req.body?.defaultProvider, database),
        defaultOllamaModel: DEFAULT_OLLAMA_MODEL,
      });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/recordings/:filename/analyze', auth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    const questionId = typeof req.body?.questionId === 'string' ? req.body.questionId : '';
    const question = getQuestion(questionId, authReq.user.email, database);
    if (!question) return res.status(404).json({ error: 'question not found' });
    try {
      const analysis = await analyzeRecordingQuestion({
        filename,
        ownerEmail: authReq.user.email,
        question,
        providerOverride: req.body?.providerOverride,
        database,
        llmService,
      });
      return res.json({ analysis });
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'forbidden') return res.status(403).json({ error: 'forbidden' });
      if (message === 'recording not found' || message === 'transcript not found') return res.status(404).json({ error: message });
      return res.status(500).json({ error: message || 'analysis failed' });
    }
  });

  router.get('/recordings/:filename/analysis', auth, (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    try {
      assertOwnedRecording(filename, authReq.user.email, database);
      return res.json({ analyses: listAnalysisSidecars(filename) });
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'forbidden') return res.status(403).json({ error: 'forbidden' });
      return res.status(404).json({ error: 'recording not found' });
    }
  });

  return router;
}

export function runAutoAnalysesForRecording(
  filename: string,
  database: Database.Database = getDb(),
  llmService: LlmInvoker = new LlmService(),
): Promise<void> {
  const previous = autoRunQueues.get(filename) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const ownerEmail = ownerEmailForRecording(filename, database);
      if (!ownerEmail) return;
      const questions = listAutoRunQuestions(ownerEmail, database);
      for (const question of questions) {
        try {
          console.log(`[analysis] auto start ${filename} / ${question.name}`);
          await analyzeRecordingQuestion({ filename, ownerEmail, question, database, llmService });
          console.log(`[analysis] auto finished ${filename} / ${question.name}`);
        } catch (err) {
          console.error(`[analysis] auto failed ${filename} / ${question.name}`, err);
        }
      }
    })
    .finally(() => {
      if (autoRunQueues.get(filename) === next) autoRunQueues.delete(filename);
    });
  autoRunQueues.set(filename, next);
  return next;
}

async function analyzeRecordingQuestion(options: {
  filename: string;
  ownerEmail: string;
  question: Question;
  providerOverride?: unknown;
  database: Database.Database;
  llmService: LlmInvoker;
}): Promise<AnalysisResult> {
  assertOwnedRecording(options.filename, options.ownerEmail, options.database);
  const transcriptPath = transcriptPathFor(options.filename);
  if (!transcriptPath || !fs.existsSync(transcriptPath)) throw new Error('transcript not found');
  const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8')) as { lines?: unknown };
  const transcriptText = formatTranscriptText(transcript);
  const provider = parseProviderOverride(options.providerOverride) ?? options.question.providerOverride ?? getDefaultProvider(options.ownerEmail, options.database);
  const llmResponse = await invokeProvider(options.llmService, provider, `${options.question.prompt}\n\nTranscript:\n${transcriptText}`);
  const questionSlug = slugQuestionName(options.question.name);
  const analysis: AnalysisResult = {
    schemaVersion: 1,
    filename: options.filename,
    questionId: options.question.id,
    questionName: options.question.name,
    questionSlug,
    provider,
    model: llmResponse.model,
    ranAtIso: new Date().toISOString(),
    text: llmResponse.text,
    latencyMs: llmResponse.latencyMs,
  };
  const sidecarPath = analysisPathFor(options.filename, questionSlug);
  if (!sidecarPath) throw new Error('invalid filename');
  fs.writeFileSync(sidecarPath, JSON.stringify(analysis, null, 2));
  return analysis;
}

async function invokeProvider(service: LlmInvoker, provider: LlmProviderId, prompt: string): Promise<LlmResponse> {
  if (process.env.MEET_LLM_ANALYZE_FAKE === '1') {
    return {
      text: process.env.MEET_LLM_FAKE_RESPONSE || 'Mock analysis result',
      provider,
      model: provider === 'ollama' ? DEFAULT_OLLAMA_MODEL : 'mock',
      latencyMs: 0,
    };
  }
  return service.get(provider).invoke({
    prompt,
    model: provider === 'ollama' ? DEFAULT_OLLAMA_MODEL : undefined,
    timeoutMs: 60_000,
  });
}

function listAnalysisSidecars(filename: string): AnalysisResult[] {
  const dir = ensureRecordingsDir();
  const prefix = `${filename}.analysis.`;
  return fs
    .readdirSync(dir)
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith('.json'))
    .map((entry) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')) as AnalysisResult;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is AnalysisResult => !!entry)
    .sort((a, b) => a.questionName.localeCompare(b.questionName));
}

function assertOwnedRecording(filename: string, ownerEmail: string, database: Database.Database): void {
  const parsed = parseRecordingFilename(filename);
  if (!parsed || isUnsafeFilename(filename)) throw new Error('recording not found');
  const room = getRoom(parsed.roomId, database);
  if (!room) throw new Error('recording not found');
  if (room.ownerEmail !== ownerEmail) throw new Error('forbidden');
  const filepath = safeRecordingPath(filename);
  if (!filepath || !fs.existsSync(filepath)) throw new Error('recording not found');
}

function ownerEmailForRecording(filename: string, database: Database.Database): string | null {
  const parsed = parseRecordingFilename(filename);
  if (!parsed || isUnsafeFilename(filename)) return null;
  return getRoom(parsed.roomId, database)?.ownerEmail ?? null;
}

function safeRecordingPath(filename: string): string | null {
  if (isUnsafeFilename(filename)) return null;
  const dir = path.resolve(ensureRecordingsDir());
  const filepath = path.resolve(path.join(dir, filename));
  const prefix = dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`;
  if (filepath !== dir && !filepath.startsWith(prefix)) return null;
  return filepath;
}

function transcriptPathFor(filename: string): string | null {
  const filepath = safeRecordingPath(filename);
  return filepath ? `${filepath}.transcript.json` : null;
}

function analysisPathFor(filename: string, slug: string): string | null {
  const filepath = safeRecordingPath(filename);
  return filepath ? `${filepath}.analysis.${slug}.json` : null;
}

function formatTranscriptText(transcript: { lines?: unknown }): string {
  const lines = Array.isArray(transcript.lines) ? transcript.lines : [];
  return lines.map((line) => formatTranscriptLine(line)).join('\n') + (lines.length ? '\n' : '');
}

function formatTranscriptLine(value: unknown): string {
  const line = value as { startMs?: unknown; name?: unknown; text?: unknown };
  const startMs = typeof line.startMs === 'number' && Number.isFinite(line.startMs) ? line.startMs : 0;
  const speaker = typeof line.name === 'string' && line.name.trim() && line.name.trim() !== '?' ? line.name.trim() : 'Speaker';
  const text = typeof line.text === 'string' ? line.text.trim() : '';
  return `[${formatTranscriptTimestamp(startMs)}] ${speaker}: ${text}`;
}

function formatTranscriptTimestamp(startMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(startMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseProviderOverride(value: unknown): LlmProviderId | null {
  if (value == null || value === '') return null;
  if (value === 'claude' || value === 'codex' || value === 'ollama') return value;
  throw new Error('invalid provider');
}

function isUnsafeFilename(filename: string): boolean {
  return !filename || filename.includes('..') || /[\\/]/.test(filename) || path.basename(filename) !== filename || !/^[a-zA-Z0-9_.-]+$/.test(filename);
}
