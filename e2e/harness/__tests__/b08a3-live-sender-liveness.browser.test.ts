// B08A-3: AC15 LIVE clause — real dual-browser call against the running dev app.
// Composition only (B08A-1 reader + B08A-2 classifier + B08S-1/B08S-2 spine),
// per decisions/2026-07-09-b08a3-deliberation.md. Burns exactly 1/25 via
// call-ledger. Discrimination itself is already VERIFIED offline in B08A-2
// (b08a2-sender-liveness.browser.test.ts, loopback, 0/25) — this batch proves
// the healthy-speech invariant on a REAL room join through the real app, with
// far-end receive-side evidence (B08S-2 spine), not local-only counters.
//
// Room: a FRESH run-created room (call-driver's default createRoom() path),
// NOT testroom01001. Two auth-shaped gaps were found and fixed in harness code
// only (never product code, per binding #6):
//   1. POST /api/rooms is auth-gated server-side (verified live: 401 with no
//      session) and the harness never established one — fixed by having
//      createRoom() authenticate first via the project's OWN sanctioned e2e
//      credential source (e2e/fixtures/auth.ts's jrom@silverjrom.app /
//      INITIAL_PASSWORD.txt — the same credential the rest of the e2e suite
//      already uses, not an invented bypass).
//   2. testroom01001 (TEST_ROOM01, PROTECTED) turned out to have
//      auto_admit=0 in the DB — an unattended dual-guest join against it would
//      knock and never be admitted (0 published bytes, confirmed live). A
//      fresh authenticated createRoom() call requests autoAdmit:true, which is
//      exactly what B08S-1's original "run-created room" design already
//      assumed. testroom01001 is untouched — no mutation of shared/protected
//      state, no cleanup owed either way.
//
// Far-end evidence class (AC15 live clause, remediated per validator FAIL
// validation/b08a3-validation.md F1/F2 — sendback, not original impl):
//
// F1 fix: feed real speech into the fake-device capture via
// --use-file-for-fake-audio-capture, same affordance b08a2/b08s2 already use.
// IMPORTANT DEVIATION from the sendback's literal file pointer: the sendback
// named bot-140/hello.wav, but that fixture is a documented, MEASURED
// 440Hz sine tone with zero phonetic content (decisions/b07-findings.md
// Finding 3 — "no ASR/whisper pipeline will ever transcribe those words from
// this audio"). Re-confirmed directly here before writing this test: running
// backend/scripts/transcribe.py on bot-140/hello.wav produces lines=0
// words=0. Feeding it would make F2 unsatisfiable by construction — the same
// D27 problem the validator just failed the batch for, just moved one level
// down. e2e/fixtures/audio/speech/alice-host.wav is real human speech
// already in the repo (confirmed: 26 words, 0.97 avg confidence, real
// sentence content) and is used instead. See validation/b08a3-changes.md.
//
// F2 fix: after stopReceiveSideRecording produces the receive WAV, this test
// spawns the project's on-box local whisper (backend/.venv-transcribe +
// backend/scripts/transcribe.py) directly against that WAV and asserts the
// resulting STT transcript contains real recognizable words from the actual
// spoken audio. This is the AC15 evidence gate. The prior scriptExpected
// assertions are kept below as supplemental/non-gating context only (D27:
// they cannot close AC15 themselves).
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

// F1: real speech fixture (see header comment for why not bot-140/hello.wav).
const REAL_SPEECH_SOURCE = path.resolve(HERE, '../../fixtures/audio/speech/alice-host.wav');

// F2: on-box local whisper, same stack the app uses for real recordings.
const WHISPER_PYTHON = path.resolve(REPO_ROOT, 'backend/.venv-transcribe/bin/python');
const TRANSCRIBE_SCRIPT = path.resolve(REPO_ROOT, 'backend/scripts/transcribe.py');
const WHISPER_MODEL = 'small';

const EVIDENCE_DIR = path.resolve(
  REPO_ROOT,
  'plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09/validation/b08a3-evidence',
);

/**
 * F2: runs the project's real local-whisper STT over a WAV and returns the
 * transcribed text (concatenated words, lowercase). Writes a `.participant.json`
 * sidecar first — transcribe.py silently no-ops (0 words, exit 0) on WAVs
 * without one (`read_participant_owner`), which would silently recreate an
 * always-empty/tautological gate if skipped.
 */
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

/** Plain-object shape returned per getStats() entry — page.evaluate() serializes via structured JSON. */
type RawStatEntry = Record<string, unknown>;

/** Wraps a plain array of already-serialized stat entries back into the extractor's `.values()` input contract. */
function toStatsLike(entries: RawStatEntry[]): { values(): IterableIterator<any> } {
  return { values: () => entries.values() };
}

