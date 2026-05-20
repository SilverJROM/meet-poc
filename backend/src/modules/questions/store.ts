import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import type { LlmProviderId } from '../llm/index.js';

export const DEFAULT_PROVIDER: LlmProviderId = 'ollama';
export const DEFAULT_OLLAMA_MODEL = 'mistral-nemo:12b';
export const DEFAULT_TRANSCRIBER_MODEL: TranscriberModel = 'medium';

export type TranscriberModel = 'small' | 'medium' | 'large-v3';

export type Question = {
  id: string;
  name: string;
  prompt: string;
  autoRun: boolean;
  providerOverride: LlmProviderId | null;
  isDefault: boolean;
  ownerEmail: string;
  createdAt: number;
  updatedAt: number;
};

export type QuestionInput = {
  name: unknown;
  prompt: unknown;
  autoRun?: unknown;
  providerOverride?: unknown;
};

type QuestionRow = {
  id: string;
  name: string;
  prompt: string;
  auto_run: number;
  provider_override: string | null;
  is_default: number;
  owner_email: string;
  created_at: number;
  updated_at: number;
};

type SettingRow = {
  key: string;
  value: string;
  owner_email: string;
  updated_at: number;
};

const DEFAULT_QUESTIONS = [
  {
    name: 'Summarize meeting',
    prompt: 'Summarize the meeting in concise bullet points. Include decisions, risks, and important context.',
    autoRun: true,
    isDefault: true,
  },
  {
    name: 'Extract action items',
    prompt: 'Extract action items from the meeting. For each item include owner, due date if mentioned, and the next step.',
    autoRun: false,
    isDefault: false,
  },
];

export function ensureQuestionDefaults(ownerEmail: string, database: Database.Database = getDb()): void {
  const now = Date.now();
  database
    .prepare('INSERT OR IGNORE INTO llm_settings (key, value, owner_email, updated_at) VALUES (?, ?, ?, ?)')
    .run(settingKey(ownerEmail, 'default_provider'), DEFAULT_PROVIDER, ownerEmail, now);
  database
    .prepare('INSERT OR IGNORE INTO llm_settings (key, value, owner_email, updated_at) VALUES (?, ?, ?, ?)')
    .run(settingKey(ownerEmail, 'transcriber_model'), DEFAULT_TRANSCRIBER_MODEL, ownerEmail, now);

  const row = database.prepare('SELECT COUNT(*) AS total FROM questions WHERE owner_email = ?').get(ownerEmail) as { total: number };
  if (row.total > 0) return;
  const insert = database.prepare(
    'INSERT INTO questions (id, name, prompt, auto_run, provider_override, is_default, owner_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const tx = database.transaction(() => {
    for (const question of DEFAULT_QUESTIONS) {
      insert.run(
        crypto.randomUUID(),
        question.name,
        question.prompt,
        question.autoRun ? 1 : 0,
        null,
        question.isDefault ? 1 : 0,
        ownerEmail,
        now,
        now,
      );
    }
  });
  tx();
}

export function listQuestions(ownerEmail: string, database: Database.Database = getDb()): Question[] {
  ensureQuestionDefaults(ownerEmail, database);
  return database
    .prepare('SELECT * FROM questions WHERE owner_email = ? ORDER BY is_default DESC, created_at ASC')
    .all(ownerEmail)
    .map((row) => toQuestion(row as QuestionRow));
}

export function listAutoRunQuestions(ownerEmail: string, database: Database.Database = getDb()): Question[] {
  ensureQuestionDefaults(ownerEmail, database);
  return database
    .prepare('SELECT * FROM questions WHERE owner_email = ? AND auto_run = 1 ORDER BY is_default DESC, created_at ASC')
    .all(ownerEmail)
    .map((row) => toQuestion(row as QuestionRow));
}

export function getQuestion(id: string, ownerEmail: string, database: Database.Database = getDb()): Question | null {
  ensureQuestionDefaults(ownerEmail, database);
  const row = database.prepare('SELECT * FROM questions WHERE id = ? AND owner_email = ?').get(id, ownerEmail) as QuestionRow | undefined;
  return row ? toQuestion(row) : null;
}

