import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { chromium } from 'playwright';
import { createRoomViaApi, ownerSessionCookie, type TestRoom } from './rooms';
import { email, initialPassword } from './auth';

const REPO_ROOT = path.resolve(process.cwd(), '..');
export const AUDIO_DIR = path.join(REPO_ROOT, 'e2e/fixtures/audio');

// Non-harmonic 4-tone set for per-publisher spectral attribution.
// No tone is an integer multiple of any other: 440/660=0.667, 660/940=0.702, 940/1100=0.855.
// Harmonics of 440 (880,1320…) and 660 (1320…) do not alias to any other fundamental here.
export const TONE_SET = { HOST: 440, GUEST: 660, LOCAL1: 940, LOCAL2: 1100 } as const;

export const TONE_HOST     = path.join(AUDIO_DIR, 'tone-440.wav');
export const TONE_GUEST    = path.join(AUDIO_DIR, 'tone-660.wav');   // updated: 660 (was 880 — octave harmonic)
export const TONE_880      = path.join(AUDIO_DIR, 'tone-880.wav');   // kept for backward compat
export const TONE_LOCAL1   = path.join(AUDIO_DIR, 'tone-940.wav');
export const TONE_LOCAL2   = path.join(AUDIO_DIR, 'tone-1100.wav');

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface AudioMetrics {
  energyRmsPeak: number;
  energyAboveFloorMs: number;
  inboundBytesDelta: number;
  audioLevel: number;
  pass: boolean;
  samples: number;
}

export interface PublisherAudioMetrics {
  clientId: string;
  energyRmsPeak: number;
  energyAboveFloorMs: number;
  spectralPeakHz: number | null;
  spectralPeakMagDb: number;
  attributedToneHz: number | null;
  toneAttributionOk: boolean;
  perTrackBytesDelta: number;
  pass: boolean;                // energy>=3s + toneAttributionOk + perTrackBytesDelta>0
}

export interface PerPublisherMeasureResult {
  publishers: PublisherAudioMetrics[];
  startedAt: number;
  durationMs: number;
  error?: string;
}

export interface MeasureOptions {
  durationMs?: number;
  floor?: number;
  sampleIntervalMs?: number;
}

// ── Readiness gates ───────────────────────────────────────────────────────────

/**
 * Gate #1 — host (or any publisher) OUTBOUND bytes rising.
 * Call on the publishing page before triggering receivers/agents.
 */
export async function waitForOutboundAudioReady(page: Page, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let prev = 0;
  while (Date.now() < deadline) {
    const bytes: number = await page.evaluate(async () => {
      const d = (window as any).__meetDebug;
      if (!d?.sfuGetStats) return 0;
      const stats = await d.sfuGetStats().catch(() => null);
      let max = 0;
      if (stats) stats.forEach((s: any) => {
        if (s.type === 'outbound-rtp' && s.kind === 'audio') max = Math.max(max, s.bytesSent || 0);
      });
      return max;
    }).catch(() => 0);
    if (bytes > 0 && bytes > prev) return;   // bytes rising = publishing
    prev = Math.max(prev, bytes);
    await page.waitForTimeout(500);
  }
  throw new Error(`waitForOutboundAudioReady: host not publishing outbound audio after ${timeoutMs}ms`);
}

/**
 * Gate #2 — per-receiver inbound tracks ready (subscribed + first bytes flowing).
 * Call on the receiving page before measurePerPublisherAudio.
 */
export async function waitForInboundTracksReady(
  page: Page,
  publisherCount = 1,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready: boolean = await page.evaluate(async ({ count }) => {
      const d = (window as any).__meetDebug;
      const streams: Map<string, MediaStream> | undefined = d?.sfuRemoteStreams;
      if (!streams || streams.size < count) return false;
      // All expected streams must have a live audio track
      for (const stream of streams.values()) {
        const t = stream.getAudioTracks()[0];
        if (!t || t.readyState !== 'live') return false;
      }
      // At least one inbound-rtp stat must show bytes flowing
      if (!d?.sfuGetStats) return false;
      const stats = await d.sfuGetStats().catch(() => null);
      if (!stats) return false;
      let hasBytes = false;
      stats.forEach((s: any) => {
        if (s.type === 'inbound-rtp' && s.kind === 'audio' && (s.bytesReceived || 0) > 0) hasBytes = true;
      });
      return hasBytes;
    }, { count: publisherCount }).catch(() => false);
    if (ready) return;
    await page.waitForTimeout(400);
  }
  throw new Error(`waitForInboundTracksReady: inbound tracks not ready after ${timeoutMs}ms (expected ${publisherCount} publisher(s))`);
}