describe('B08A-3 AC15 live clause — real dual-browser call, sender-liveness invariant', () => {
  it(
    'healthy speech: both-advancing on a real room join, all four counters strictly advance, far-end evidence lands',
    async () => {
      initLedger(process.cwd());
      const burnBefore = getState().callBurnCount;

      const window: OutboundLivenessStats[] = [];

      // Minimal script-sourced label for the supplemental scriptExpected transcript
      // (B08S-2 evidence class). The actual speech fed to the call is
      // REAL_SPEECH_SOURCE (F1, see header comment) via launchArgs below — this
      // script's own audioPath is not wired for playback by the harness (out of
      // scope here, composition only per binding #2/deliberation #2); it exists
      // only to label the supplemental transcript.
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
          receiverPageIndex: 1, // page2 (bot-123) receives; page1 (bot-140) is the far end we sample.
          ledgerBasePath: process.cwd(),
          // F1: page1 (bot-140, the sender we sample) plays real speech instead
          // of Chrome's fake-device tone — see header comment.
          launchArgs: [`--use-file-for-fake-audio-capture=${REAL_SPEECH_SOURCE}`],
          onLive: async ({ page1 }) => {
            // page1 = bot-140 = the sender whose liveness we're proving (binding #3).
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

      // --- Ledger: exactly 1 call burn (binding #5) ---
      const burnAfter = getState().callBurnCount;
      expect(burnAfter - burnBefore).toBe(1);

      // --- Sender liveness: real classifier, real reader, both-advancing (binding #3) ---
      expect(window.length).toBeGreaterThanOrEqual(2);
      expect(classifySenderLiveness(window)).toBe('both-advancing');

      const firstUsable = <K extends keyof OutboundLivenessStats>(key: K): number[] =>
        window.map((s) => s[key]).filter((v): v is number => typeof v === 'number');

      for (const key of ['totalAudioEnergy', 'totalSamplesDuration', 'packetsSent', 'bytesSent'] as const) {
        const values = firstUsable(key);
        expect(values.length, `${key}: need >=2 usable samples`).toBeGreaterThanOrEqual(2);
        expect(values[values.length - 1], `${key} did not strictly advance`).toBeGreaterThan(values[0]);
      }

      // --- Far-end receive WAV: real audio landed at the far end (spine, unchanged) ---
      expect(result.receiveSideWavPath).toBeTruthy();
      expect(fs.existsSync(result.receiveSideWavPath!)).toBe(true);

      const metaPath = result.receiveSideWavPath!.replace(/\.wav$/, '.meta.json');
      expect(fs.existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(meta.reason).not.toBe('SILENCE');
      expect(meta.rms).toBeGreaterThan(0);

      // --- Supplemental only, NOT the AC15 gate (D27: scriptExpected cannot
      // close an AC that names transcript/STT as its evidence class) ---
      expect(result.transcriptPath).toBeTruthy();
      expect(fs.existsSync(result.transcriptPath!)).toBe(true);
      const transcriptOnDisk = fs.readFileSync(result.transcriptPath!, 'utf-8');
      expect(transcriptOnDisk).toContain('scriptExpected');
      expect(result.transcriptContent).toBeTruthy();
      expect(result.transcriptContent!.length).toBeGreaterThan(0);

      // --- F2 / AC15 gate: far end verifiably transcribes real speech (local whisper, STT) ---
      // The receive WAV only spans the onLive sampling window (~1.4s, bounded by
      // the existing B08S-1/B08S-2 spine — not touched here), so it's a short
      // mid-sentence snippet of REAL_SPEECH_SOURCE's ~9.7s clip, not the whole
      // thing. Threshold is intentionally conservative (>=1 real word) rather
      // than tuned to one observed run's word count. This is still a
      // non-tautological gate: vad_filter on a non-speech tone (confirmed
      // directly against bot-140/hello.wav — see header comment) returns ZERO
      // words, so any nonzero real-word output here is genuine STT evidence,
      // not an artifact that always fires.
      const stt = runLocalWhisper(result.receiveSideWavPath!, 'bot-140', 'bot-140');
      expect(stt.wordCount, 'whisper produced zero words — audio was not verifiably speech').toBeGreaterThan(0);
      // Content check: must not be (or contain) the script's hardcoded utterance —
      // that would mean the "transcript" is an echo of test input, not real STT.
      expect(stt.text).not.toContain('hello, how are you');
      expect(stt.text).not.toContain('scriptexpected');

      // --- Persist evidence (do not destroy it — validator needs to inspect the run) ---
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
          fs.unlinkSync(src); // clean the repo-root scratch copy; the evidence dir keeps the durable one
        }
      }
      // transcribe.py also writes a `.transcript.primary.json` pointer — scratch-only, not evidence.
      const primaryPointerPath = `${result.receiveSideWavPath}.transcript.primary.json`;
      if (fs.existsSync(primaryPointerPath)) fs.unlinkSync(primaryPointerPath);
    },
    60_000,
  );
});
