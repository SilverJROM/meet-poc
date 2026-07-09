// Real-Chromium mechanism proof for B07's Mode A / Mode B capture injection.
//
// Same evidence tier as D19's gum-shim.browser.test.ts: launches Chromium
// directly against a throwaway local HTTP server, no app/DB/login/room. This
// proves the INJECTION MECHANISM produces the intended hold-phase signature on a
// real captured track and that the harness-controlled timer switch to a known
// fixture is measurably real — nothing more.
//
// What this file does NOT prove: no RTCPeerConnection, no SFU, no far-end
// getStats(), no transcript. AC4/AC5 (far-end transcript proof of recovery)
// require a real 2-party room call and stay OPEN for B13/B14 — see
// decisions/b07-findings.md. This test burns 0/25 call budget (no room join).
//
// MEASURED FINDING: the bot-speech fixtures (e2e/fixtures/bot-speech/**) are
// synthetic steady-state tones (440Hz/660Hz), not real speech with amplitude
// envelope variation — confirmed by live measurement here (see
// decisions/b07-findings.md). Their windowed RMS is just as flat as a frozen
// hold-phase signal, so this file asserts the fixture-independent claim the
// mechanism actually supports (a measurable level/state change at the moment of
// switch), not "no longer flat" — which these fixtures cannot demonstrate.
import { describe, it, expect, afterAll } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type Page } from '@playwright/test';
import {
  modeAInitScript,
  modeBInitScript,
  classifyHoldPhaseSignature,
  MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD,
} from '../capture-injection.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Chromium's default fake capture device is SILENT (all-zero samples); loop a real
// WAV through it so getUserMedia() returns a non-trivial real track for the shim
// to wrap, matching D19's gum-shim.browser.test.ts setup.
const FAKE_AUDIO_SOURCE = path.resolve(HERE, '../../fixtures/bot-speech/bot-140/hello.wav');
const FAKE_DEVICE_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${FAKE_AUDIO_SOURCE}`,
];

// Distinct fixture for the post-switch phase so a measured change can only be
// explained by the injection's speech-phase swap, not by the fake capture
// device's own looping tone bleeding through.
const SPEECH_FIXTURE_PATH = path.resolve(HERE, '../../fixtures/bot-speech/bot-123/hello.wav');

const HOLD_DURATION_MS = 900; // longer than T_GAP_PROVISIONAL_MS to leave headroom for fetch+decodeAudioData latency in-test; not a gating value.

async function startServer(): Promise<{ url: string; speechUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (req.url === '/speech.wav') {
      res.setHeader('Content-Type', 'audio/wav');
      fs.createReadStream(SPEECH_FIXTURE_PATH).pipe(res);
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body>b07 capture-injection harness</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/`;
  return {
    url,
    speechUrl: `${url}speech.wav`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

/**
 * Samples the shimmed track's windowed RMS before and after the injection's
 * harness-controlled switch, all within ONE getUserMedia() acquisition so the
 * shim's internal setTimeout is exercised exactly once, matching how a real
 * caller would use it.
 */
async function captureHoldAndPostSwitch(
  page: Page,
  holdDurationMs: number,
): Promise<{ hold: number[]; post: number[] }> {
  return page.evaluate(async (holdDurationMs) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioContextCtor =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const audioContext = new AudioContextCtor();
    await audioContext.resume();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);

    // Let the graph settle past the source's onset transient (the first render
    // quantum can straddle silence-before-start and the steady-state level)
    // before the hold-phase window begins; otherwise the very first sample can
    // read low and falsely trip the flat-window variance check below.
    await new Promise((resolve) => setTimeout(resolve, 120));

    async function sampleFor(ms: number): Promise<number[]> {
      const out: number[] = [];
      const deadline = performance.now() + ms;
      while (performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        analyser.getFloatTimeDomainData(buffer);
        let sumSquares = 0;
        for (let j = 0; j < buffer.length; j++) sumSquares += buffer[j] * buffer[j];
        out.push(Math.sqrt(sumSquares / buffer.length));
      }
      return out;
    }

    const startedAt = performance.now();
    const hold = await sampleFor(Math.max(180, holdDurationMs - 400));
    const elapsed = performance.now() - startedAt;
    const remainingToSwitch = holdDurationMs - elapsed;
    if (remainingToSwitch > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingToSwitch + 300));
    }
    const post = await sampleFor(420);

    stream.getTracks().forEach((track) => track.stop());
    await audioContext.close();
    return { hold, post };
  }, holdDurationMs);
}

describe('B07 capture-injection mechanism proof against real Chromium (no room join, 0/25 call burn)', () => {
  let browser: Browser | undefined;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it(
    'Mode A: hold phase reads frozen-nonzero on a real track, post-switch reads a measurably different level',
    async () => {
      server = await startServer();
      browser = await chromium.launch({ args: FAKE_DEVICE_ARGS });
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.addInitScript(modeAInitScript, {
        frozenLevel: 0.15,
        holdDurationMs: HOLD_DURATION_MS,
        speechWavUrl: server.speechUrl,
      });
      await page.goto(server.url);

      const { hold, post } = await captureHoldAndPostSwitch(page, HOLD_DURATION_MS);
      await context.close();

      expect(hold.length).toBeGreaterThanOrEqual(2);
      expect(post.length).toBeGreaterThanOrEqual(2);

      const holdClass = classifyHoldPhaseSignature(hold);
      expect(holdClass).toBe('frozen-nonzero');
      const holdLevel = Math.max(...hold);
      expect(holdLevel).toBeGreaterThan(0); // genuinely non-zero, not accidentally silent

      // The post-switch fixture (bot-speech) is itself a synthetic steady-state tone, not real
      // speech with amplitude envelope variation — see decisions/b07-findings.md. So
      // classifyHoldPhaseSignature(post) would ALSO read flat; asserting 'neither' here would be
      // a false claim about content this fixture cannot provide. The fixture-independent claim
      // the mechanism actually supports: the timer-driven source swap produced a measurably
      // DIFFERENT plateau than the frozen hold level, proving the switch really happened.
      const postLevel = Math.max(...post);
      const relativeChange = Math.abs(postLevel - holdLevel) / holdLevel;
      expect(relativeChange).toBeGreaterThan(0.2);
    },
    45_000,
  );

  it(
    'Mode B: hold phase reads silent on a real track, post-switch is measurably no longer silent',
    async () => {
      server = await startServer();
      browser = await chromium.launch({ args: FAKE_DEVICE_ARGS });
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.addInitScript(modeBInitScript, {
        holdDurationMs: HOLD_DURATION_MS,
        speechWavUrl: server.speechUrl,
      });
      await page.goto(server.url);

      const { hold, post } = await captureHoldAndPostSwitch(page, HOLD_DURATION_MS);
      await context.close();

      expect(hold.length).toBeGreaterThanOrEqual(2);
      expect(post.length).toBeGreaterThanOrEqual(2);

      const holdClass = classifyHoldPhaseSignature(hold);
      expect(holdClass).toBe('silent');
      expect(Math.max(...hold)).toBeLessThan(MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD); // genuinely silent

      // Same fixture caveat as Mode A: the post-switch tone is RMS-flat, so it will also classify
      // 'frozen-nonzero' rather than 'neither'. The claim this mechanism proof supports is the
      // fixture-independent one: silence really ended — the level crossed back above the silence
      // threshold, proving the timer-driven switch happened.
      const postLevel = Math.max(...post);
      expect(postLevel).toBeGreaterThan(MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD);
    },
    45_000,
  );
});
