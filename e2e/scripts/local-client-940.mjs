#!/usr/bin/env node
/**
 * local-client-940.mjs — LOCAL1 measuring client (940Hz tone).
 *
 * Thin entry point for the 3-way / 4-way matrix.
 * Joins AGENTROOM as guest 'local1', publishes 940Hz tone.
 * Waits for 2 remote publishers (host + agent) before measuring.
 * Logs [LOCAL1-MEASURES] per publisher with 3-criteria attribution.
 *
 * For the full parameterized CLI:
 *   node measuring-client.mjs --name local1 --tone tone-940.wav --expected-peers 2
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMeasuringClient } from './lib/measuring-client-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TONE_WAV = path.resolve(__dirname, '../fixtures/audio/tone-940.wav');

runMeasuringClient({
  name: 'local1',
  toneWavPath: TONE_WAV,
  toneHz: 940,
  role: 'guest',
  expectedPeers: 3,            // 4-way: wait for host (440) + agent (660) + local2 (1100)
  expectedRemoteTones: [440, 660, 1100],  // exact set — reject if count/dupes differ
}).catch(e => { console.error('fatal local1', e); process.exit(1); });
