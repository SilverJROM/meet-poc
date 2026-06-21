#!/usr/bin/env node
/**
 * local-client-1100.mjs — LOCAL2 measuring client (1100Hz tone).
 *
 * Thin entry point for the 4-way matrix.
 * Joins AGENTROOM as guest 'local2', publishes 1100Hz tone.
 * Waits for 3 remote publishers (host + agent + local1) before measuring.
 * Logs [LOCAL2-MEASURES] per publisher with 3-criteria attribution.
 *
 * For the full parameterized CLI:
 *   node measuring-client.mjs --name local2 --tone tone-1100.wav --expected-peers 3
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMeasuringClient } from './lib/measuring-client-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TONE_WAV = path.resolve(__dirname, '../fixtures/audio/tone-1100.wav');

runMeasuringClient({
  name: 'local2',
  toneWavPath: TONE_WAV,
  toneHz: 1100,
  role: 'guest',
  expectedPeers: 3,            // 4-way: wait for host (440) + agent (660) + local1 (940)
  expectedRemoteTones: [440, 660, 940],   // exact set — reject if count/dupes differ
}).catch(e => { console.error('fatal local2', e); process.exit(1); });
