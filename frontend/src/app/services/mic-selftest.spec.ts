import assert from 'node:assert/strict';
import {
  accumulateEnergyFrame,
  audioCaptureConstraints,
  classifyMicCapture,
  nextMicWarningState,
  ENERGY_DELTA_EPSILON,
  MIC_SILENCE_LEVEL_THRESHOLD,
  type EnergySample,
} from './mic-energy.js';

// ===========================================================================
// B5 — pre-call lobby self-test fidelity (R8). The lobby self-test must produce
// the SAME verdict the call would (reusing the EXACT in-call classifyMicCapture +
// 0.01 threshold + nextMicWarningState reducer), fed off a SUSTAINED cumulative-
// energy window built by the new pure accumulateEnergyFrame. These deterministic
// cases carry the proof per NS5 (a fake-media "silent" Playwright test is
// impossible — Chrome tones every fake input).
// ===========================================================================

// U-1 — accumulator: silent frames ⇒ FLAT cumulative energy (delta < epsilon; level 0)
{
  let s: EnergySample = { totalAudioEnergy: 0, audioLevel: 0 };
  const window: EnergySample[] = [];
  for (let i = 0; i < 5; i += 1) {
    s = accumulateEnergyFrame(s.totalAudioEnergy as number, 0);
    window.push(s);
    assert.strictEqual(s.totalAudioEnergy, 0, 'silent frame keeps cumulative at 0');
    assert.strictEqual(s.audioLevel, 0, 'silent frame audioLevel is 0 (raw RMS)');
  }
  const delta = (window[window.length - 1].totalAudioEnergy as number) - (window[0].totalAudioEnergy as number);
  assert.strictEqual(delta, 0, 'flat cumulative: last-first delta is 0');
  assert.ok(delta < ENERGY_DELTA_EPSILON, 'delta < ENERGY_DELTA_EPSILON (what classifyMicCapture keys off)');

  // Edge: a single tiny float-noise frame still accumulates flat (< epsilon).
  const noisy = accumulateEnergyFrame(0, 1e-12);
  assert.ok((noisy.totalAudioEnergy as number) < ENERGY_DELTA_EPSILON, 'float-noise frame stays below epsilon');

  // Guard: negative/NaN mean-square is treated as 0 (no NaN propagation).
  assert.strictEqual(accumulateEnergyFrame(5, -3).totalAudioEnergy, 5, 'negative frame treated as 0');
  assert.strictEqual(accumulateEnergyFrame(5, NaN).audioLevel, 0, 'NaN frame audioLevel is 0');
}

// U-2 — accumulator: quiet-but-working frames ⇒ STRICTLY INCREASING cumulative energy
{
  let s: EnergySample = { totalAudioEnergy: 0, audioLevel: 0 };
  const window: EnergySample[] = [];
  for (let i = 0; i < 5; i += 1) {
    s = accumulateEnergyFrame(s.totalAudioEnergy as number, 4e-6);
    window.push(s);
  }
  for (let i = 1; i < window.length; i += 1) {
    assert.ok(
      (window[i].totalAudioEnergy as number) > (window[i - 1].totalAudioEnergy as number),
      'cumulative strictly increases each frame',
    );
  }
  const delta = (window[window.length - 1].totalAudioEnergy as number) - (window[0].totalAudioEnergy as number);
  assert.ok(delta >= ENERGY_DELTA_EPSILON, 'quiet-but-working delta ≥ 1e-7 (rising energy)');
  // Raw RMS ≈ 2e-3, deliberately BELOW the 0.01 level threshold (the U-8 quiet mic).
  for (const f of window) {
    assert.ok(Math.abs((f.audioLevel as number) - 2e-3) < 1e-9, 'audioLevel ≈ 2e-3 (raw RMS of 4e-6)');
    assert.ok((f.audioLevel as number) < MIC_SILENCE_LEVEL_THRESHOLD, 'level is sub-0.01 (quiet)');
  }
  // Edge: one zero frame between positive frames still nets a positive delta.
  const a = accumulateEnergyFrame(0, 4e-6);
  const b = accumulateEnergyFrame(a.totalAudioEnergy as number, 0);
  const c = accumulateEnergyFrame(b.totalAudioEnergy as number, 4e-6);
  assert.ok((c.totalAudioEnergy as number) - 0 >= ENERGY_DELTA_EPSILON, 'a brief pause is not silence');
}