// ── START_MEASURE_AT sync marker ──────────────────────────────────────────────

/** Set on the host/orchestrator page once gate#1 is satisfied. */
export async function setStartMeasureMarker(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ts = Date.now();
    (window as any).__startMeasureAt = ts;
    if ((window as any).__meetDebug) (window as any).__meetDebug.startMeasureAt = ts;
    return ts;
  });
}

/** Remote agents poll this before measuring (honors single-window discipline). */
export async function waitForStartMeasureMarker(page: Page, timeoutMs = 30_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ts: number = await page.evaluate(() => (window as any).__startMeasureAt || 0).catch(() => 0);
    if (ts > 0) return ts;
    await page.waitForTimeout(400);
  }
  throw new Error(`waitForStartMeasureMarker: marker not set after ${timeoutMs}ms`);
}

// ── Per-publisher per-track FFT measurement ───────────────────────────────────

/**
 * Measure all remote publishers simultaneously in one time window.
 * Per track: RMS energy, FFT spectral peak, per-track inbound bytes delta.
 * Tone attribution: spectral peak matched to nearest tone in toneSetHz (±60 Hz).
 * Pass per cell: energy>=3s + toneAttributionOk + perTrackBytesDelta>0.
 *
 * @param toneSetHz  Known tones to attribute against, e.g. [440, 660, 940, 1100]
 */
