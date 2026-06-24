import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from '../../db.js';

export type TranscriptVersionProvider = 'local' | 'openrouter';

export type TranscriptVersionKey = {
  provider: TranscriptVersionProvider;
  model: string;
};

export type TranscriptVersionEntry = TranscriptVersionKey & {
  path: string;
  isPrimary: boolean;
};

export function getRecordingsDir(): string {
  return process.env.MEET_RECORDINGS_DIR || path.join(getRepoRoot(), 'recordings');
}

export function sanitizeModelForFilename(model: string): string {
  return model.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'model';
}

export function transcriptVersionSuffix(provider: string, model: string): string {
  return `${provider}-${sanitizeModelForFilename(model)}`;
}

function isSafeFilename(filename: string): boolean {
  return path.basename(filename) === filename && /^[a-zA-Z0-9_.-]+$/.test(filename);
}

export function safeRecordingPath(filename: string): string | null {
  if (!filename || filename.includes('..') || /[\\/]/.test(filename) || !isSafeFilename(filename)) return null;
  const dir = path.resolve(getRecordingsDir());
  const filepath = path.resolve(path.join(dir, filename));
  const prefix = dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`;
  if (filepath !== dir && !filepath.startsWith(prefix)) return null;
  return filepath;
}

export function legacyTranscriptPathFor(filename: string): string | null {
  const filepath = safeRecordingPath(filename);
  return filepath ? `${filepath}.transcript.json` : null;
}

export function transcriptVersionPathFor(filename: string, provider: string, model: string): string | null {
  const filepath = safeRecordingPath(filename);
  if (!filepath) return null;
  return `${filepath}.transcript.${transcriptVersionSuffix(provider, model)}.json`;
}

export function transcriptPrimaryPointerPathFor(filename: string): string | null {
  const filepath = safeRecordingPath(filename);
  return filepath ? `${filepath}.transcript.primary.json` : null;
}

export function readPrimaryPointer(filename: string): TranscriptVersionKey | null {
  const pointerPath = transcriptPrimaryPointerPathFor(filename);
  if (!pointerPath || !fs.existsSync(pointerPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(pointerPath, 'utf8')) as { provider?: unknown; model?: unknown };
    if (
      (parsed.provider === 'local' || parsed.provider === 'openrouter') &&
      typeof parsed.model === 'string' &&
      parsed.model.trim()
    ) {
      return { provider: parsed.provider, model: parsed.model.trim() };
    }
  } catch {
    return null;
  }
  return null;
}

export function setPrimaryTranscript(filename: string, provider: TranscriptVersionProvider, model: string): void {
  const versionPath = transcriptVersionPathFor(filename, provider, model);
  if (!versionPath || !fs.existsSync(versionPath)) {
    throw new Error('transcript version not found');
  }
  const pointerPath = transcriptPrimaryPointerPathFor(filename);
  if (!pointerPath) throw new Error('invalid filename');
  fs.writeFileSync(pointerPath, JSON.stringify({ provider, model }, null, 2));
}

export function ensurePrimaryIfUnset(filename: string, provider: TranscriptVersionProvider, model: string): void {
  if (readPrimaryPointer(filename)) return;
  const pointerPath = transcriptPrimaryPointerPathFor(filename);
  if (!pointerPath) return;
  fs.writeFileSync(pointerPath, JSON.stringify({ provider, model }, null, 2));
}

export function resolvePrimaryTranscriptPath(filename: string): string | null {
  const pointer = readPrimaryPointer(filename);
  if (pointer) {
    const versionPath = transcriptVersionPathFor(filename, pointer.provider, pointer.model);
    if (versionPath && fs.existsSync(versionPath)) return versionPath;
  }
  const legacyPath = legacyTranscriptPathFor(filename);
  if (legacyPath && fs.existsSync(legacyPath)) return legacyPath;
  const versions = listTranscriptVersionFiles(filename);
  return versions.length > 0 ? versions[0].path : null;
}

function listTranscriptVersionFiles(filename: string): Array<{ provider: TranscriptVersionProvider; model: string; path: string }> {
  const filepath = safeRecordingPath(filename);
  if (!filepath) return [];
  const dir = path.dirname(filepath);
  const base = path.basename(filepath);
  const prefix = `${base}.transcript.`;
  const entries: Array<{ provider: TranscriptVersionProvider; model: string; path: string }> = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.startsWith(prefix) || !entry.endsWith('.json')) continue;
    if (entry === `${base}.transcript.primary.json`) continue;
    const suffix = entry.slice(prefix.length, -'.json'.length);
    const dash = suffix.indexOf('-');
    if (dash <= 0) continue;
    const provider = suffix.slice(0, dash);
    if (provider !== 'local' && provider !== 'openrouter') continue;
    const modelSlug = suffix.slice(dash + 1);
    const fullPath = path.join(dir, entry);
    const model = modelSlugFromFile(filename, provider, modelSlug, fullPath);
    entries.push({ provider, model, path: fullPath });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function modelSlugFromFile(
  filename: string,
  provider: TranscriptVersionProvider,
  modelSlug: string,
  fullPath: string,
): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as { model?: unknown };
    if (typeof parsed.model === 'string' && parsed.model.trim()) return parsed.model.trim();
  } catch {
    /* fall through */
  }
  return modelSlug;
}

export function listTranscriptVersions(filename: string): TranscriptVersionEntry[] {
  const primary = readPrimaryPointer(filename);
  const legacyPath = legacyTranscriptPathFor(filename);
  const entries: TranscriptVersionEntry[] = [];
  if (legacyPath && fs.existsSync(legacyPath)) {
    let model = 'legacy';
    try {
      const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8')) as { model?: unknown; provider?: unknown };
      if (typeof parsed.model === 'string' && parsed.model.trim()) model = parsed.model.trim();
    } catch {
      /* keep legacy label */
    }
    const isPrimary = !primary && legacyPath === resolvePrimaryTranscriptPath(filename);
    entries.push({ provider: 'local', model, path: legacyPath, isPrimary });
  }
  for (const version of listTranscriptVersionFiles(filename)) {
    const isPrimary = !!primary && primary.provider === version.provider && primary.model === version.model;
    entries.push({ ...version, isPrimary });
  }
  return entries;
}

export function deleteTranscriptVersion(filename: string, provider: TranscriptVersionProvider, model: string): boolean {
  const versionPath = transcriptVersionPathFor(filename, provider, model);
  if (!versionPath || !fs.existsSync(versionPath)) return false;
  fs.unlinkSync(versionPath);
  const primary = readPrimaryPointer(filename);
  if (primary && primary.provider === provider && primary.model === model) {
    const pointerPath = transcriptPrimaryPointerPathFor(filename);
    if (pointerPath) {
      try {
        fs.unlinkSync(pointerPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }
  }
  return true;
}

export function deleteAllTranscriptSidecars(filename: string): void {
  const filepath = safeRecordingPath(filename);
  if (!filepath) return;
  const dir = path.dirname(filepath);
  const base = path.basename(filepath);
  const prefix = `${base}.transcript`;
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.startsWith(prefix)) continue;
    try {
      fs.unlinkSync(path.join(dir, entry));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

export function writeTranscriptVersion(versionPath: string, payload: unknown): void {
  const tmpPath = `${versionPath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmpPath, versionPath);
}