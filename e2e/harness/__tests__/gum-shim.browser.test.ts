// Real-Chromium proof that the D19 forced-mode shim actually attenuates the
// REAL, already-processed getUserMedia() track — not a claim, a measurement.
// Launches Chromium directly (same fake-device flags e2e/playwright.config.ts
// uses) against a throwaway local HTTP server; no app, DB, or login needed,
// since this batch is capture-path only.
import { describe, it, expect, afterAll } from 'vitest';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type Page } from '@playwright/test';
import { gumShimInitScript, computeStimulusVerification, verifyStimulus } from '../gum-shim.js';
import { RecordingArbiter, type RecordingAnalysis } from '../recording-arbiter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Chromium's default fake capture device is SILENT (all-zero samples) — RMS=0
// regardless of any downstream gain, which would make this test meaningless.
// --use-file-for-fake-audio-capture loops a real WAV through the SAME fake
// device + real AGC/EC/NS pipeline, reusing a B03 bot-speech fixture instead of
// adding a new binary asset.
const FAKE_AUDIO_SOURCE = path.resolve(HERE, '../../fixtures/bot-speech/bot-140/hello.wav');
const FAKE_DEVICE_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${FAKE_AUDIO_SOURCE}`,
];

async function startBlankServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body>gum-shim harness</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

// Samples getUserMedia's audio track RMS over ~480ms via a fresh AnalyserNode
// downstream of whatever track getUserMedia() resolves to (shimmed or not).
async function captureRms(page: Page): Promise<number> {
  return page.evaluate(async () => {
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
    const rmsSamples: number[] = [];
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      analyser.getFloatTimeDomainData(buffer);
      let sumSquares = 0;
      for (let j = 0; j < buffer.length; j++) sumSquares += buffer[j] * buffer[j];
      rmsSamples.push(Math.sqrt(sumSquares / buffer.length));
    }

    stream.getTracks().forEach((track) => track.stop());
    await audioContext.close();
    return rmsSamples.reduce((a, b) => a + b, 0) / rmsSamples.length;
  });
}

describe('gum-shim against real Chromium (D19 forced mode)', () => {
  let browser: Browser | undefined;
  let server: { url: string; close: () => Promise<void> } | undefined;

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it(
    'r=0.50: attenuation applied downstream of getUserMedia verifies within +/-20%, and one invalid control cannot be silently PASSed',
    async () => {
      server = await startBlankServer();
      browser = await chromium.launch({ args: FAKE_DEVICE_ARGS });

      // Baseline: real getUserMedia(), no shim.
      const baselineContext = await browser.newContext();
      const baselinePage = await baselineContext.newPage();
      await baselinePage.goto(server.url);
      const baselineRms = await captureRms(baselinePage);
      await baselineContext.close();

      // Shimmed: same real device, forced r=0.50 downstream of Chrome's own processing.
      const shimmedContext = await browser.newContext();
      const shimmedPage = await shimmedContext.newPage();
      await shimmedPage.addInitScript(gumShimInitScript, 0.5);
      await shimmedPage.goto(server.url);
      const attenuatedRms = await captureRms(shimmedPage);
      await shimmedContext.close();

      expect(baselineRms).toBeGreaterThan(0); // fake device must produce a measurable signal

      const verification = computeStimulusVerification(0.5, baselineRms, attenuatedRms);
      const arbiter = new RecordingArbiter();
      const analysis: RecordingAnalysis = {
        recordingPath: 'live-capture.wav',
        voicedSegments: [],
        overallLoudness: { rms: attenuatedRms, lufs: -30 },
      };

      const verdict = arbiter.determineVerdict(analysis, verification);
      expect(verification.withinTolerance).toBe(true);
      expect(verdict.verdict).toBe('PASS');

      // Invalid control, same live run: the reference (baseline) capture is what
      // never happened this time — verifyStimulus must refuse to fabricate a
      // measured gain, and the arbiter must report INVALID, not a false PASS.
      const invalidVerification = verifyStimulus(0.5, null, attenuatedRms);
      const invalidVerdict = arbiter.determineVerdict(analysis, invalidVerification);
      expect(invalidVerification).toBeUndefined();
      expect(invalidVerdict.verdict).toBe('INVALID');
    },
    45_000,
  );
});
