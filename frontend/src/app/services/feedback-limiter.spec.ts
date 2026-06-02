import assert from 'node:assert/strict';
import { FEEDBACK_LIMITER_PARAMS } from './remote-audio.service.js';

// B2 RF2-S4 — FEEDBACK_LIMITER_PARAMS are limiter-shaped (brick-wall) + no makeup gain.
{
  // Exact locked values.
  assert.strictEqual(FEEDBACK_LIMITER_PARAMS.threshold, -3, 'threshold -3 dB');
  assert.strictEqual(FEEDBACK_LIMITER_PARAMS.knee, 0, 'knee 0 (hard knee)');
  assert.strictEqual(FEEDBACK_LIMITER_PARAMS.ratio, 20, 'ratio 20:1');
  assert.strictEqual(FEEDBACK_LIMITER_PARAMS.attack, 0.003, 'attack 3 ms');
  assert.strictEqual(FEEDBACK_LIMITER_PARAMS.release, 0.25, 'release 250 ms');

  // Shape predicates — limiter-shaped, peak-control only.
  assert.ok(FEEDBACK_LIMITER_PARAMS.ratio >= 20, 'ratio >= 20 (limiter, not gentle compressor)');
  assert.ok(FEEDBACK_LIMITER_PARAMS.threshold <= 0, 'threshold <= 0 dB');
  assert.strictEqual(FEEDBACK_LIMITER_PARAMS.knee, 0, 'knee strictly 0');
  assert.ok(FEEDBACK_LIMITER_PARAMS.attack > 0, 'attack > 0');
  assert.ok(FEEDBACK_LIMITER_PARAMS.release > 0, 'release > 0');

  // No makeup-gain field ⇒ 0-in stays 0-out (mute-all silence guard, RF4-S9).
  assert.strictEqual('makeupGain' in FEEDBACK_LIMITER_PARAMS, false, 'no makeup gain field');
}

console.log('feedback-limiter: all assertions passed');
