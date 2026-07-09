import { describe, it, expect } from 'vitest';
import { computeStimulusVerification, verifyStimulus, withinTolerance, DEFAULT_TOLERANCE_FRACTION } from '../gum-shim.js';
import { RecordingArbiter, type RecordingAnalysis } from '../recording-arbiter.js';

describe('withinTolerance', () => {
  it('is true for an exact match', () => {
    expect(withinTolerance(0.5, 0.5)).toBe(true);
  });

  it('is true at exactly the +/-20% boundary', () => {
    expect(withinTolerance(0.5, 0.6, DEFAULT_TOLERANCE_FRACTION)).toBe(true); // +20%
    expect(withinTolerance(0.5, 0.4, DEFAULT_TOLERANCE_FRACTION)).toBe(true); // -20%
  });

  it('is false just outside the +/-20% boundary', () => {
    expect(withinTolerance(0.5, 0.61, DEFAULT_TOLERANCE_FRACTION)).toBe(false);
    expect(withinTolerance(0.5, 0.39, DEFAULT_TOLERANCE_FRACTION)).toBe(false);
  });

  it('treats intended=0 as requiring an exact zero measurement', () => {
    expect(withinTolerance(0, 0)).toBe(true);
    expect(withinTolerance(0, 0.01)).toBe(false);
  });
});

describe('computeStimulusVerification', () => {
  it('derives measuredGain as attenuated/baseline and flags tolerance', () => {
    const v = computeStimulusVerification(0.5, 1.0, 0.5);
    expect(v.intendedGain).toBe(0.5);
    expect(v.measuredGain).toBe(0.5);
    expect(v.withinTolerance).toBe(true);
  });

  it('flags an out-of-tolerance measured gain (AGC clawback signature)', () => {
    // If AGC re-normalized the attenuated signal back toward baseline, measuredGain
    // would land much closer to 1.0 than the intended 0.5 ratio.
    const v = computeStimulusVerification(0.5, 1.0, 0.95);
    expect(v.withinTolerance).toBe(false);
  });

  it('reports measuredGain=0 when baseline is zero (guarded, no NaN/Infinity)', () => {
    const v = computeStimulusVerification(0.5, 0, 0.3);
    expect(v.measuredGain).toBe(0);
    expect(Number.isFinite(v.measuredGain)).toBe(true);
  });
});

describe('verifyStimulus + RecordingArbiter.determineVerdict — D19 INVALID != PASS', () => {
  const arbiter = new RecordingArbiter();
  const analysis: RecordingAnalysis = {
    recordingPath: 'stub.wav',
    voicedSegments: [],
    overallLoudness: { rms: 0.1, lufs: -30 },
  };

  it('r=0.50 within tolerance verifies and the arbiter returns PASS', () => {
    const verification = verifyStimulus(0.5, 1.0, 0.5);
    expect(verification).toBeDefined();
    const verdict = arbiter.determineVerdict(analysis, verification);
    expect(verdict.verdict).toBe('PASS');
  });

  it('invalid control: missing baseline (reference never captured) cannot be verified -> INVALID, not a false PASS', () => {
    const verification = verifyStimulus(0.5, null, 0.3);
    expect(verification).toBeUndefined();
    const verdict = arbiter.determineVerdict(analysis, verification);
    expect(verdict.verdict).toBe('INVALID');
  });

  it('invalid control: zero baseline (degenerate reference) cannot be verified -> INVALID', () => {
    const verification = verifyStimulus(0.5, 0, 0.3);
    expect(verification).toBeUndefined();
    const verdict = arbiter.determineVerdict(analysis, verification);
    expect(verdict.verdict).toBe('INVALID');
  });

  it('out-of-tolerance measurement is FAIL, distinct from INVALID', () => {
    const verification = verifyStimulus(0.5, 1.0, 0.95);
    expect(verification).toBeDefined();
    const verdict = arbiter.determineVerdict(analysis, verification);
    expect(verdict.verdict).toBe('FAIL');
  });

  it('dead mic: noise-floor baseline below MIN_BASELINE returns INVALID not false PASS', () => {
    // Dead mic case: noise floor only (0.005) attenuated to (0.0025)
    // measuredGain would be 0.5 (within tolerance), but baseline is too quiet
    const verification = verifyStimulus(0.5, 0.005, 0.0025);
    expect(verification).toBeUndefined();
    const verdict = arbiter.determineVerdict(analysis, verification);
    expect(verdict.verdict).toBe('INVALID');
  });
});
