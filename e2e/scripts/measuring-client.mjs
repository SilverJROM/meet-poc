#!/usr/bin/env node
/**
 * measuring-client.mjs — reusable parameterized measuring client.
 *
 * Usage (matrix runner spawns N of these):
 *   node measuring-client.mjs --name local1 --tone tone-940.wav [--expected-peers 2]
 *   node measuring-client.mjs --name local2 --tone tone-1100.wav --expected-peers 2
 *
 * --name            Display name in the call (also used in log labels)
 * --tone            WAV basename (resolved from e2e/fixtures/audio/) OR absolute path
 * --expected-peers  Gate#2 threshold — wait for N remote publishers before measuring (default 1)
 * --host            Join as owner (does login); default is guest (auto-admitted on AGENTROOM)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMeasuringClient } from './lib/measuring-client-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.resolve(__dirname, '../fixtures/audio');

function parseArgs(argv) {
  const args = { name: 'client', tone: 'tone-440.wav', expectedPeers: 1, role: 'guest', expectedRemoteTones: null };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--name':                  args.name = argv[++i]; break;
      case '--tone':                  args.tone = argv[++i]; break;
      case '--expected-peers':        args.expectedPeers = parseInt(argv[++i], 10); break;
      case '--expected-remote-tones': args.expectedRemoteTones = argv[++i].split(',').map(Number); break;
      case '--host':                  args.role = 'host'; break;
    }
  }
  return args;
}

const { name, tone, expectedPeers, role, expectedRemoteTones } = parseArgs(process.argv.slice(2));

// Resolve tone to an absolute WAV path
const toneWavPath = path.isAbsolute(tone) ? tone : path.join(AUDIO_DIR, tone);

// Infer toneHz from the filename for log labels (e.g. tone-940.wav → 940)
const toneHz = parseInt(path.basename(tone).replace(/[^0-9]/g, '') || '0', 10) || 0;

runMeasuringClient({ name, toneWavPath, toneHz, role, expectedPeers, expectedRemoteTones: expectedRemoteTones ?? undefined })
  .catch(e => { console.error('FATAL', e); process.exit(1); });