// U-3 — lobby SILENT window ⇒ flag (false-pass kill); SAME 0.01 threshold as in-call
{
  // Flat cumulative + all levels < 0.01 = the dead-mic shape the old instantaneous
  // meter could not produce.
  const silentWindow: EnergySample[] = [
    { totalAudioEnergy: 5, audioLevel: 0.001 },
    { totalAudioEnergy: 5, audioLevel: 0.002 },
    { totalAudioEnergy: 5, audioLevel: 0.0 },
  ];
  assert.strictEqual(classifyMicCapture(silentWindow), 'silent', 'flat energy + sub-0.01 level -> silent');
  assert.strictEqual(nextMicWarningState(false, 'silent', true), true, 'silent + active -> flag raised');

  // Threshold boundary == in-call: SAME flat energy but one level above 0.01 ⇒ NOT silent.
  const aboveThreshold: EnergySample[] = [
    { totalAudioEnergy: 5, audioLevel: 0.001 },
    { totalAudioEnergy: 5, audioLevel: 0.02 },
    { totalAudioEnergy: 5, audioLevel: 0.0 },
  ];
  assert.strictEqual(classifyMicCapture(aboveThreshold), 'working', 'flat energy + one above-0.01 level -> working');
}

// U-4 — lobby RISING window ⇒ NO flag (U-8 preserved) + clear-on-fix
{
  const risingWindow: EnergySample[] = [
    { totalAudioEnergy: 1, audioLevel: 0.001 },
    { totalAudioEnergy: 1.0001, audioLevel: 0.002 },
    { totalAudioEnergy: 1.0003, audioLevel: 0.001 },
  ];
  assert.strictEqual(classifyMicCapture(risingWindow), 'working', 'rising energy + sub-0.01 level -> working');
  assert.strictEqual(nextMicWarningState(false, 'working', true), false, 'working -> no flag');
  // clear-on-fix: a shown flag auto-clears when energy returns (user picked a working device).
  assert.strictEqual(nextMicWarningState(true, 'working', true), false, 'shown flag clears on working window');
}

// U-5 — micActive=false (mic off / muted in lobby) ⇒ NO flag
{
  assert.strictEqual(nextMicWarningState(false, 'silent', false), false, 'silent window while mic OFF -> no flag');
  assert.strictEqual(nextMicWarningState(true, 'silent', false), false, 'mic toggled OFF clears a shown flag');
}

// U-6 — thin window (<2 usable energy samples) ⇒ indeterminate ⇒ HOLD (anti-flicker, AC6)
{
  assert.strictEqual(classifyMicCapture([{ totalAudioEnergy: 0, audioLevel: 0 }]), 'indeterminate', 'single sample -> indeterminate');
  assert.strictEqual(
    classifyMicCapture([
      { totalAudioEnergy: null, audioLevel: null },
      { totalAudioEnergy: null, audioLevel: 0.0 },
    ]),
    'indeterminate',
    '0 usable energies -> indeterminate',
  );
  assert.strictEqual(nextMicWarningState(false, 'indeterminate', true), false, 'thin window -> no premature flag');
  assert.strictEqual(nextMicWarningState(true, 'indeterminate', true), true, 'thin window does not erase a real prior flag');
}

// U-8 — constraint parity: lobby self-test constraints DEEP-EQUAL the call-path
// constraints for the same deviceId (AC1 regression guard). ONE builder, no shadow copy.
{
  assert.deepStrictEqual(
    audioCaptureConstraints(true, 'dev-x'),
    {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
      deviceId: { exact: 'dev-x' },
    },
    'lobby constraints deep-equal the call-path object',
  );
  // No device chosen ⇒ NO deviceId key (never {exact:''}).
  const noDevice = audioCaptureConstraints(true) as MediaTrackConstraints;
  assert.deepStrictEqual(
    noDevice,
    { echoCancellation: { ideal: true }, noiseSuppression: { ideal: true }, autoGainControl: { ideal: true } },
    'no-device -> EC/NS/AGC only, no deviceId key',
  );
  assert.strictEqual('deviceId' in noDevice, false, 'no deviceId key when none chosen');
  // Empty-string id ⇒ still no deviceId key (the || undefined guard upstream; builder skips empties).
  assert.strictEqual('deviceId' in (audioCaptureConstraints(true, '') as MediaTrackConstraints), false, 'never {exact:""}');
}

console.log('mic-selftest: all assertions passed');
