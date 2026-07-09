// Real-Chromium mechanism proof for B08A-2's classifySenderLiveness (AC15b
// discrimination clause). Same evidence tier as D19's gum-shim.browser.test.ts
// and B07's b07-capture-injection.browser.test.ts: launches Chromium directly
// against a throwaway local HTTP server, no app/DB/login/room/SFU. Zero/25 call
// budget burned. This does NOT close AC15 — the live clause needs a far-end
// transcript (B08A-3); this proves the DISCRIMINATOR MECHANISM only.
//
// Unlike B07's test (which mirrors app constants by hand because they're
// pre-existing/stable), this file imports the REAL `extractOutboundLiveness`
// (B08A-1) and `classifySenderLiveness` (this batch) directly from
// frontend/src/app/services/mic-energy.js — a cross-package relative import,
// smoke-tested to resolve cleanly under this e2e package's vitest config
// (mic-energy.ts is documented framework-free: no Angular, no DOM). Mirroring
// would mean asserting a hand-copied reimplementation of brand-new-this-batch
// logic against itself — no signal. Importing the product function directly is
// strictly stronger evidence.
//
// Two loopback RTCPeerConnections (pc1 sends, pc2 receives, ICE candidates
// exchanged locally on 127.0.0.1) are required because outbound-rtp stats only
// populate once media is actually flowing end-to-end — confirmed empirically
// while forming this batch's plan (see
// decisions/2026-07-09-b08a2-empirical-findings.md): a one-sided PeerConnection
// with no answer never produces a packetsSent counter to sample.
import { describe, it, expect, afterAll } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type Page } from '@playwright/test';
import { modeBInitScript } from '../capture-injection.js';
import { extractOutboundLiveness, classifySenderLiveness, type OutboundLivenessStats } from '../../../frontend/src/app/services/mic-energy.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const FAKE_AUDIO_SOURCE = path.resolve(HERE, '../../fixtures/bot-speech/bot-140/hello.wav');
const FAKE_DEVICE_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${FAKE_AUDIO_SOURCE}`,
];

const SPEECH_FIXTURE_PATH = path.resolve(HERE, '../../fixtures/bot-speech/bot-123/hello.wav');
const HOLD_DURATION_MS = 900; // matches B07's precedent; not a gating value (T_gap is VOID per D27).

async function startServer(): Promise<{ url: string; speechUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (req.url === '/speech.wav') {
      res.setHeader('Content-Type', 'audio/wav');
      fs.createReadStream(SPEECH_FIXTURE_PATH).pipe(res);
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body>b08a2 sender-liveness harness</body></html>');
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

/** Plain-object shape returned per getStats() entry — page.evaluate() serializes via structured JSON. */
type RawStatEntry = Record<string, unknown>;

/** Wraps a plain array of already-serialized stat entries back into the extractor's `.values()` input contract. */
function toStatsLike(entries: RawStatEntry[]): { values(): IterableIterator<any> } {
  return { values: () => entries.values() };
}

/**
 * Establishes a real loopback RTCPeerConnection pair inside the page (pc1
 * sends the given track, pc2 receives — ICE candidates exchanged locally, no
 * STUN/TURN needed on 127.0.0.1) and returns a page-context handle plus a
 * sampling function that snapshots pc1's raw getStats() entries.
 */
async function setupLoopbackAndSample(
  page: Page,
): Promise<{ sampleRawEntries: () => Promise<RawStatEntry[]>; deactivateSender: () => Promise<void> }> {
  await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = stream.getAudioTracks()[0];

    const pc1 = new RTCPeerConnection();
    const pc2 = new RTCPeerConnection();
    pc1.onicecandidate = (e) => e.candidate && pc2.addIceCandidate(e.candidate);
    pc2.onicecandidate = (e) => e.candidate && pc1.addIceCandidate(e.candidate);
    const sender = pc1.addTrack(track, stream);

    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    await pc2.setRemoteDescription(offer);
    const answer = await pc2.createAnswer();
    await pc2.setLocalDescription(answer);
    await pc1.setRemoteDescription(answer);

    await new Promise<void>((resolve) => {
      pc1.oniceconnectionstatechange = () => {
        if (pc1.iceConnectionState === 'connected' || pc1.iceConnectionState === 'completed') resolve();
      };
      setTimeout(resolve, 4000);
    });

    (window as any).__b08a2 = { pc1, pc2, sender, track };
  });

  const sampleRawEntries = async (): Promise<RawStatEntry[]> =>
    page.evaluate(async () => {
      const { pc1 } = (window as any).__b08a2;
      const report: RTCStatsReport = await pc1.getStats();
      return [...report.values()];
    });

  const deactivateSender = async (): Promise<void> => {
    await page.evaluate(async () => {
      const { sender } = (window as any).__b08a2;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0] = { ...params.encodings[0], active: false };
      await sender.setParameters(params);
    });
  };

  return { sampleRawEntries, deactivateSender };
}

/** Samples pc1's raw getStats() entries at a fixed cadence for `durationMs`, returning one OutboundLivenessStats per tick via the REAL B08A-1 extractor. */
async function sampleLivenessWindow(
  sampleRawEntries: () => Promise<RawStatEntry[]>,
  durationMs: number,
  everyMs = 200,
): Promise<OutboundLivenessStats[]> {
  const window: OutboundLivenessStats[] = [];
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    const entries = await sampleRawEntries();
    window.push(extractOutboundLiveness(toStatsLike(entries)));
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return window;
}

describe('B08A-2 sender-liveness discriminator mechanism proof against real Chromium (no room join, 0/25 call burn)', () => {
  let browser: Browser | undefined;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it(
    'sender-dead: setParameters({active:false}) freezes packetsSent while totalAudioEnergy keeps climbing',
    async () => {
      server = await startServer();
      browser = await chromium.launch({ args: FAKE_DEVICE_ARGS });
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(server.url);

      const { sampleRawEntries, deactivateSender } = await setupLoopbackAndSample(page);

      const baselineWindow = await sampleLivenessWindow(sampleRawEntries, 700);
      expect(classifySenderLiveness(baselineWindow)).toBe('both-advancing');

      await deactivateSender();
      const postWindow = await sampleLivenessWindow(sampleRawEntries, 1500);
      expect(classifySenderLiveness(postWindow)).toBe('sender-dead');
      expect(classifySenderLiveness(postWindow)).not.toBe('indeterminate');

      await context.close();
    },
    45_000,
  );

  it(
    'capture-dead: literal silence (B07 Mode B) freezes totalAudioEnergy while packetsSent keeps climbing (no DTX on this stack)',
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

      const { sampleRawEntries } = await setupLoopbackAndSample(page);

      // Sample entirely within the hold phase (literal silence).
      const holdWindow = await sampleLivenessWindow(sampleRawEntries, Math.max(300, HOLD_DURATION_MS - 400));
      expect(classifySenderLiveness(holdWindow)).toBe('capture-dead');
      expect(classifySenderLiveness(holdWindow)).not.toBe('indeterminate');

      // Bonus: past the timer-driven switch to the speech fixture, capture resumes too.
      await new Promise((r) => setTimeout(r, 500));
      const postSwitchWindow = await sampleLivenessWindow(sampleRawEntries, 900);
      expect(classifySenderLiveness(postSwitchWindow)).toBe('both-advancing');

      await context.close();
    },
    45_000,
  );
});
