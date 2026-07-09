// B00S-AC15-RESCOPE: AC15 real-device re-demo — same as B08A-3 but device_mode: 'real-virtual-mic'
// Validates sender-liveness invariant on real device (not fake-device).
// Context: AC15 is currently SCOPED (fake-device only). This re-demo on real-virtual-mic
// promotes AC15 to full VERIFIED. Exact same assertions as B08A-3: both-advancing,
// four counters strictly advance, far-end receive WAV has real speech (STT proof).
//
// Device provenance: real-virtual-mic requires .123 reachable with PipeWire (per B00S-DEVICE).
// Burns exactly 1/25 via call-ledger.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { joinDualBrowserCall } from '../call-driver.js';
import { getState, initLedger } from '../call-ledger.js';
import type { ConversationScript } from '../conversation-scheduler.js';
import {
  extractOutboundLiveness,
  classifySenderLiveness,
  type OutboundLivenessStats,
} from '../../../frontend/src/app/services/mic-energy.js';

const BASE_URL = 'http://localhost:4700';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');

// Real speech fixture (same as B08A-3)
const REAL_SPEECH_SOURCE = path.resolve(HERE, '../../fixtures/audio/speech/alice-host.wav');

// On-box local whisper for STT proof
const WHISPER_PYTHON = path.resolve(REPO_ROOT, 'backend/.venv-transcribe/bin/python');
const TRANSCRIBE_SCRIPT = path.resolve(REPO_ROOT, 'backend/scripts/transcribe.py');
const WHISPER_MODEL = 'small';

const EVIDENCE_DIR = path.resolve(
  REPO_ROOT,
  'plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09/validation/b00s-ac15-rescope-evidence',
);

function runLocalWhisper(wavPath: string, clientId: string, displayName: string): { text: string; wordCount: number } {
  const participantPath = `${wavPath}.participant.json`;
  fs.writeFileSync(
    participantPath,
    JSON.stringify({ isPerUser: true, clientId, displayName, joinedAtMs: 0 }),
  );

  const result = spawnSync(
    WHISPER_PYTHON,
    [TRANSCRIBE_SCRIPT, wavPath, '--model', WHISPER_MODEL, '--provider', 'local', '--force'],
    { encoding: 'utf-8', timeout: 45_000 },
  );
  if (result.status !== 0) {
    throw new Error(`local whisper failed (exit ${result.status}): ${result.stderr || result.stdout}`);
  }

  const transcriptPath = `${wavPath}.transcript.local-${WHISPER_MODEL}.json`;
  const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8')) as {
    words: Array<{ text: string }>;
  };
  const text = transcript.words.map((w) => w.text).join(' ').toLowerCase();
  return { text, wordCount: transcript.words.length };
}

type RawStatEntry = Record<string, unknown>;

function toStatsLike(entries: RawStatEntry[]): { values(): IterableIterator<any> } {
  return { values: () => entries.values() };
}