export async function measurePerPublisherAudio(
  page: Page,
  toneSetHz: number[] = Object.values(TONE_SET),
  opts: MeasureOptions = {},
): Promise<PerPublisherMeasureResult> {
  const duration = opts.durationMs ?? 5_000;
  const floor = opts.floor ?? 0.0015;
  const interval = opts.sampleIntervalMs ?? 80;
  const startedAt = Date.now();

  const result = await page.evaluate(async ({ toneSetHz, duration, floor, interval }) => {
    const debug = (window as any).__meetDebug || {};
    const sfuGetStats: (() => Promise<RTCStatsReport>) | undefined = debug.sfuGetStats;
    const remoteStreams: Map<string, MediaStream> | undefined = debug.sfuRemoteStreams;

    if (!remoteStreams || remoteStreams.size === 0) {
      return { error: 'no-remote-streams', publishers: [] };
    }

    // Build per-track bytesReceived from a stats report
    function bytesPerTrack(stats: RTCStatsReport | null): Record<string, number> {
      const map: Record<string, number> = {};
      if (!stats) return map;
      const byId: Record<string, any> = {};
      stats.forEach((s: any) => { byId[s.id] = s; });
      stats.forEach((s: any) => {
        if (s.type === 'inbound-rtp' && s.kind === 'audio') {
          // Chrome M113+: trackIdentifier on inbound-rtp directly; older: via track stat
          let trackId: string | undefined = s.trackIdentifier;
          if (!trackId && s.trackId) {
            const trackStat = byId[s.trackId];
            trackId = trackStat?.trackIdentifier;
          }
          if (trackId) map[trackId] = Math.max(map[trackId] ?? 0, s.bytesReceived || 0);
        }
      });
      return map;
    }

    const stats0 = sfuGetStats ? await sfuGetStats().catch(() => null) : null;
    const before = bytesPerTrack(stats0);

    const AudioContextCtor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const FFT_SIZE = 8192;

    const contexts: AudioContext[] = [];
    const analysers: AnalyserNode[] = [];
    const timeBufs: Float32Array[] = [];
    const freqBufs: Float32Array[] = [];
    const trackIds: string[] = [];
    const clientIds: string[] = [];

    for (const [clientId, stream] of remoteStreams) {
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== 'live') continue;

      const ctx = new AudioContextCtor();
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }
      const src = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.0;  // no smoothing — sharpest spectral peaks
      src.connect(analyser);

      contexts.push(ctx);
      analysers.push(analyser);
      timeBufs.push(new Float32Array(FFT_SIZE));
      freqBufs.push(new Float32Array(analyser.frequencyBinCount));
      trackIds.push(track.id);
      clientIds.push(clientId);
    }

    if (contexts.length === 0) {
      return { error: 'no-live-audio-tracks', publishers: [] };
    }

    const sampleRate = contexts[0].sampleRate;   // typically 48000
    const binHz = sampleRate / FFT_SIZE;          // ~5.86 Hz/bin at 48kHz

    // Search range: 300–1500 Hz bins (avoids DC + ultrasonic noise)
    const binLo = Math.round(300 / binHz);
    const binHi = Math.round(1500 / binHz);

    interface Result {
      clientId: string;
      energyRmsPeak: number;
      energyAboveFloorMs: number;
      spectralPeakHz: number | null;
      spectralPeakMagDb: number;
      attributedToneHz: number | null;
      toneAttributionOk: boolean;
      perTrackBytesDelta: number;
      pass: boolean;
    }
    const results: Result[] = clientIds.map(cid => ({
      clientId: cid,
      energyRmsPeak: 0,
      energyAboveFloorMs: 0,
      spectralPeakHz: null,
      spectralPeakMagDb: -Infinity,
      attributedToneHz: null,
      toneAttributionOk: false,
      perTrackBytesDelta: 0,
      pass: false,
    }));

    // Parallel measurement loop — all publishers in the same time window
    const start = Date.now();
    while (Date.now() - start < duration) {
      for (let i = 0; i < analysers.length; i++) {
        const analyser = analysers[i];
        const res = results[i];

        // RMS energy
        analyser.getFloatTimeDomainData(timeBufs[i]);
        let sum = 0;
        for (let k = 0; k < timeBufs[i].length; k++) sum += timeBufs[i][k] ** 2;
        const rms = Math.sqrt(sum / timeBufs[i].length);
        res.energyRmsPeak = Math.max(res.energyRmsPeak, rms);
        if (rms >= floor) res.energyAboveFloorMs += interval;

        // Spectral peak in search range
        analyser.getFloatFrequencyData(freqBufs[i]);
        let maxMag = -Infinity, maxBin = binLo;
        for (let k = binLo; k <= binHi && k < freqBufs[i].length; k++) {
          if (freqBufs[i][k] > maxMag) { maxMag = freqBufs[i][k]; maxBin = k; }
        }
        if (maxMag > res.spectralPeakMagDb) {
          res.spectralPeakMagDb = maxMag;
          res.spectralPeakHz = maxBin * binHz;
        }
      }
      await new Promise<void>(r => setTimeout(r, interval));
    }

    // After-window stats snapshot for per-track bytes delta
    const stats1 = sfuGetStats ? await sfuGetStats().catch(() => null) : null;
    const after = bytesPerTrack(stats1);

    // Attribute tone + compute pass per publisher
    const TONE_TOLERANCE_HZ = 60;
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      res.perTrackBytesDelta = Math.max(0, (after[trackIds[i]] ?? 0) - (before[trackIds[i]] ?? 0));

      if (res.spectralPeakHz !== null) {
        let bestHz = 0, bestDist = Infinity;
        for (const hz of toneSetHz) {
          const d = Math.abs(hz - res.spectralPeakHz);
          if (d < bestDist) { bestDist = d; bestHz = hz; }
        }
        if (bestDist <= TONE_TOLERANCE_HZ) {
          res.attributedToneHz = bestHz;
          res.toneAttributionOk = true;
        }
      }

      // 3-criteria pass: energy≥3s + spectral attribution OK + per-track bytes rising
      res.pass = res.energyAboveFloorMs >= 3000 && res.toneAttributionOk && res.perTrackBytesDelta > 0;
    }

    // Clean up all AudioContexts
    for (const ctx of contexts) { try { await ctx.close(); } catch {} }

    return { publishers: results };
  }, { toneSetHz, duration, floor, interval });

  return {
    publishers: result.publishers ?? [],
    startedAt,
    durationMs: Date.now() - startedAt,
    error: result.error,
  };
}

// ── Legacy single-publisher measurement (backward compat) ─────────────────────

