// B00S-SPEECH fixture gate: every bot-speech / already-valid fixture registered in
// fixtures-registry.json must whisper-round-trip to real, non-empty STT (and, for
// scripted fixtures, contain the intended text's key words). Tones must NEVER pass
// this gate (decisions/2026-07-09-north-structural-speech-device-plan.md binding #2/#3)
// — a tone negative control below proves the gate is not tautological.
//
// Same stack the backend uses for real recordings: backend/.venv-transcribe +
// backend/scripts/transcribe.py, run with --force to defeat the transcript_path
// cache. Reuses the runLocalWhisper shape from
// e2e/harness/__tests__/b08a3-live-sender-liveness.browser.test.ts (participant.json
// sidecar landmine: transcribe.py silently no-ops without one).
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const BOT_SPEECH_DIR = path.resolve(HERE, '../../fixtures/bot-speech');
const REGISTRY_PATH = path.join(BOT_SPEECH_DIR, 'fixtures-registry.json');
const TONE_FIXTURE = path.resolve(HERE, '../../fixtures/audio/tone-440.wav');

const WHISPER_PYTHON = path.resolve(REPO_ROOT, 'backend/.venv-transcribe/bin/python');
const TRANSCRIBE_SCRIPT = path.resolve(REPO_ROOT, 'backend/scripts/transcribe.py');
const WHISPER_MODEL = 'small';

interface RegistryEntry {
  path: string;
  text: string | null;
  voice?: string;
  class: 'scripted' | 'already-valid';
}

const scratchFiles: string[] = [];

function runLocalWhisper(wavPath: string): { text: string; wordCount: number } {
  const participantPath = `${wavPath}.participant.json`;
  fs.writeFileSync(
    participantPath,
    JSON.stringify({ isPerUser: true, clientId: 'gate', displayName: 'gate', joinedAtMs: 0 }),
  );
  scratchFiles.push(participantPath);

  const result = spawnSync(
    WHISPER_PYTHON,
    [TRANSCRIBE_SCRIPT, wavPath, '--model', WHISPER_MODEL, '--provider', 'local', '--force'],
    { encoding: 'utf-8', timeout: 45_000 },
  );
  if (result.status !== 0) {
    throw new Error(`local whisper failed (exit ${result.status}): ${result.stderr || result.stdout}`);
  }

  const transcriptPath = `${wavPath}.transcript.local-${WHISPER_MODEL}.json`;
  scratchFiles.push(transcriptPath, `${wavPath}.transcript.primary.json`);
  const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8')) as {
    words: Array<{ text: string }>;
  };
  const text = transcript.words.map((w) => w.text).join(' ').toLowerCase();
  return { text, wordCount: transcript.words.length };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const STOPWORDS = new Set(['i', 'am', 'you', 'for', 'that', 'and', 'to']);

function keyWords(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

afterEach(() => {
  while (scratchFiles.length) {
    const f = scratchFiles.pop()!;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

describe('B00S-SPEECH fixture gate: bot-speech + already-valid fixtures whisper round-trip', () => {
  const registry: RegistryEntry[] = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));

  it('registry is non-empty and has both scripted and already-valid classes', () => {
    expect(registry.length).toBeGreaterThan(0);
    expect(registry.some((e) => e.class === 'scripted')).toBe(true);
    expect(registry.some((e) => e.class === 'already-valid')).toBe(true);
  });

  for (const entry of registry) {
    const wavPath = path.resolve(BOT_SPEECH_DIR, entry.path);

    it(
      `${entry.path} (${entry.class}) whisper-round-trips to real speech`,
      () => {
        expect(fs.existsSync(wavPath), `fixture missing: ${wavPath}`).toBe(true);

        const stt = runLocalWhisper(wavPath);
        expect(stt.wordCount, `${entry.path} produced zero words — not verifiably speech`).toBeGreaterThan(0);

        if (entry.class === 'scripted' && entry.text) {
          const normalizedStt = normalize(stt.text);
          for (const word of keyWords(entry.text)) {
            expect(
              normalizedStt,
              `${entry.path}: STT "${stt.text}" missing key word "${word}" from intended text "${entry.text}"`,
            ).toContain(word);
          }
        }
      },
      45_000,
    );
  }

  it(
    'negative control: a pure tone yields ZERO words through the identical pipeline (gate is not tautological)',
    () => {
      expect(fs.existsSync(TONE_FIXTURE), `tone fixture missing: ${TONE_FIXTURE}`).toBe(true);
      const stt = runLocalWhisper(TONE_FIXTURE);
      expect(stt.wordCount, 'tone fixture produced words — whisper gate is vacuous').toBe(0);
    },
    45_000,
  );
});
