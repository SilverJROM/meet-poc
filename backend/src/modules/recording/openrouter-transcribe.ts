import fs from 'node:fs';
import path from 'node:path';
import {
  ensurePrimaryIfUnset,
  transcriptVersionPathFor,
  writeTranscriptVersion,
} from './transcript-versions.js';

export const OPENROUTER_TRANSCRIBE_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';
export const OPENROUTER_MAX_BYTES = 25 * 1024 * 1024;

type ParticipantOwner = { clientId: string; name: string };

type TranscriptWord = {
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
  clientId: string;
  name: string;
};

type TranscriptLine = {
  startMs: number;
  endMs: number;
  clientId: string;
  name: string;
  text: string;
  confidence: number;
};

export function readParticipantOwner(filepath: string): ParticipantOwner | null {
  const participantPath = `${filepath}.participant.json`;
  if (!fs.existsSync(participantPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(participantPath, 'utf8')) as {
      isPerUser?: boolean;
      clientId?: unknown;
      displayName?: unknown;
    };
    if (parsed.isPerUser !== true) return null;
    const clientId = typeof parsed.clientId === 'string' ? parsed.clientId.trim() : '';
    const displayName = typeof parsed.displayName === 'string' ? parsed.displayName.trim() : '';
    if (!clientId || !displayName) return null;
    return { clientId, name: displayName };
  } catch {
    return null;
  }
}

function toMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 1000));
}

function cleanWordText(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).join(' ');
}

function joinWords(values: string[]): string {
  let text = values.join(' ');
  for (const token of ['.', ',', '?', '!', ':', ';', '%']) {
    text = text.replace(new RegExp(` ${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), token);
  }
  return text.split(/\s+/).filter(Boolean).join(' ');
}

function averageConfidence(words: Array<{ confidence: number }>): number {
  if (words.length === 0) return 0;
  const total = words.reduce((sum, word) => sum + word.confidence, 0);
  return Math.round((total / words.length) * 10_000) / 10_000;
}

function buildLines(words: TranscriptWord[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  let current: TranscriptWord[] = [];
  let currentClient: string | null = null;

  const flush = (): void => {
    if (current.length === 0) return;
    lines.push({
      startMs: current[0].startMs,
      endMs: current[current.length - 1].endMs,
      clientId: currentClient || current[0].clientId,
      name: current[0].name,
      text: joinWords(current.map((word) => word.text)),
      confidence: averageConfidence(current),
    });
    current = [];
  };

  for (const word of words) {
    if (current.length > 0 && word.clientId !== currentClient) flush();
    currentClient = word.clientId;
    current.push(word);
  }
  flush();
  return lines;
}

function labelWordsWithOwner(
  words: Array<{ startMs: number; endMs: number; text: string; confidence: number }>,
  owner: ParticipantOwner,
): TranscriptWord[] {
  return words.map((word) => ({
    ...word,
    clientId: owner.clientId,
    name: owner.name,
  }));
}

function extractRawWords(raw: unknown): Array<{ startMs: number; endMs: number; text: string; confidence: number }> {
  const payload = raw as {
    words?: unknown;
    segments?: unknown;
    text?: unknown;
  };
  const words: Array<{ startMs: number; endMs: number; text: string; confidence: number }> = [];

  if (Array.isArray(payload.words)) {
    for (const entry of payload.words) {
      const item = entry as { word?: unknown; text?: unknown; start?: unknown; end?: unknown; probability?: unknown };
      const text = cleanWordText(String(item.word ?? item.text ?? ''));
      if (!text) continue;
      const startMs = toMs(item.start);
      const endMs = toMs(item.end ?? item.start);
      words.push({
        startMs,
        endMs: Math.max(endMs, startMs),
        text,
        confidence: typeof item.probability === 'number' ? Math.round(item.probability * 10_000) / 10_000 : 0,
      });
    }
  }

  if (words.length === 0 && Array.isArray(payload.segments)) {
    for (const segment of payload.segments) {
      const seg = segment as { words?: unknown; text?: unknown; start?: unknown; end?: unknown };
      if (Array.isArray(seg.words) && seg.words.length > 0) {
        for (const entry of seg.words) {
          const item = entry as { word?: unknown; text?: unknown; start?: unknown; end?: unknown; probability?: unknown };
          const text = cleanWordText(String(item.word ?? item.text ?? ''));
          if (!text) continue;
          const startMs = toMs(item.start ?? seg.start);
          const endMs = toMs(item.end ?? item.start ?? seg.end ?? seg.start);
          words.push({
            startMs,
            endMs: Math.max(endMs, startMs),
            text,
            confidence: typeof item.probability === 'number' ? Math.round(item.probability * 10_000) / 10_000 : 0,
          });
        }
        continue;
      }
      const text = cleanWordText(String(seg.text ?? ''));
      if (!text) continue;
      const startMs = toMs(seg.start);
      const endMs = toMs(seg.end ?? seg.start);
      words.push({
        startMs,
        endMs: Math.max(endMs, startMs),
        text,
        confidence: 0,
      });
    }
  }

  if (words.length === 0 && typeof payload.text === 'string' && payload.text.trim()) {
    words.push({ startMs: 0, endMs: 0, text: cleanWordText(payload.text), confidence: 0 });
  }

  return words;
}

export function normalizeOpenRouterTranscript(
  raw: unknown,
  filename: string,
  owner: ParticipantOwner,
  model: string,
): {
  schemaVersion: 1;
  transcribedAtIso: string;
  audioFile: string;
  provider: 'openrouter';
  model: string;
  language: string | null;
  lines: TranscriptLine[];
  words: TranscriptWord[];
} {
  const words = labelWordsWithOwner(extractRawWords(raw), owner);
  return {
    schemaVersion: 1,
    transcribedAtIso: new Date().toISOString(),
    audioFile: filename,
    provider: 'openrouter',
    model,
    language: typeof (raw as { language?: unknown }).language === 'string' ? (raw as { language: string }).language : null,
    lines: buildLines(words),
    words,
  };
}

export async function transcribeViaOpenRouter(options: {
  filename: string;
  filepath: string;
  model: string;
  fetchImpl?: typeof fetch;
}): Promise<'written' | 'skipped' | 'failed'> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.warn(`[transcribe] openrouter selected but OPENROUTER_API_KEY unset — skipping ${options.filename}`);
    return 'skipped';
  }

  const stat = fs.statSync(options.filepath);
  if (stat.size > OPENROUTER_MAX_BYTES) {
    console.warn(
      `[transcribe] openrouter skip ${options.filename}: ${stat.size} bytes exceeds ${OPENROUTER_MAX_BYTES} byte limit`,
    );
    return 'skipped';
  }

  const owner = readParticipantOwner(options.filepath);
  if (!owner) {
    console.warn(`[transcribe] openrouter skip ${options.filename}: not a per-user recording`);
    return 'skipped';
  }

  const model = options.model.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(options.filepath)]), path.basename(options.filepath));
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  const response = await fetchImpl(OPENROUTER_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    console.error(`[transcribe] openrouter HTTP ${response.status} for ${options.filename}`);
    return 'failed';
  }

  const raw = await response.json();
  const payload = normalizeOpenRouterTranscript(raw, options.filename, owner, model);
  const versionPath = transcriptVersionPathFor(options.filename, 'openrouter', model);
  if (!versionPath) return 'failed';
  writeTranscriptVersion(versionPath, payload);
  ensurePrimaryIfUnset(options.filename, 'openrouter', model);
  console.log(`[transcribe] openrouter finished ${options.filename} model=${model}`);
  return 'written';
}