export async function measureInboundAudio(
  page: Page,
  peerLabel: string,
  opts: MeasureOptions = {}
): Promise<AudioMetrics> {
  const duration = opts.durationMs ?? 5000;
  const floor = opts.floor ?? 0.002;
  const interval = opts.sampleIntervalMs ?? 80;

  return page.evaluate(async ({ peerLabel, duration, floor, interval }) => {
    const w = window as any;
    const debug = w.__meetDebug || {};

    const peers: any[] = Array.isArray(debug.peers) ? debug.peers : [];
    let remotePeer = peers.find((p: any) => !p.isLocal && (p.name || '').toLowerCase().includes(peerLabel.toLowerCase()));
    if (!remotePeer) remotePeer = peers.find((p: any) => !p.isLocal);
    if (!remotePeer || !remotePeer.stream) {
      const streams = debug.sfuRemoteStreams || new Map();
      for (const [id, stream] of streams) {
        if (stream && stream.getAudioTracks && stream.getAudioTracks().length) {
          remotePeer = { id, stream, name: id };
          break;
        }
      }
    }
    const stream: MediaStream | null = remotePeer?.stream || null;
    const audioTrack = stream?.getAudioTracks?.()[0] || null;
    if (!audioTrack) {
      return { energyRmsPeak: 0, energyAboveFloorMs: 0, inboundBytesDelta: 0, audioLevel: 0, pass: false, samples: 0, error: 'no-remote-audio-track' } as any;
    }

    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextCtor();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }
    const src = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.1;
    src.connect(analyser);
    const timeBuf = new Float32Array(analyser.fftSize);

    const getStats = async (): Promise<any> => {
      try {
        if (typeof debug.sfuGetStats === 'function') return await debug.sfuGetStats();
        if (debug.sfuClient && typeof debug.sfuClient.getStats === 'function') return await debug.sfuClient.getStats();
        return null;
      } catch { return null; }
    };

    const start = Date.now();
    let peak = 0, above = 0, lastBytes: number | null = null, bytesDelta = 0, samples = 0;

    while (Date.now() - start < duration) {
      analyser.getFloatTimeDomainData(timeBuf);
      let sum = 0;
      for (let i = 0; i < timeBuf.length; i++) sum += timeBuf[i] * timeBuf[i];
      const rms = Math.sqrt(sum / timeBuf.length) || 0;
      peak = Math.max(peak, rms);
      if (rms >= floor) above += interval;

      const report = await getStats();
      if (report && typeof report.forEach === 'function') {
        report.forEach((stat: any) => {
          if (stat?.type === 'inbound-rtp' && stat.kind === 'audio' && typeof stat.bytesReceived === 'number') {
            const br = stat.bytesReceived;
            if (lastBytes != null) bytesDelta = Math.max(bytesDelta, br - lastBytes);
            lastBytes = br;
          }
        });
      }
      samples++;
      await new Promise(r => setTimeout(r, interval));
    }

    try { src.disconnect(); } catch {}
    try { await ctx.close(); } catch {}

    return { energyRmsPeak: peak, energyAboveFloorMs: above, inboundBytesDelta: bytesDelta, audioLevel: peak, pass: above >= 3000 && bytesDelta > 0, samples } as AudioMetrics;
  }, { peerLabel, duration, floor, interval });
}

// ── Browser / room helpers ─────────────────────────────────────────────────────

export async function launchClientWithFakeAudio(fakeWavPath: string): Promise<{ browser: Browser; page: Page }> {
  if (!fs.existsSync(fakeWavPath)) throw new Error(`fake audio WAV not found: ${fakeWavPath}`);
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${fakeWavPath}`,
    ],
  });
  const page = await browser.newPage();
  return { browser, page };
}

export async function createThrowawayRoom(request: APIRequestContext, prefix = 'RA-E2E'): Promise<TestRoom> {
  const title = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const room = await createRoomViaApi(request, title);
  if (room.id === 'testroom01001' || (room.title || '').includes('TEST_ROOM01')) {
    throw new Error('Refusing to use persistent TEST_ROOM01');
  }
  return room;
}

/** Login + join as host (owner). No ?sfu= param — app is SFU-only. */
export async function joinAsHost(page: Page, room: TestRoom, name = 'host'): Promise<void> {
  const rel = (room.url || '').startsWith('http') ? (room.url.replace(/^https?:\/\/[^/]+/, '') || room.url) : (room.url || '');
  const gotoUrl = `http://localhost:4700${rel}`;
  await page.goto(gotoUrl);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 20000 });
}

