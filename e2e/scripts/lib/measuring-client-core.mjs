#!/usr/bin/env node
/**
 * measuring-client-core.mjs — shared core for all automated measuring clients.
 *
 * Exports runMeasuringClient(opts) — handles:
 *   - Browser launch with anti-throttle + tone WAV
 *   - Login (host role only)
 *   - Room join (host or guest, with preflight handling)
 *   - Gate#1: own outbound bytes rising
 *   - Gate#2: N remote publishers inbound tracks live + bytes flowing
 *   - Per-publisher parallel FFT measurement (fftSize=8192, 300-1500Hz search)
 *   - TONE_SET nearest-tone attribution (±60Hz), actual-elapsed-time energy accumulation
 *   - 3-criteria pass: energy>=3s + toneOk + bytesDelta>0
 *   - Anti-throttle keepalive (mic toggle every 5 ticks)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

const ANTI_THROTTLE_FLAGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

const LOGIN_EMAIL = 'jrom@silverjrom.app';
const LOGIN_PW = 'Admin@1234';

// ── Gate #1: own outbound bytes rising (publishing to SFU) ───────────────────

export async function waitForOutboundReady(page, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let prev = 0;
  while (Date.now() < deadline) {
    const bytes = await page.evaluate(async () => {
      const d = window.__meetDebug;
      if (!d?.sfuGetStats) return 0;
      const stats = await d.sfuGetStats().catch(() => null);
      let max = 0;
      stats?.forEach(s => { if (s.type === 'outbound-rtp' && s.kind === 'audio') max = Math.max(max, s.bytesSent || 0); });
      return max;
    }).catch(() => 0);
    if (bytes > 0 && bytes > prev) return;
    prev = Math.max(prev, bytes);
    await page.waitForTimeout(500);
  }
  throw new Error(`[${label}] Gate#1 timeout: outbound audio not rising after ${timeoutMs}ms`);
}

// ── Gate #2: N remote publishers inbound tracks live + bytes flowing ──────────

function countActiveInboundPublishers(streams, stats) {
  if (!streams) return 0;
  const byTrack = {};
  if (stats) {
    const idMap = {};
    stats.forEach(s => { idMap[s.id] = s; });
    stats.forEach(s => {
      if (s.type === 'inbound-rtp' && s.kind === 'audio') {
        let tid = s.trackIdentifier;
        if (!tid && s.trackId) tid = idMap[s.trackId]?.trackIdentifier;
        if (tid) byTrack[tid] = Math.max(byTrack[tid] || 0, s.bytesReceived || 0);
      }
    });
  }
  let active = 0;
  for (const [cid, stream] of streams) {
    const t = stream && stream.getAudioTracks && stream.getAudioTracks()[0];
    if (t && t.readyState === 'live') {
      // require either we have per-track bytes recorded or at least some global audio bytes (fallback)
      const hasTrackBytes = Object.keys(byTrack).length === 0 || Object.values(byTrack).some(v => v > 0);
      if (hasTrackBytes) active++;
    }
  }
  // if no per-track info yet, fall back to live track count
  if (active === 0) {
    for (const stream of streams.values()) {
      const t = stream && stream.getAudioTracks && stream.getAudioTracks()[0];
      if (t && t.readyState === 'live') active++;
    }
  }
  return active;
}

export async function waitForInboundReady(page, label, expectedCount, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(async ({ n }) => {
      const d = window.__meetDebug;
      const streams = d?.sfuRemoteStreams;
      if (!streams) return false;
      // count only live tracks that have associated inbound bytes activity
      const stats = d?.sfuGetStats ? await d.sfuGetStats().catch(() => null) : null;
      let active = 0;
      const byTrack = {};
      if (stats) {
        const idMap = {};
        stats.forEach(s => { idMap[s.id] = s; });
        stats.forEach(s => {
          if (s.type === 'inbound-rtp' && s.kind === 'audio') {
            let tid = s.trackIdentifier || (s.trackId && idMap[s.trackId] && idMap[s.trackId].trackIdentifier);
            if (tid) byTrack[tid] = Math.max(byTrack[tid] || 0, s.bytesReceived || 0);
          }
        });
      }
      for (const [cid, stream] of (streams || [])) {
        const t = stream && stream.getAudioTracks && stream.getAudioTracks()[0];
        if (t && t.readyState === 'live') {
          // consider active if we see any positive track bytes or if we have no stats yet
          const tid = t.id;
          if (!stats || Object.keys(byTrack).length === 0 || (byTrack[tid] || 0) > 0) active++;
        }
      }
      if (active < n) return false;
      // require at least some global inbound audio bytes
      let hasAnyBytes = false;
      if (stats) stats.forEach(s => { if (s.type === 'inbound-rtp' && s.kind === 'audio' && (s.bytesReceived||0) > 0) hasAnyBytes = true; });
      return hasAnyBytes || !stats;
    }, { n: expectedCount }).catch(() => false);
    if (ready) return;
    await page.waitForTimeout(400);
  }
  throw new Error(`[${label}] Gate#2 timeout: ${expectedCount} inbound publisher(s) not ready after ${timeoutMs}ms`);
}

// STRICT BARRIER with STABLE MEMBERSHIP: 
// Record the exact set of 3 peer clientIds on first success.
// Require the IDENTICAL set of clientIds (plus self for total 4) to be stable 
// with bytesDelta>0 for >=10s (poll every ~2s).
// Any change (cid churn, join/leave/republish) → RESET and re-record.
// Log BARRIER-OK on first, and BARRIER-STABLE after 10s.
// Only then write .ok and return true. Prevents measuring across re-joins.
export async function waitForBarrierCurrentTracksAndBytes(page, label, expectedPeers, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let recordedPeerCids = null; // sorted array of the 3 peer cids
  let stableStart = 0;
  const requiredStableMs = 10000;
  const pollMs = 2000;

  while (Date.now() < deadline) {
    const check = await page.evaluate(async ({ n }) => {
      const d = window.__meetDebug || {};
      const streams = d.sfuRemoteStreams || new Map();
      const act = new Map();
      for (const [cid, st] of streams) {
        const tr = st.getAudioTracks && st.getAudioTracks()[0];
        if (tr && tr.readyState === 'live') act.set(cid, st);
      }
      if (act.size !== n) {
        return { ok: false, reason: `active-stream-count ${act.size} != ${n}`, details: [], cids: [] };
      }
      const getBytes = async (s) => {
        if (!s) return {};
        const m = {};
        s.forEach(st => {
          if (st.type === 'inbound-rtp' && st.kind === 'audio') {
            let tid = st.trackIdentifier;
            if (tid) m[tid] = Math.max(m[tid] || 0, st.bytesReceived || 0);
          }
        });
        return m;
      };
      const b0 = await (d.sfuGetStats ? d.sfuGetStats().then(getBytes).catch(() => ({})) : Promise.resolve({}));
      await new Promise(r => setTimeout(r, 1200));
      const b1 = await (d.sfuGetStats ? d.sfuGetStats().then(getBytes).catch(() => ({})) : Promise.resolve({}));
      const details = [];
      let allPositive = true;
      const cids = [];
      for (const [cid, st] of act) {
        const tr = st.getAudioTracks && st.getAudioTracks()[0];
        if (!tr || tr.readyState !== 'live') { allPositive = false; continue; }
        const tid = tr.id;
        const delta = Math.max(0, (b1[tid] || 0) - (b0[tid] || 0));
        if (delta <= 0) allPositive = false;
        details.push({ cid, trackId: tid, bytesDelta: delta });
        cids.push(cid);
      }
      return { ok: allPositive, details, cids: cids.sort(), size: act.size };
    }, { n: expectedPeers });

    if (!check.ok) {
      recordedPeerCids = null;
      stableStart = 0;
      await page.waitForTimeout(400);
      continue;
    }

    console.log(`[${label}-BARRIER-OK] size=${check.size} peers=${JSON.stringify(check.details)}`);

    const currentPeers = check.cids; // 3 peer cids, sorted

    if (!recordedPeerCids) {
      recordedPeerCids = currentPeers;
      stableStart = Date.now();
      await page.waitForTimeout(pollMs);
      continue;
    }

    // Check if set is identical
    const sameSet = JSON.stringify(currentPeers) === JSON.stringify(recordedPeerCids);
    if (!sameSet) {
      console.log(`[${label}-BARRIER-RESET] cid set changed from ${JSON.stringify(recordedPeerCids)} to ${JSON.stringify(currentPeers)}`);
      recordedPeerCids = currentPeers;
      stableStart = Date.now();
      await page.waitForTimeout(pollMs);
      continue;
    }

    const elapsed = Date.now() - stableStart;
    if (elapsed >= requiredStableMs) {
      console.log(`[${label}-BARRIER-STABLE] 10s+ with identical membership ${JSON.stringify(recordedPeerCids)}, bytes flowing`);
      try {
        const fs = await import('node:fs');
        fs.writeFileSync(`/tmp/bar-${label.toLowerCase()}.ok`, JSON.stringify({ ts: Date.now(), stableCids: recordedPeerCids }));
      } catch {}
      return true;
    }

    await page.waitForTimeout(pollMs);
  }

  console.log(`[${label}-BARRIER-TIMEOUT]`);
  return false;
}

// ── START_MEASURE_AT sync (for coordinated 4-way window) ──────────────────────

export async function setStartMeasureMarker(page) {
  return page.evaluate(() => {
    const ts = Date.now();
    const w = window;
    w.__startMeasureAt = ts;
    const d = w.__meetDebug;
    if (d) d.startMeasureAt = ts;
    return ts;
  }).catch(() => Date.now());
}

export async function waitForStartMeasureMarker(page, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  const startFile = '/tmp/START_MEASURE_AT';
  while (Date.now() < deadline) {
    const ts = await page.evaluate(() => (window.__startMeasureAt || 0)).catch(() => 0);
    if (ts > 0) return ts;
    // also support cross-process file signal (for coordinated mjs runs + remote agent)
    try {
      const fs = await import('node:fs');
      if (fs.existsSync(startFile)) {
        const m = fs.statSync(startFile).mtimeMs | 0;
        if (m > 0) return m;
      }
    } catch {}
    await page.waitForTimeout(250);
  }
  // do not throw; allow fallback for non-coordinated runs
  console.warn('[MEAS] START marker not seen within timeout, proceeding with measurement');
  return 0;
}

// ── Per-publisher parallel FFT measurement ────────────────────────────────────

export async function measureAllRemotePublishers(page, expectedRemoteTones, durationMs = 6000, ownToneHz = null) {
  const duration = Math.max(1000, (durationMs || 6000) | 0);
  return page.evaluate(async ({ duration, expectedRemoteTones, ownToneHz }) => {
    const debug = window.__meetDebug || {};
    const remoteStreams = debug.sfuRemoteStreams;
    if (!remoteStreams || remoteStreams.size === 0) {
      return { error: 'no-remote-streams', publishers: [], matrixOk: false, matrixError: 'no-remote-streams' };
    }
    // Filter to only active flowing publishers (live track + will have bytes) to reject stales with 0 bytes.
    // Exclude own clientId: SFU echoes the local participant's track back as a remote stream on some paths;
    // including it would attribute the receiver's own tone and miss a real remote publisher.
    const myClientId = debug.myClientId || debug.clientId;
    const activeStreams = new Map();
    for (const [cid, st] of remoteStreams) {
      if (cid === myClientId) continue;
      const tr = st.getAudioTracks && st.getAudioTracks()[0];
      if (tr && tr.readyState === 'live') {
        activeStreams.set(cid, st);
      }
    }
    const expectedCount = expectedRemoteTones.length;
    // Allow one extra stream when ownToneHz is provided: the SFU may echo the local participant's
    // track back as a remote stream even when myClientId exclusion failed (null clientId).
    // That echo will be removed post-attribution by the tone filter below.
    const maxStreams = ownToneHz != null ? expectedCount + 1 : expectedCount;
    if (activeStreams.size < expectedCount || activeStreams.size > maxStreams) {
      return {
        error: `wrong-stream-count: expected ${expectedCount}..${maxStreams}, got ${activeStreams.size}`,
        publishers: [], matrixOk: false,
        matrixError: `stream-count ${activeStreams.size} outside ${expectedCount}..${maxStreams}`,
      };
    }

    const TONE_SET_HZ = [440, 660, 940, 1100];  // non-harmonic set
    const TONE_TOLERANCE = 60;
    const floor = 0.0015;
    const FFT_SIZE = 8192;  // ~5.86 Hz/bin at 48 kHz
    const TICK = 80;

    // Per-track bytes from stats — direct trackIdentifier only (no byId/trackId fallback).
    // The fallback path (byId[s.trackId]?.trackIdentifier) can alias multiple inbound-rtp entries
    // to a shared track stat entry's trackIdentifier, causing >1 publisher to resolve to the same key.
    // The barrier's getBytes function uses direct-only lookup and produces correct varied values;
    // this function matches that behavior exactly.
    function bytesPerTrack(stats) {
      const map = {};
      if (!stats) return map;
      stats.forEach(s => {
        if (s.type === 'inbound-rtp' && s.kind === 'audio') {
          const tid = s.trackIdentifier; // direct only — no byId fallback
          if (tid) map[tid] = Math.max(map[tid] ?? 0, s.bytesReceived || 0);
        }
      });
      return map;
    }

    const getStats = async () => {
      try {
        return typeof debug.sfuGetStats === 'function' ? await debug.sfuGetStats() : null;
      } catch { return null; }
    };

    // Set up one AnalyserNode per remote stream
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const contexts = [], analysers = [], timeBufs = [], freqBufs = [], trackIds = [], clientIds = [];

    for (const [clientId, stream] of activeStreams) {
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== 'live') continue;
      const ctx = new AudioCtx();
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

    if (contexts.length === 0) return { error: 'no-live-audio-tracks', publishers: [], matrixOk: false, matrixError: 'no-live-audio-tracks' };
    // Live-track count must be in [expectedCount, maxStreams]: stale dead-track entries are still wrong
    if (contexts.length < expectedCount || contexts.length > maxStreams) {
      for (const ctx of contexts) { try { await ctx.close(); } catch {} }
      return {
        error: `wrong-live-track-count: expected ${expectedCount}..${maxStreams}, got ${contexts.length}`,
        publishers: [], matrixOk: false,
        matrixError: `live-track-count ${contexts.length} outside ${expectedCount}..${maxStreams}`,
      };
    }

    // Note: per-track bytes are measured AFTER the window (barrier-style), not before, to avoid stale-track staleness.

    const sr = contexts[0].sampleRate;
    const binHz = sr / FFT_SIZE;
    const binLo = Math.round(300 / binHz);   // skip DC and very low freq noise
    const binHi = Math.round(1500 / binHz);  // above the highest expected tone (1100Hz)

    const results = clientIds.map(cid => ({
      clientId: cid,
      energyRmsPeak: 0,
      energyAboveFloorMs: 0,
      spectralPeakHz: null,
      spectralPeakMagDb: -Infinity,
      attributedToneHz: null,
      toneOk: false,
      perTrackBytesDelta: 0,
      pass: false,
    }));
    // temporary RMS buffer per track (not serialized)
    const lastRms = new Float64Array(results.length);

    // Warm-up drain: wait up to 2s for any track to show energy above floor
    const warmup = Date.now() + 2000;
    warmupLoop: while (Date.now() < warmup) {
      for (let i = 0; i < analysers.length; i++) {
        analysers[i].getFloatTimeDomainData(timeBufs[i]);
        let wsum = 0;
        for (let k = 0; k < timeBufs[i].length; k++) wsum += timeBufs[i][k] ** 2;
        if (Math.sqrt(wsum / timeBufs[i].length) >= floor) break warmupLoop;
      }
      await new Promise(r => setTimeout(r, TICK));
    }

    // Measurement window — all publishers sampled in parallel each tick
    const start = Date.now();
    let prevTick = start;
    while (Date.now() - start < duration) {
      for (let i = 0; i < analysers.length; i++) {
        const res = results[i];

        // RMS energy
        analysers[i].getFloatTimeDomainData(timeBufs[i]);
        let sum = 0;
        for (let k = 0; k < timeBufs[i].length; k++) sum += timeBufs[i][k] ** 2;
        const rms = Math.sqrt(sum / timeBufs[i].length) || 0;
        res.energyRmsPeak = Math.max(res.energyRmsPeak, rms);
        lastRms[i] = rms;

        // Spectral peak in 300–1500 Hz band
        analysers[i].getFloatFrequencyData(freqBufs[i]);
        let maxMag = -Infinity, maxBin = binLo;
        for (let k = binLo; k <= binHi && k < freqBufs[i].length; k++) {
          if (freqBufs[i][k] > maxMag) { maxMag = freqBufs[i][k]; maxBin = k; }
        }
        if (maxMag > res.spectralPeakMagDb) {
          res.spectralPeakMagDb = maxMag;
          res.spectralPeakHz = maxBin * binHz;
        }
      }

      await new Promise(r => setTimeout(r, TICK));

      // Actual elapsed time this tick (accounts for JS scheduling jitter)
      const now = Date.now();
      const tickMs = Math.max(now - prevTick, TICK);
      prevTick = now;
      for (let i = 0; i < results.length; i++) {
        if (lastRms[i] >= floor) results[i].energyAboveFloorMs += tickMs;
      }
    }

    // Barrier-style bytes delta: two consecutive snapshots AFTER the window, keyed by cid via the
    // CURRENT live track.id (not the trackIds[] cached at setup time, which may become stale if a
    // track is replaced during the 20s window and causes all trackIds to resolve to the same key).
    // This mirrors waitForBarrierCurrentTracksAndBytes which produces correct, varied per-publisher values.
    const bA = await getStats();
    await new Promise(r => setTimeout(r, 1200));
    const bB = await getStats();
    const bytesMapA = bytesPerTrack(bA);
    const bytesMapB = bytesPerTrack(bB);
    const cidBytesDelta = {};
    const seenTrackIds = new Set(); // detect aliased streams sharing the same track object
    for (const [cid, stream] of activeStreams) {
      const liveTrack = stream.getAudioTracks && stream.getAudioTracks()[0];
      const tid = liveTrack ? liveTrack.id : null;
      if (!tid || seenTrackIds.has(tid)) {
        // Duplicate track.id: two streams share the same underlying track — can't measure independently.
        // Give 0 so pass=false on this publisher rather than a false-shared positive value.
        cidBytesDelta[cid] = 0;
      } else {
        seenTrackIds.add(tid);
        cidBytesDelta[cid] = Math.max(0, (bytesMapB[tid] || 0) - (bytesMapA[tid] || 0));
      }
    }

    // Attribution + 3-criteria pass per publisher
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      res.perTrackBytesDelta = cidBytesDelta[res.clientId] ?? 0;

      if (res.spectralPeakHz !== null) {
        let bestHz = 0, bestDist = Infinity;
        for (const hz of TONE_SET_HZ) {
          const d = Math.abs(hz - res.spectralPeakHz);
          if (d < bestDist) { bestDist = d; bestHz = hz; }
        }
        if (bestDist <= TONE_TOLERANCE) {
          res.attributedToneHz = bestHz;
          res.toneOk = true;
        }
      }

      // 3-criteria pass
      res.pass = res.energyAboveFloorMs >= 3000 && res.toneOk && res.perTrackBytesDelta > 0;
    }

    // Tone-based self-exclusion (fallback for when myClientId was null and couldn't filter earlier).
    // Any publisher attributed to ownToneHz is the receiver's own SFU echo — remove it from results.
    // This is deterministic: each client publishes a unique tone, so no real remote peer shares it.
    const measuredResults = ownToneHz != null
      ? results.filter(r => r.attributedToneHz !== ownToneHz)
      : results;

    // Matrix validation: exact tones, no duplicates, all expected tones present
    const attributed = measuredResults.map(r => r.attributedToneHz).filter(hz => hz !== null).sort((a, b) => a - b);
    const expectedSorted = [...expectedRemoteTones].sort((a, b) => a - b);
    const hasDupes = new Set(attributed).size !== attributed.length;
    const setMatches = JSON.stringify(attributed) === JSON.stringify(expectedSorted);
    const allPass = measuredResults.every(r => r.pass);
    const matrixOk = !hasDupes && setMatches && allPass;
    const matrixError = hasDupes
      ? `duplicate attributed tones: [${attributed}]`
      : !setMatches
        ? `tone-set mismatch: expected [${expectedSorted}], attributed [${attributed}]`
        : !allPass
          ? `not-all-pass: ${measuredResults.map(r => `${r.attributedToneHz}:${r.pass}`).join(',')}`
          : null;

    // Close AudioContexts after all result computation (keeps the page context live through attribution).
    for (const ctx of contexts) { try { await ctx.close(); } catch {} }
    return { publishers: measuredResults, matrixOk, matrixError, validatedExpectedTones: expectedSorted };
  }, { duration, expectedRemoteTones, ownToneHz });
}

// ── Join flow helpers ─────────────────────────────────────────────────────────

async function loginAsOwner(page) {
  await page.goto('http://localhost:4700/login').catch(() => {});
  await page.locator('input[type="email"], #login-email').fill(LOGIN_EMAIL).catch(() => {});
  await page.locator('input[type="password"], #login-password').fill(LOGIN_PW).catch(() => {});
  await page.getByRole('button', { name: /Sign in|Log in/i }).click().catch(() => {});
  await page.waitForTimeout(1200);
}

async function handlePreflight(page) {
  // Open device dialog only if it's currently closed (avoid toggling it shut)
  const openBtn = page.getByRole('button', { name: /Test \/ configure devices/i });
  if (await openBtn.count() > 0 && await openBtn.first().isVisible().catch(() => false)) {
    await openBtn.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  // Speaker test is optional (R10) — skip it, go straight to confirm
  // Wait for confirm button to be enabled (micWorking=true with fake audio, ~1-2s)
  const confirmBtn = page.getByRole('button', { name: /Confirm — everything works|Check mic and speaker/i });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await confirmBtn.count() > 0) {
      const enabled = await confirmBtn.first().isEnabled().catch(() => false);
      if (enabled) { await confirmBtn.first().click().catch(() => {}); break; }
    }
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(300);
}

async function joinRoom(page, roomUrl, displayName, role) {
  await page.goto(roomUrl).catch(() => {});
  await page.waitForTimeout(600);

  // Guest name overlay (public URL may show it)
  if (role === 'guest') {
    const guestNameInput = page.locator('#guest-display-name');
    if (await guestNameInput.count() > 0 && await guestNameInput.isVisible().catch(() => false)) {
      await guestNameInput.fill(displayName);
      await page.getByRole('button', { name: 'Continue' }).click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  await handlePreflight(page);

  // Fill display name in lobby
  const nameInput = page.locator('#display-name');
  if (await nameInput.count() > 0) await nameInput.fill(displayName).catch(() => {});

  // Click the appropriate join button
  if (role === 'host') {
    await page.getByRole('button', { name: 'Join' }).click().catch(() => {});
  } else {
    // "Ask to join" for guests; AGENTROOM has auto_admit=1 so server auto-admits
    const joinBtn = page.getByRole('button', { name: /Ask to join/i });
    const fallback = page.getByRole('button', { name: /Join/i });
    if (await joinBtn.count() > 0) {
      await joinBtn.first().click().catch(() => {});
    } else {
      await fallback.first().click().catch(() => {});
    }
  }
  await page.waitForTimeout(1200);
}

async function waitForInCall(page, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await page.evaluate(() => {
      const d = window.__meetDebug || {};
      return (d.wsStatus === 'connected' || d.wsConnected === true) && !!(d.myClientId || d.clientId);
    }).catch(() => false);
    if (ok) return;
    await page.waitForTimeout(500);
  }
  console.warn(`[${label}] waitForInCall: timeout after ${timeoutMs}ms — continuing anyway`);
}

// ── Main exported function ────────────────────────────────────────────────────

const ALL_TONE_SET = [440, 660, 940, 1100];

/**
 * @param {object} opts
 * @param {string} opts.name               Display name shown in the call (e.g. 'local1')
 * @param {string} opts.toneWavPath        Absolute path to the fake audio WAV file
 * @param {number} opts.toneHz             The tone Hz this client publishes (for log labels)
 * @param {'host'|'guest'} opts.role       'host' does login+direct join; 'guest' does knock+auto-admit
 * @param {number} [opts.expectedPeers=1]  Gate#2 threshold: wait for N remote publishers before measuring
 * @param {number[]} [opts.expectedRemoteTones]  Exact tones expected from remote publishers.
 *   If omitted, derived as ALL_TONE_SET minus own toneHz (correct for 4-way; override for smaller N-ways).
 */