export function createQuestion(input: QuestionInput, ownerEmail: string, database: Database.Database = getDb()): Question {
  ensureQuestionDefaults(ownerEmail, database);
  const normalized = normalizeQuestionInput(input);
  const now = Date.now();
  const question: Question = {
    id: crypto.randomUUID(),
    name: normalized.name,
    prompt: normalized.prompt,
    autoRun: normalized.autoRun,
    providerOverride: normalized.providerOverride,
    isDefault: false,
    ownerEmail,
    createdAt: now,
    updatedAt: now,
  };
  database
    .prepare('INSERT INTO questions (id, name, prompt, auto_run, provider_override, is_default, owner_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(question.id, question.name, question.prompt, question.autoRun ? 1 : 0, question.providerOverride, 0, ownerEmail, now, now);
  return question;
}

export function updateQuestion(id: string, input: QuestionInput, ownerEmail: string, database: Database.Database = getDb()): Question | null {
  ensureQuestionDefaults(ownerEmail, database);
  if (!getQuestion(id, ownerEmail, database)) return null;
  const normalized = normalizeQuestionInput(input);
  const now = Date.now();
  database
    .prepare('UPDATE questions SET name = ?, prompt = ?, auto_run = ?, provider_override = ?, updated_at = ? WHERE id = ? AND owner_email = ?')
    .run(normalized.name, normalized.prompt, normalized.autoRun ? 1 : 0, normalized.providerOverride, now, id, ownerEmail);
  return getQuestion(id, ownerEmail, database);
}

export function deleteQuestion(id: string, ownerEmail: string, database: Database.Database = getDb()): boolean {
  ensureQuestionDefaults(ownerEmail, database);
  return database.prepare('DELETE FROM questions WHERE id = ? AND owner_email = ?').run(id, ownerEmail).changes > 0;
}

export function starQuestion(id: string, ownerEmail: string, database: Database.Database = getDb()): Question | null {
  ensureQuestionDefaults(ownerEmail, database);
  if (!getQuestion(id, ownerEmail, database)) return null;
  const now = Date.now();
  const tx = database.transaction(() => {
    database.prepare('UPDATE questions SET is_default = 0, updated_at = ? WHERE owner_email = ?').run(now, ownerEmail);
    database.prepare('UPDATE questions SET is_default = 1, updated_at = ? WHERE id = ? AND owner_email = ?').run(now, id, ownerEmail);
  });
  tx();
  return getQuestion(id, ownerEmail, database);
}

export function getDefaultProvider(ownerEmail: string, database: Database.Database = getDb()): LlmProviderId {
  ensureQuestionDefaults(ownerEmail, database);
  const row = database
    .prepare('SELECT key, value, owner_email, updated_at FROM llm_settings WHERE key = ? AND owner_email = ?')
    .get(settingKey(ownerEmail, 'default_provider'), ownerEmail) as SettingRow | undefined;
  return isProviderId(row?.value) ? row.value : DEFAULT_PROVIDER;
}

export function setDefaultProvider(ownerEmail: string, provider: unknown, database: Database.Database = getDb()): LlmProviderId {
  const value = parseProvider(provider);
  const now = Date.now();
  database
    .prepare('INSERT OR REPLACE INTO llm_settings (key, value, owner_email, updated_at) VALUES (?, ?, ?, ?)')
    .run(settingKey(ownerEmail, 'default_provider'), value, ownerEmail, now);
  return value;
}

export function getTranscriberModel(ownerEmail: string, database: Database.Database = getDb()): TranscriberModel {
  ensureQuestionDefaults(ownerEmail, database);
  const row = database
    .prepare('SELECT key, value, owner_email, updated_at FROM llm_settings WHERE key = ? AND owner_email = ?')
    .get(settingKey(ownerEmail, 'transcriber_model'), ownerEmail) as SettingRow | undefined;
  return isTranscriberModel(row?.value) ? row.value : DEFAULT_TRANSCRIBER_MODEL;
}

export function setTranscriberModel(ownerEmail: string, model: unknown, database: Database.Database = getDb()): TranscriberModel {
  const value = parseTranscriberModel(model);
  const now = Date.now();
  database
    .prepare('INSERT OR REPLACE INTO llm_settings (key, value, owner_email, updated_at) VALUES (?, ?, ?, ?)')
    .run(settingKey(ownerEmail, 'transcriber_model'), value, ownerEmail, now);
  return value;
}

export function slugQuestionName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'question';
}

function normalizeQuestionInput(input: QuestionInput): Omit<Question, 'id' | 'ownerEmail' | 'createdAt' | 'updatedAt' | 'isDefault'> {
  const name = String(input.name || '').trim().slice(0, 100);
  const prompt = String(input.prompt || '').trim().slice(0, 8000);
  if (!name) throw new Error('name required');
  if (!prompt) throw new Error('prompt required');
  return {
    name,
    prompt,
    autoRun: input.autoRun === true,
    providerOverride: input.providerOverride == null || input.providerOverride === '' ? null : parseProvider(input.providerOverride),
  };
}

function parseProvider(value: unknown): LlmProviderId {
  if (isProviderId(value)) return value;
  throw new Error('invalid provider');
}

function isProviderId(value: unknown): value is LlmProviderId {
  return value === 'claude' || value === 'codex' || value === 'ollama';
}

function parseTranscriberModel(value: unknown): TranscriberModel {
  if (isTranscriberModel(value)) return value;
  throw new Error('invalid transcriber model');
}

function isTranscriberModel(value: unknown): value is TranscriberModel {
  return value === 'small' || value === 'medium' || value === 'large-v3';
}

function settingKey(ownerEmail: string, key: string): string {
  return `${ownerEmail}:${key}`;
}

function toQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    autoRun: row.auto_run === 1,
    providerOverride: isProviderId(row.provider_override) ? row.provider_override : null,
    isDefault: row.is_default === 1,
    ownerEmail: row.owner_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