/** Guest knock flow. No ?sfu= param — app is SFU-only. */
export async function knockAsGuest(page: Page, room: TestRoom, name = 'guest'): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();

  const guestNameInput = page.locator('#guest-display-name');
  if (await guestNameInput.count() > 0 && await guestNameInput.isVisible().catch(() => false)) {
    await guestNameInput.fill(name);
    await page.getByRole('button', { name: 'Continue' }).click().catch(() => {});
    await page.waitForTimeout(300);
  }

  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.getByText(/Asking the host to admit you|The host is available/)).toBeVisible({ timeout: 10000 });
}

export async function admitFromHost(hostPage: Page, guestName: string): Promise<void> {
  const toast = hostPage.locator('.knock-toast').filter({ hasText: guestName });
  await toast.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);

  if (await toast.isVisible().catch(() => false)) {
    await toast.getByRole('button', { name: 'Admit' }).click();
  } else {
    const show = hostPage.getByRole('button', { name: /Show participants|participants/i });
    if (await show.count() > 0) await show.first().click({ force: true }).catch(() => {});
    const row = hostPage.getByLabel('Waiting to join').locator('li, [role="listitem"]').filter({ hasText: guestName });
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.getByRole('button', { name: 'Admit' }).click();
  }
  await expect(hostPage.locator('app-tile')).toHaveCount(2, { timeout: 15000 }).catch(() => {});
}

/**
 * Full mutual audio proof with readiness gates.
 * Gate#1: host outbound rising. Gate#2: guest inbound tracks ready.
 * Measurement: per-publisher FFT attribution on both sides simultaneously.
 */
export async function assertMutualAudio(
  hostPage: Page,
  guestPage: Page,
  opts: { toneSetHz?: number[]; durationMs?: number } = {},
): Promise<{ hostMeasuresGuest: PublisherAudioMetrics | null; guestMeasuresHost: PublisherAudioMetrics | null }> {
  const toneSetHz = opts.toneSetHz ?? Object.values(TONE_SET);
  const durationMs = opts.durationMs ?? 5200;

  // Gate #1 on both sides (each is publishing)
  await Promise.all([
    waitForOutboundAudioReady(hostPage, 20_000),
    waitForOutboundAudioReady(guestPage, 20_000),
  ]);

  // Gate #2 on both sides (each has the other's inbound track ready)
  await Promise.all([
    waitForInboundTracksReady(hostPage, 1, 15_000),
    waitForInboundTracksReady(guestPage, 1, 15_000),
  ]);

  // Set START_MEASURE_AT on host, broadcast to guest via window.__startMeasureAt
  await setStartMeasureMarker(hostPage);

  // Measure both sides simultaneously
  const [hostResult, guestResult] = await Promise.all([
    measurePerPublisherAudio(hostPage, toneSetHz, { durationMs }),
    measurePerPublisherAudio(guestPage, toneSetHz, { durationMs }),
  ]);

  const hostMeasuresGuest = hostResult.publishers[0] ?? null;
  const guestMeasuresHost = guestResult.publishers[0] ?? null;

  console.log('[AUDIO-RIG] host measures guest:', JSON.stringify(hostMeasuresGuest));
  console.log('[AUDIO-RIG] guest measures host:', JSON.stringify(guestMeasuresHost));

  expect(hostMeasuresGuest?.pass, `host must receive guest tone (energy>=3s + attributed + bytes delta): ${JSON.stringify(hostMeasuresGuest)}`).toBe(true);
  expect(guestMeasuresHost?.pass, `guest must receive host tone (energy>=3s + attributed + bytes delta): ${JSON.stringify(guestMeasuresHost)}`).toBe(true);

  return { hostMeasuresGuest, guestMeasuresHost };
}

export async function captureProofArtifacts(
  hostPage: Page,
  metrics: { hostMeasuresGuest: PublisherAudioMetrics | null; guestMeasuresHost: PublisherAudioMetrics | null },
  outDir: string
): Promise<{ screenshot: string; metricsJson: string; roomId: string }> {
  fs.mkdirSync(outDir, { recursive: true });
  const ts = Date.now();
  const shotPath = path.join(outDir, `2-tile-in-call-${ts}.png`);
  const metricsPath = path.join(outDir, `metrics-${ts}.json`);
  await hostPage.screenshot({ path: shotPath, fullPage: true });
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
  return { screenshot: shotPath, metricsJson: metricsPath, roomId: '' };
}

export function closeBrowsers(browsers: Browser[]): void {
  for (const b of browsers) { b.close().catch(() => {}); }
}
