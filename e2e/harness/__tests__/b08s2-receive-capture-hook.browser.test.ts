// Real-Chromium browser test for B08S-2 receive-side capture hook (F3).
// Loopback RTCPeerConnection pair: pc1 sends real fake-device audio,
// pc2 (receiver) has capture hook installed and asserts classifyCapture returns
// VALID with non-zero RMS. This closes the gap: tests mock page.evaluate(),
// but real capture pipeline must work in a real browser.
//
// Pattern mirrors B08A-2 (sender-liveness.browser.test.ts): loopback on
// 127.0.0.1, fake-device audio, zero call-burn, no room/SFU/login.

import { describe, it, expect, afterAll } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type Page } from '@playwright/test';
import { installCaptureHook, classifyCapture, getDocumentLoadCount } from '../receive-side-recorder.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const FAKE_AUDIO_SOURCE = path.resolve(HERE, '../../fixtures/bot-speech/bot-140/hello.wav');
const FAKE_DEVICE_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${FAKE_AUDIO_SOURCE}`,
  '--autoplay-policy=no-user-gesture-required',
];

async function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body>b08s2 receive-capture-hook test</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/`;
  return {
    url,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

describe('B08S-2 receive-capture-hook (real browser loopback, fake-device audio)', () => {
  let browser: Browser | undefined;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it(
    'capture hook installs on receiver page; loopback pc1→pc2 with real audio; classifyCapture returns VALID with non-zero RMS',
    async () => {
      server = await startServer();
      browser = await chromium.launch({ args: FAKE_DEVICE_ARGS });
      const context = await browser.newContext();
      const page = await context.newPage();

      // Install capture hook on receiver BEFORE navigation (F1 ordering guard)
      await installCaptureHook(page);

      // Navigate
      await page.goto(server.url);

      // Build loopback: pc1 sends fake-device audio (hello.wav file), pc2 receives (with hook installed)
      const captureResult = await page.evaluate(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioTrack = stream.getAudioTracks()[0];

        const pc1 = new RTCPeerConnection();
        const pc2 = new RTCPeerConnection();

        pc1.onicecandidate = (e) => e.candidate && pc2.addIceCandidate(e.candidate);
        pc2.onicecandidate = (e) => e.candidate && pc1.addIceCandidate(e.candidate);

        pc1.addTrack(audioTrack, stream);

        const offer = await pc1.createOffer();
        await pc1.setLocalDescription(offer);
        await pc2.setRemoteDescription(offer);
        const answer = await pc2.createAnswer();
        await pc2.setLocalDescription(answer);
        await pc1.setRemoteDescription(answer);

        // Wait for ICE connection
        await new Promise<void>((resolve) => {
          pc1.oniceconnectionstatechange = () => {
            if (pc1.iceConnectionState === 'connected' || pc1.iceConnectionState === 'completed') resolve();
          };
          setTimeout(resolve, 4000);
        });

        // Let audio flow for 2.5s (matches validator probe duration)
        await new Promise((r) => setTimeout(r, 2500));

        // Read capture state from hook
        const state = (window as any).__b08s2ReceiveCapture;

        // Check first byte chunk
        let firstChunkBytes: number[] = [];
        if (state?.audioSamplesBytes && state.audioSamplesBytes.length > 0) {
          const chunk = state.audioSamplesBytes[0];
          firstChunkBytes = Array.from(chunk.slice(0, 16));
        }

        return {
          pcCount: state?.pcCount || 0,
          trackCount: state?.trackCount || 0,
          callbackCount: state?.callbackCount || 0,
          sampleCount: state?.sampleCount || 0,
          audioContextState: state?.audioContextState || 'unknown',
          audioSamplesBytesLength: (state?.audioSamplesBytes || []).reduce((sum: number, chunk: Uint8Array) => sum + chunk.length, 0),
          audioSamplesChunkCount: (state?.audioSamplesBytes || []).length,
          installed: state?.installed || false,
          firstChunkBytes,
        };
      });

      // Assertions: hook should have captured real audio
      expect(captureResult.installed).toBe(true);
      expect(captureResult.pcCount).toBeGreaterThanOrEqual(1);
      expect(captureResult.trackCount).toBeGreaterThanOrEqual(1);
      expect(captureResult.callbackCount).toBeGreaterThan(0);
      expect(captureResult.sampleCount).toBeGreaterThan(0);
      expect(captureResult.audioContextState).toBe('running');
      expect(captureResult.audioSamplesBytesLength).toBeGreaterThan(0);
      expect(captureResult.audioSamplesChunkCount).toBeGreaterThan(0);

      // Read full state and classify
      const fullState = await page.evaluate(() => {
        return (window as any).__b08s2ReceiveCapture;
      });

      const classification = classifyCapture(fullState);

      // Debug log
      console.log('Classification:', {
        kind: classification.kind,
        rms: (classification as any).rms,
        durationMs: (classification as any).durationMs,
        audioSamplesBytesLength: fullState.audioSamplesBytes.reduce((sum: number, chunk: Uint8Array) => sum + chunk.length, 0),
        audioSamplesChunkCount: fullState.audioSamplesBytes.length,
        sampleCount: fullState.sampleCount,
        callbackCount: fullState.callbackCount,
      });
      console.log('Capture result from loop:', captureResult);
      console.log('First bytes:', captureResult.firstChunkBytes);

      // Validation: F1 (no Buffer errors) + F2 (graph connected, callbacks firing) + F3 (loopback audio decoded and captured)
      expect(classification.kind).toBe('VALID'); // F3 gate: must capture real audio, not silence
      expect((classification as any).rms).toBeGreaterThan(0); // Non-zero RMS proves audio was decoded and captured
      expect(classification.durationMs).toBeGreaterThan(0);
      expect(fullState.installed).toBe(true);
      expect(fullState.pcCount).toBeGreaterThanOrEqual(1);
      expect(fullState.trackCount).toBeGreaterThanOrEqual(1);
      expect(fullState.callbackCount).toBeGreaterThan(0); // Callbacks firing = graph connected (F2)
      expect(fullState.audioContextState).toBe('running');
      expect(fullState.audioSamplesBytes.length).toBeGreaterThan(0); // Data captured without errors (F1)

      await context.close();
    },
    45_000,
  );

  it(
    'B00S-RELOAD: SPA-style same-document navigation (history.pushState) does NOT trip INVALID_RELOAD',
    async () => {
      server = await startServer();
      browser = await chromium.launch({ args: FAKE_DEVICE_ARGS });
      const context = await browser.newContext();
      const page = await context.newPage();

      await installCaptureHook(page);
      await page.goto(server.url);

      // Stand-in for an SPA router (e.g. Angular Router) navigating within the
      // same document — this synthetic test harness has no real client-side
      // router to drive, so we call the same API a router would use directly.
      // This must NOT tick the out-of-page document-load counter, because no
      // document is destroyed/recreated.
      const docEpochBefore = await page.evaluate(() => sessionStorage.getItem('__b08s2Doc'));
      await page.evaluate(() => {
        history.pushState({}, '', location.href);
      });
      const docEpochAfter = await page.evaluate(() => sessionStorage.getItem('__b08s2Doc'));

      expect(getDocumentLoadCount(page)).toBe(1);
      expect(docEpochAfter).toBe(docEpochBefore); // unchanged: no document creation occurred

      const state = await page.evaluate(() => {
        return { ...(window as any).__b08s2ReceiveCapture, audioSamplesBytes: [] };
      });
      const classification = classifyCapture(state, { documentLoadCount: getDocumentLoadCount(page) });
      expect(classification.kind).not.toBe('INVALID_RELOAD');

      await context.close();
    },
    30_000,
  );

  it(
    'B00S-RELOAD: an actual page.reload() DOES trip INVALID_RELOAD',
    async () => {
      server = await startServer();
      browser = await chromium.launch({ args: FAKE_DEVICE_ARGS });
      const context = await browser.newContext();
      const page = await context.newPage();

      await installCaptureHook(page);
      await page.goto(server.url);
      expect(getDocumentLoadCount(page)).toBe(1);

      await page.reload();

      // Real reload destroys the document: addInitScript re-runs, in-page state
      // (__b08s2ReceiveCapture) resets — but the out-of-page counter and the
      // sessionStorage epoch (which survives reload) both corroborate a second
      // document load.
      expect(getDocumentLoadCount(page)).toBe(2);
      const docEpoch = await page.evaluate(() => sessionStorage.getItem('__b08s2Doc'));
      expect(docEpoch).toBe('2');

      const state = await page.evaluate(() => {
        return { ...(window as any).__b08s2ReceiveCapture, audioSamplesBytes: [] };
      });
      const classification = classifyCapture(state, { documentLoadCount: getDocumentLoadCount(page) });
      expect(classification.kind).toBe('INVALID_RELOAD');

      await context.close();
    },
    30_000,
  );
});
