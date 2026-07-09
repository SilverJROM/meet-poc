import { describe, it, expect } from 'vitest';
import {
  buildInjectionTimeline,
  classifyHoldPhaseSignature,
  T_GAP_PROVISIONAL_MS,
  MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD,
  MIRRORED_LEVEL_VARIANCE_THRESHOLD,
} from '../capture-injection.js';

describe('buildInjectionTimeline', () => {
  it('defaults holdDurationMs to T_GAP_PROVISIONAL_MS (PROVISIONAL wiring only, D27)', () => {
    const timeline = buildInjectionTimeline('mode-a-frozen', 'https://example.test/speech.wav');
    expect(timeline.holdDurationMs).toBe(T_GAP_PROVISIONAL_MS);
    expect(timeline.mode).toBe('mode-a-frozen');
    expect(timeline.speechFixtureUrl).toBe('https://example.test/speech.wav');
  });

  it('accepts an explicit holdDurationMs override', () => {
    const timeline = buildInjectionTimeline('mode-b-silent', 'https://example.test/speech.wav', 900);
    expect(timeline.holdDurationMs).toBe(900);
    expect(timeline.mode).toBe('mode-b-silent');
  });
});

describe('classifyHoldPhaseSignature', () => {
  it('classifies a flat, above-threshold window as frozen-nonzero (the 856104f blind spot)', () => {
    // Mirrors the real session's outboundAudioLevel frozen at 0.228949858088931.
    const levels = [0.2289, 0.2289, 0.2289, 0.2289];
    expect(classifyHoldPhaseSignature(levels)).toBe('frozen-nonzero');
  });

  it('classifies a flat, below-threshold window as silent', () => {
    const levels = [0.0, 0.0001, 0.0, 0.00005];
    expect(classifyHoldPhaseSignature(levels)).toBe('silent');
  });

  it('classifies a genuinely varying window as neither', () => {
    const levels = [0.05, 0.3, 0.12, 0.4, 0.08];
    expect(classifyHoldPhaseSignature(levels)).toBe('neither');
  });

  it('is indeterminate (neither) with fewer than two usable readings', () => {
    expect(classifyHoldPhaseSignature([])).toBe('neither');
    expect(classifyHoldPhaseSignature([0.2])).toBe('neither');
  });

  it('sits exactly at the variance boundary as frozen-nonzero (< strictly, not <=)', () => {
    const justUnder = [0.2, 0.2 + (MIRRORED_LEVEL_VARIANCE_THRESHOLD - 0.0001)];
    expect(classifyHoldPhaseSignature(justUnder)).toBe('frozen-nonzero');

    const atOrOver = [0.2, 0.2 + MIRRORED_LEVEL_VARIANCE_THRESHOLD];
    expect(classifyHoldPhaseSignature(atOrOver)).toBe('neither');
  });

  it('sits exactly at the level threshold boundary as silent (< strictly, not <=)', () => {
    const justUnder = [MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD - 0.0001, MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD - 0.0001];
    expect(classifyHoldPhaseSignature(justUnder)).toBe('silent');

    const atThreshold = [MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD, MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD];
    expect(classifyHoldPhaseSignature(atThreshold)).toBe('frozen-nonzero');
  });

  it('honours custom threshold overrides', () => {
    const levels = [0.05, 0.052];
    expect(classifyHoldPhaseSignature(levels)).toBe('frozen-nonzero'); // default variance threshold 0.005 not tripped
    expect(classifyHoldPhaseSignature(levels, { varianceThreshold: 0.001 })).toBe('neither');
  });
});