export async function runMeasuringClient({ name, toneWavPath, toneHz, role = 'guest', expectedPeers = 1, expectedRemoteTones }) {
  // Derive expected remote tones if not provided: all tones except own, in TONE_SET order
  const remTones = expectedRemoteTones ?? ALL_TONE_SET.filter(hz => hz !== toneHz);
  // Robust AGENTROOM load (supports local runs + remote Peer2 delivery where cwd/paths differ)
  let agentJsonPath = process.env.AGENTROOM_PATH || path.join(REPO_ROOT, 'AGENTROOM.json');
  if (!fs.existsSync(agentJsonPath)) {
    const candidates = [
      path.join(process.cwd(), 'AGENTROOM.json'),
      '/home/creepy/Documents/Workspace/AGENTROOM.json',
      path.join(REPO_ROOT, 'AGENTROOM.json'),
      '/tmp/AGENTROOM.json',
      path.join(__dirname, '..', '..', 'AGENTROOM.json'),
    ];
    for (const c of candidates) { if (fs.existsSync(c)) { agentJsonPath = c; break; } }
  }
  const AGENT = JSON.parse(fs.readFileSync(agentJsonPath, 'utf8'));
  const ROOM_ID = AGENT.id;
  const LOCAL_URL = `http://localhost:4700/room/${ROOM_ID}`;
  const PUBLIC_URL = AGENT.publicUrl || `https://voice.silverjrom.app/room/${ROOM_ID}`;
  const LABEL = name.toUpperCase();

  console.log(`[${LABEL}] starting — tone=${toneHz}Hz role=${role} room=${ROOM_ID} expectedPeers=${expectedPeers}`);

  if (!fs.existsSync(toneWavPath)) {
    console.error(`[${LABEL}] FATAL: tone WAV not found: ${toneWavPath}`);
    process.exit(1);
  }

  const launchArgs = [...ANTI_THROTTLE_FLAGS, `--use-file-for-fake-audio-capture=${toneWavPath}`];
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const page = await context.newPage();

  // Login (host only)
  if (role === 'host') {
    await loginAsOwner(page);
    console.log(`[${LABEL}] login done`);
  }

  // Join room
  const roomUrl = role === 'host' ? LOCAL_URL : PUBLIC_URL;
  await joinRoom(page, roomUrl, name, role);

  // Wait for signaling WS + myClientId
  await waitForInCall(page, LABEL, 40_000);
  console.log(`[${LABEL}] IN-CALL room=${ROOM_ID} url=${roomUrl}`);

  // Main loop
  let t = 0;
  while (true) {
    t++;
    try {
      // Count currently active remote publishers (live tracks + inbound bytes evidence)
      const remotePeers = await page.evaluate(async () => {
        const d = window.__meetDebug;
        const streams = d?.sfuRemoteStreams;
        if (!streams || streams.size === 0) return 0;
        let stats = null;
        try { if (d?.sfuGetStats) stats = await d.sfuGetStats(); } catch {}
        const byTrack = {};
        if (stats) {
          const idMap = {};
          stats.forEach(s => { idMap[s.id] = s; });
          stats.forEach(s => {
            if (s.type === 'inbound-rtp' && s.kind === 'audio') {
              let tid = s.trackIdentifier;
              if (!tid && s.trackId) tid = idMap[s.trackId]?.trackIdentifier;
              if (tid) byTrack[tid] = Math.max(byTrack[tid]||0 , s.bytesReceived||0);
            }
          });
        }
        let act = 0;
        for (const [cid, st] of streams) {
          const t = st && st.getAudioTracks && st.getAudioTracks()[0];
          if (t && t.readyState === 'live') {
            const tid = t.id;
            if (Object.keys(byTrack).length === 0 || (byTrack[tid]||0) > 0) act++;
          }
        }
        return act;
      }).catch(() => 0);

      if (remotePeers >= expectedPeers) {
        try {
          // Gate#1 — own outbound rising (short timeout if already publishing)
          await waitForOutboundReady(page, LABEL, 20_000);
          // Gate#2 — N remote inbound tracks live + bytes flowing
          await waitForInboundReady(page, LABEL, expectedPeers, 25_000);
          // STRICT BARRIER: confirm CURRENT tracks (live + actual bytes >0 for exactly the peers) before START
          const barrierOk = await waitForBarrierCurrentTracksAndBytes(page, LABEL, expectedPeers);
          if (!barrierOk) {
            console.log(`[${LABEL}-BARRIER-FAIL] did not achieve 10s stable with >0 bytes for all peers (incl agent); will not emit START or measure this cycle`);
            await page.waitForTimeout(1000);
            continue;
          }
          // Coordinated 4-way: wait for START_MEASURE_AT (set by host/orchestrator after all subscribed)
          await waitForStartMeasureMarker(page, 120_000);
          // Measure all remote publishers simultaneously (20s for final clean matrix)
          const result = await measureAllRemotePublishers(page, remTones, 20_000, toneHz);
          if (result.publishers && result.publishers.length > 0) {
            for (const pub of result.publishers) {
              console.log(`[${LABEL}-MEASURES]`, JSON.stringify(pub));
            }
            // Write MEAS-ALL to file FIRST (persist to disk before any stdout buffering risk),
            // then echo to stdout. Both carry an ISO timestamp so log rows are traceable.
            const measTs = new Date().toISOString();
            const measPayload = JSON.stringify({count: result.publishers.length, expectedTones: result.validatedExpectedTones ?? remTones, matrixOk: result.matrixOk, matrixError: result.matrixError ?? null, publishers: result.publishers.map(p => ({ clientId: p.clientId, tone: p.attributedToneHz, pass: p.pass, bytesDelta: p.perTrackBytesDelta })) });
            const measLine = `[${measTs} ${LABEL}-MEAS-ALL] ${measPayload}\n`;
            // guarantee the bar-*.log gets the MEAS even if pm2 redirect issue
            // also guarantee /tmp/bar-l1.log and /tmp/bar-l2.log for the receiver artifacts
            try {
              const mainLog = `/tmp/bar-${LABEL.toLowerCase()}.log`;
              fs.writeFileSync(mainLog, measLine, { flag: 'a' });
              // short aliases for exact artifacts required by harness
              if (LABEL.toLowerCase() === 'local1') {
                fs.writeFileSync('/tmp/bar-l1.log', measLine, { flag: 'a' });
              }
              if (LABEL.toLowerCase() === 'local2') {
                fs.writeFileSync('/tmp/bar-l2.log', measLine, { flag: 'a' });
              }
              // verify non-empty for locals short logs
              try {
                const l1s = fs.statSync('/tmp/bar-l1.log').size; if (l1s > 0) console.log(`[${LABEL}] ARTIFACT-VERIFY /tmp/bar-l1.log size=${l1s}`);
              } catch {}
              try {
                const l2s = fs.statSync('/tmp/bar-l2.log').size; if (l2s > 0) console.log(`[${LABEL}] ARTIFACT-VERIFY /tmp/bar-l2.log size=${l2s}`);
              } catch {}
              // verify main log too
              try {
                const ms = fs.statSync(mainLog).size; console.log(`[${LABEL}] ARTIFACT-VERIFY ${mainLog} size=${ms}`);
              } catch {}
            } catch (e) {}
            // Echo to stdout AFTER the file write (file is the durable record; stdout can be lost on crash)
            process.stdout.write(measLine);
            // for AGENT, guarantee non-empty /tmp/bar-agent.json with perTonePublisherResults
            if (LABEL.toUpperCase() === 'AGENT') {
              try {
                const agentData = {
                  ts: Date.now(),
                  perTonePublisherResults: result.publishers.map(p => ({
                    clientId: p.clientId,
                    attributedToneHz: p.attributedToneHz,
                    bytesDelta: p.perTrackBytesDelta,
                    energyAboveFloorMs: p.energyAboveFloorMs,
                    pass: p.pass
                  })),
                  matrixOk: result.matrixOk,
                  matrixError: result.matrixError
                };
                fs.writeFileSync('/tmp/bar-agent.json', JSON.stringify(agentData, null, 2));
                console.log('[AGENT] wrote /tmp/bar-agent.json');
                // verify non-empty before any claim of captured run
                try {
                  const st = fs.statSync('/tmp/bar-agent.json');
                  console.log(`[AGENT] ARTIFACT-VERIFY /tmp/bar-agent.json size=${st.size}`);
                  if (st.size === 0) console.error('[AGENT] FATAL: bar-agent.json is empty');
                } catch (se) { console.log('[AGENT] stat bar-agent.json failed', String(se).slice(0,60)); }
              } catch (e) { console.log('[AGENT] err write bar-agent.json', String(e).slice(0,80)); }
            }
          } else if (result.error) {
            console.log(`[${LABEL}-MEAS-ERR] ${result.error} matrixError=${result.matrixError ?? ''}`);
          }
        } catch (gateErr) {
          console.log(`[${LABEL}-GATE-ERR] ${String(gateErr).slice(0, 160)}`);
        }
      } else {
        if (t % 8 === 0) {
          console.log(`[${LABEL}] waiting for ${expectedPeers} peer(s), have ${remotePeers}`);
        }
      }

      // Anti-throttle keepalive: mic toggle every 5 ticks
      if (t % 5 === 0) {
        const m = page.getByRole('button', { name: /mic|mute/i });
        if (await m.count() > 0) {
          await m.first().click().catch(() => {});
          await page.waitForTimeout(100);
          await m.first().click().catch(() => {});
        }
      }

      // Periodic diag
      if (t % 10 === 0) {
        const diag = await page.evaluate(async () => {
          const d = window.__meetDebug || {};
          let ob = 0;
          try {
            const st = typeof d.sfuGetStats === 'function' ? await d.sfuGetStats() : null;
            st?.forEach(s => { if (s.type === 'outbound-rtp' && s.kind === 'audio') ob = Math.max(ob, s.bytesSent || 0); });
          } catch {}
          return { ws: d.wsStatus, peers: d.sfuRemoteStreams?.size ?? 0, myId: d.myClientId, outboundBytes: ob };
        }).catch(() => null);
        if (diag) console.log(`[${LABEL}-DIAG] tick=${t}`, JSON.stringify(diag));
      }
    } catch (loopErr) {
      console.log(`[${LABEL}] loop err: ${String(loopErr).slice(0, 80)}`);
    }

    await page.waitForTimeout(1400).catch(() => {});
  }
}