describe('B00S-AC15-RESCOPE — AC15 real-device re-demo, sender-liveness invariant', () => {
  it(
    'healthy speech on real-virtual-mic: both-advancing, all four counters strictly advance, far-end evidence lands',
    async () => {
      initLedger(process.cwd());
      const burnBefore = getState().callBurnCount;

      const window: OutboundLivenessStats[] = [];

      const script: ConversationScript = {
        utterances: [
          {
            speaker: 'bot-140',
            timeMs: 0,
            durationMs: 1500,
            audioPath: '../fixtures/bot-speech/bot-140/hello.wav',
            text: 'Hello, how are you?',
          },
        ],
        totalDurationMs: 1500,
      };

      const result = await joinDualBrowserCall(
        {
          baseUrl: BASE_URL,
          speaker1Name: 'bot-140',
          speaker2Name: 'bot-123',
          autoAdmitRoom: true,
          recordReceiveSide: true,
          receiverPageIndex: 1,
          ledgerBasePath: process.cwd(),
          // KEY DIFFERENCE: real-virtual-mic instead of fake-device
          // This is the re-demo that validates AC15 on real device (not fake-device)
          deviceMode: 'real-virtual-mic',
          stimulus: 'speech',
          launchArgs: [`--use-file-for-fake-audio-capture=${REAL_SPEECH_SOURCE}`],
          onLive: async ({ page1 }) => {
            const sampleRawEntries = async (): Promise<RawStatEntry[]> =>
              page1.evaluate(async () => {
                const stats = await (window as any).__meetDebug?.sfuGetStats?.();
                if (!stats) return [];
                return [...stats.values()];
              });

            const deadline = Date.now() + 1400;
            while (Date.now() < deadline) {
              const entries = await sampleRawEntries();
              window.push(extractOutboundLiveness(toStatsLike(entries)));
              await new Promise((r) => setTimeout(r, 200));
            }
          },
        },
        script,
      );

      // --- Ledger: exactly 1 call burn ---
      const burnAfter = getState().callBurnCount;
      expect(burnAfter - burnBefore).toBe(1);

      // --- Sender liveness: both-advancing ---
      expect(window.length).toBeGreaterThanOrEqual(2);
      expect(classifySenderLiveness(window)).toBe('both-advancing');

      const firstUsable = <K extends keyof OutboundLivenessStats>(key: K): number[] =>
        window.map((s) => s[key]).filter((v): v is number => typeof v === 'number');

      for (const key of ['totalAudioEnergy', 'totalSamplesDuration', 'packetsSent', 'bytesSent'] as const) {
        const values = firstUsable(key);
        expect(values.length, `${key}: need >=2 usable samples`).toBeGreaterThanOrEqual(2);
        expect(values[values.length - 1], `${key} did not strictly advance`).toBeGreaterThan(values[0]);
      }

      // --- Far-end receive WAV: real audio with non-zero RMS ---
      expect(result.receiveSideWavPath).toBeTruthy();
      expect(fs.existsSync(result.receiveSideWavPath!)).toBe(true);

      const metaPath = result.receiveSideWavPath!.replace(/\.wav$/, '.meta.json');
      expect(fs.existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(meta.reason).not.toBe('SILENCE');
      expect(meta.rms).toBeGreaterThan(0);

      // --- Supplemental transcript ---
      expect(result.transcriptPath).toBeTruthy();
      expect(fs.existsSync(result.transcriptPath!)).toBe(true);
      const transcriptOnDisk = fs.readFileSync(result.transcriptPath!, 'utf-8');
      expect(transcriptOnDisk).toContain('scriptExpected');
      expect(result.transcriptContent).toBeTruthy();
      expect(result.transcriptContent!.length).toBeGreaterThan(0);

      // --- AC15 GATE: far end transcribes real speech (local whisper / STT proof) ---
      const stt = runLocalWhisper(result.receiveSideWavPath!, 'bot-140', 'bot-140');
      expect(stt.wordCount, 'whisper produced zero words — audio was not verifiably speech').toBeGreaterThan(0);
      expect(stt.text).not.toContain('hello, how are you');
      expect(stt.text).not.toContain('scriptexpected');

      // --- Persist evidence ---
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
      const sttTranscriptPath = `${result.receiveSideWavPath}.transcript.local-${WHISPER_MODEL}.json`;
      const participantPath = `${result.receiveSideWavPath}.participant.json`;
      const evidenceFiles: Array<[string | undefined, string]> = [
        [result.receiveSideWavPath, 'receive.wav'],
        [metaPath, 'receive.meta.json'],
        [result.transcriptPath, 'script-transcript.txt'],
        [sttTranscriptPath, 'whisper-transcript.json'],
        [participantPath, 'receive.participant.json'],
      ];
      for (const [src, destName] of evidenceFiles) {
        if (src && fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(EVIDENCE_DIR, destName));
          fs.unlinkSync(src);
        }
      }
      const primaryPointerPath = `${result.receiveSideWavPath}.transcript.primary.json`;
      if (fs.existsSync(primaryPointerPath)) fs.unlinkSync(primaryPointerPath);
    },
    60_000,
  );
});
