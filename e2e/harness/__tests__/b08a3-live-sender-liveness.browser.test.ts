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
// Far-end evidence class: the receive-side transcript is script-sourced
// (generateScriptTranscript, B08S-2) and labeled scriptExpected in its file
// header — real STT is not wired on this stack, and the brief explicitly
// allows this evidence class as long as it is labeled (binding #4). The
// receive-side WAV capture (also B08S-2 spine) is the corroborating spine
// support: non-SILENCE classification with rms>0 proves real audio actually
// landed at the far end, not just that a script was declared.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { joinDualBrowserCall } from '../call-driver.js';
import { getState, initLedger } from '../call-ledger.js';
import type { ConversationScript } from '../conversation-scheduler.js';
import {
  extractOutboundLiveness,
  classifySenderLiveness,
  type OutboundLivenessStats,
} from '../../../frontend/src/app/services/mic-energy.js';

const BASE_URL = 'http://localhost:4700';

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

      // Minimal script-sourced label for the far-end transcript (B08S-2 evidence
      // class, labeled scriptExpected). Speech itself is Chrome's continuous
      // fake-device audio (empirically non-silent/climbing per
      // decisions/2026-07-09-b08a2-empirical-findings.md) — not this script's
      // playback, which the harness does not wire (out of scope here, composition
      // only per binding #2/deliberation #2).
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

      // --- Far-end evidence (binding #4): receive WAV + script-sourced labeled transcript ---
      expect(result.receiveSideWavPath).toBeTruthy();
      expect(fs.existsSync(result.receiveSideWavPath!)).toBe(true);

      const metaPath = result.receiveSideWavPath!.replace(/\.wav$/, '.meta.json');
      expect(fs.existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(meta.reason).not.toBe('SILENCE');
      expect(meta.rms).toBeGreaterThan(0);

      expect(result.transcriptPath).toBeTruthy();
      expect(fs.existsSync(result.transcriptPath!)).toBe(true);
      const transcriptOnDisk = fs.readFileSync(result.transcriptPath!, 'utf-8');
      expect(transcriptOnDisk).toContain('scriptExpected');
      expect(result.transcriptContent).toBeTruthy();
      expect(result.transcriptContent!.length).toBeGreaterThan(0);

      // Ephemeral per-run evidence, not meant to accumulate in the repo tree —
      // a validator re-run produces its own fresh WAV/meta/transcript.
      for (const p of [result.receiveSideWavPath, metaPath, result.transcriptPath]) {
        if (p && fs.existsSync(p)) fs.unlinkSync(p);
      }
    },
    60_000,
  );
});
