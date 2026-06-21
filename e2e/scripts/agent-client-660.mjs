#!/usr/bin/env node
/**
 * agent-client-660.mjs — REMOTE AGENT (660Hz tone) measuring client for 4-way E2E harness.
 *
 * - Self-generates its 660Hz tone WAV (pure JS, no file transfer needed).
 * - Uses measuring-client-core for full:
 *     Gate#1 outbound, Gate#2 inbound, STRICT 10s stable BARRIER with perTrackBytesDelta>0
 *     for ALL 3 peers (host+local1+local2), then wait START_MEASURE_AT, then 20s measure.
 * - Logs explicit [AGENT-BARRIER-OK] size=3 peers=[{cid,trackId,bytesDelta}, ...] on every passing poll.
 * - On barrier stable: writes /tmp/bar-agent.ok (remote) + continues only on START.
 * - On measure: writes /tmp/bar-agent.json with perTonePublisherResults (clientId, tone, bytesDelta, energy, pass)
 *   and also appends to /tmp/bar-agent.log .
 * - Exits only on fatal; loops for re-run safety (host controls START).
 *
 * Delivery (via relay to Peer2-codex on creepy-mini):
 *   mkdir -p /home/creepy/Documents/Workspace/lib
 *   cat > /home/creepy/Documents/Workspace/lib/measuring-client-core.mjs << 'CORE_EOS'
 *   ... (paste full content of e2e/scripts/lib/measuring-client-core.mjs) ...
 *   CORE_EOS
 *   cat > /home/creepy/Documents/Workspace/agent-client-660.mjs << 'AGENT_EOS'
 *   ... (this file) ...
 *   AGENT_EOS
 *   chmod +x /home/creepy/Documents/Workspace/agent-client-660.mjs
 *
 * Run (in the harness sequence, after locals+host up, before host emits START):
 *   pkill -f 'agent-client-660|peer2-remote-join' || true; sleep 1
 *   setsid nohup env AGENTROOM_PATH=/home/creepy/Documents/Workspace/AGENTROOM.json \
 *     node /home/creepy/Documents/Workspace/agent-client-660.mjs \
 *     > /tmp/bar-agent.log 2>&1 &
 *
 * Harness must:
 * - Poll relay chat until seeing multiple [AGENT-BARRIER-OK] lines (with >0 bytesDelta for 3 peers)
 *   followed by [AGENT-BARRIER-STABLE].
 * - Then `touch /tmp/agent-barrier-passed` locally (unblocks host).
 * - After run: `cat /tmp/bar-agent.json` via relay, write the received JSON to local /tmp/bar-agent.json
 * - Verify all 4 artifacts non-empty (ls -l /tmp/bar-*.log /tmp/bar-agent.json) before declaring captured.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMeasuringClient } from './lib/measuring-client-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal mono 48kHz 16-bit PCM sine WAV generator (no external deps)
function generateToneWav(hz, durationSec, outPath) {
  const sampleRate = 48000;
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const val = Math.sin(2 * Math.PI * hz * t) * 0.92;
    const s = Math.max(-32767, Math.min(32767, (val * 32767) | 0));
    buf.writeInt16LE(s, off);
    off += 2;
  }
  fs.writeFileSync(outPath, buf);
  return outPath;
}

const TONE_HZ = 660;
const TONE_WAV = '/tmp/tone-660-agent.wav';

try {
  if (!fs.existsSync(TONE_WAV)) {
    generateToneWav(TONE_HZ, 120, TONE_WAV); // > full test duration
    console.log('[AGENT-CLIENT] generated tone WAV', TONE_WAV);
  }
} catch (genErr) {
  console.error('[AGENT-CLIENT] tone gen failed', String(genErr).slice(0, 120));
  process.exit(1);
}

console.log('[AGENT-CLIENT] starting 660Hz agent measuring client (barrier + 3-peer bytes >0 + 10s stable + json)');

runMeasuringClient({
  name: 'agent',
  toneWavPath: TONE_WAV,
  toneHz: TONE_HZ,
  role: 'guest',
  expectedPeers: 3,                    // host(440) + local1(940) + local2(1100)
  expectedRemoteTones: [440, 940, 1100],
}).catch(e => {
  console.error('fatal agent-client', e);
  process.exit(1);
});
