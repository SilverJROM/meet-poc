import assert from 'node:assert/strict';
import {
  classifySenderLiveness,
  SENDER_PACKET_DELTA_EPSILON,
  ENERGY_DELTA_EPSILON,
  type OutboundLivenessStats,
} from './mic-energy.js';

// Standalone file (NOT appended to mic-capture-health.spec.ts): that shared
// spec file aborts partway through on a pre-existing stale assertion (since
// `856104f`, flagged by the B08A-1 validator, unrelated to this batch) so
// anything appended to it never actually executes. Run directly:
//   npx tsx src/app/services/sender-liveness.spec.ts

function sample(totalAudioEnergy: number | null, packetsSent: number | null): OutboundLivenessStats {
  return { totalAudioEnergy, totalSamplesDuration: null, packetsSent, bytesSent: null };
}

// U-1 — both advancing (energy climbs, packets climb) -> 'both-advancing'
{
  const window = [sample(0.01, 25), sample(0.05, 35), sample(0.09, 45), sample(0.14, 55)];
  assert.strictEqual(classifySenderLiveness(window), 'both-advancing', 'energy+packets both rising');
}

// U-2 — sender-dead (energy climbs, packets flat) -> 'sender-dead'
// Mirrors the measured setParameters({encodings:[{active:false}]}) signature.
{
  const window = [sample(0.029, 65), sample(0.031, 65), sample(0.033, 65), sample(0.034, 65)];
  assert.strictEqual(classifySenderLiveness(window), 'sender-dead', 'energy rising + packets frozen');
}

// U-3 — capture-dead (energy flat, packets climb) -> 'capture-dead'
// Mirrors the measured literal-silence (no DTX on this stack) signature.
{
  const window = [sample(0, 25), sample(0, 35), sample(0, 45), sample(0, 55)];
  assert.strictEqual(classifySenderLiveness(window), 'capture-dead', 'energy frozen + packets rising');
}

// U-4 — both flat -> 'indeterminate' (genuinely ambiguous, never a single-sided claim)
{
  const window = [sample(5.0, 100), sample(5.0, 100), sample(5.0, 100), sample(5.0, 100)];
  assert.strictEqual(classifySenderLiveness(window), 'indeterminate', 'both frozen -> indeterminate');
}

// U-5 — insufficient samples (< 2 usable for either metric) -> 'indeterminate'
{
  assert.strictEqual(classifySenderLiveness([sample(0.1, 10)]), 'indeterminate', 'single sample');
  assert.strictEqual(classifySenderLiveness([]), 'indeterminate', 'empty window');
  const allNullEnergy = [sample(null, 10), sample(null, 20), sample(null, 30)];
  assert.strictEqual(classifySenderLiveness(allNullEnergy), 'indeterminate', 'all-null energy');
  const allNullPackets = [sample(0.1, null), sample(0.2, null), sample(0.3, null)];
  assert.strictEqual(classifySenderLiveness(allNullPackets), 'indeterminate', 'all-null packets');
}

// U-6 — mixed null-then-numeric window still resolves off the usable readings
{
  const window = [sample(null, null), sample(0.01, 25), sample(0.05, 35), sample(0.09, 45)];
  assert.strictEqual(classifySenderLiveness(window), 'both-advancing', 'leading null sample is filtered, not fatal');
}

// U-7 — epsilon boundary: sub-epsilon energy drift is noise, not advancing
{
  const subEpsilonDelta = ENERGY_DELTA_EPSILON / 2;
  const window = [sample(1.0, 25), sample(1.0 + subEpsilonDelta, 45)];
  assert.strictEqual(classifySenderLiveness(window), 'capture-dead', 'sub-epsilon energy delta treated as flat');
}

// U-8 — epsilon boundary: exactly-at-epsilon packet delta counts as advancing
{
  const window = [sample(1.0, 10), sample(2.0, 10 + SENDER_PACKET_DELTA_EPSILON)];
  assert.strictEqual(classifySenderLiveness(window), 'both-advancing', 'exactly-epsilon packet delta advances');
}

// U-9 — custom epsilon opts are honored
{
  const window = [sample(1.0, 10), sample(1.05, 20)];
  assert.strictEqual(
    classifySenderLiveness(window, { energyDeltaEpsilon: 0.1 }),
    'capture-dead',
    'a looser custom energy epsilon reclassifies a small rise as flat',
  );
}

console.log('sender-liveness: all assertions passed');
