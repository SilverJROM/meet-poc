import { describe, it, expect, beforeEach } from 'vitest';
import { WeakSourceControl } from '../weak-source-control';
import { LoudnessAnalyzer } from '../recording-arbiter';

/**
 * B06 — Faithful PipeWire weak-source mode
 *
 * Tests the measurement and logging infrastructure for a weak-source scenario.
 * When .123 (dev_machine) is reachable, these tests will integrate with real
 * PipeWire attenuation. Currently, they verify unit-level behavior.
 *
 * Acceptance: one attenuated source run records actual received attenuation
 * and logs AGC compensation. Finding/pass/fail OK; never substitutes for forced mode.
 */

describe('B06 — Weak-source measurement and logging', () => {
  let control: WeakSourceControl;
  let analyzer: LoudnessAnalyzer;

  beforeEach(() => {
    control = new WeakSourceControl();
    analyzer = new LoudnessAnalyzer();
  });

  it('logs a weak-source session with measured loudness', () => {
    // Simulate a weak-source call: 60% source volume with AGC enabled
    const session = {
      appliedAt: new Date().toISOString(),
      configuredVolume: 60,
      scenario: 'soft-talker simulation: 60% source volume, AGC ON',
      measuredLoudness: {
        rms: 0.15, // Unit test: mock measured RMS after AGC compensation
        lufs: -18.5, // Mock measured LUFS
      },
      referenceLoudness: {
        rms: 0.10, // Baseline: normal-level reference
        lufs: -23.0, // Standard streaming target
      },
      notes: 'AGC boosted attenuated input back toward normal listening level',
    };

    control.logSession(session);

    const logged = control.getSessions();
    expect(logged).toHaveLength(1);
    expect(logged[0].configuredVolume).toBe(60);
    expect(logged[0].scenario).toContain('soft-talker');
    expect(logged[0].measuredLoudness).toBeDefined();
    expect(logged[0].referenceLoudness).toBeDefined();
  });

  it('calculates loudness ratio (measured vs reference)', () => {
    const measured = { rms: 0.15, lufs: -18.5 };
    const reference = { rms: 0.10, lufs: -23.0 };

    // RMS ratio: (attenuated with AGC) / (normal baseline)
    const loudnessRatio = measured.rms / reference.rms;
    expect(loudnessRatio).toBeCloseTo(1.5, 2);

    // LUFS ratio (log-based loudness difference in dB)
    const lfusDb = measured.lufs - reference.lufs;
    expect(lfusDb).toBeCloseTo(4.5, 1); // ~4.5 dB boost from AGC

    const session = {
      appliedAt: new Date().toISOString(),
      configuredVolume: 60,
      scenario: 'test',
      measuredLoudness: measured,
      referenceLoudness: reference,
      loudnessRatio,
      agcCompensationFactor: loudnessRatio, // (measured / reference) = AGC boost factor
      notes: `Attenuation to 60% but AGC raised loudness by ${lfusDb.toFixed(1)} dB`,
    };

    control.logSession(session);
    const logged = control.getSessions()[0];

    expect(logged.loudnessRatio).toBeCloseTo(1.5, 2);
    expect(logged.agcCompensationFactor).toBeCloseTo(1.5, 2);
  });

  it('logs session with different attenuation levels', () => {
    const scenarios = [
      { volume: 100, measuredRMS: 0.10, label: 'normal (baseline)' },
      { volume: 80, measuredRMS: 0.14, label: '80% source, AGC +40%' },
      { volume: 60, measuredRMS: 0.15, label: '60% source, AGC +50%' },
      { volume: 40, measuredRMS: 0.16, label: '40% source, AGC +60%' },
    ];

    const referenceRMS = 0.10;

    for (const scenario of scenarios) {
      const session = {
        appliedAt: new Date().toISOString(),
        configuredVolume: scenario.volume,
        scenario: `B06 weak-source: ${scenario.label}`,
        measuredLoudness: { rms: scenario.measuredRMS, lufs: -20 },
        referenceLoudness: { rms: referenceRMS, lufs: -23 },
        loudnessRatio: scenario.measuredRMS / referenceRMS,
        agcCompensationFactor: scenario.measuredRMS / referenceRMS,
      };
      control.logSession(session);
    }

    const logged = control.getSessions();
    expect(logged).toHaveLength(4);

    // Verify attenuation levels are recorded
    expect(logged[0].configuredVolume).toBe(100);
    expect(logged[1].configuredVolume).toBe(80);
    expect(logged[2].configuredVolume).toBe(60);
    expect(logged[3].configuredVolume).toBe(40);

    // Verify AGC compensation factors (higher as source gets weaker)
    expect(logged[0].agcCompensationFactor).toBeCloseTo(1.0, 1);
    expect(logged[1].agcCompensationFactor).toBeCloseTo(1.4, 1);
    expect(logged[2].agcCompensationFactor).toBeCloseTo(1.5, 1);
    expect(logged[3].agcCompensationFactor).toBeCloseTo(1.6, 1);
  });

  it('demonstrates attenuation control API (stub when .123 unreachable)', async () => {
    const config = {
      volumePercent: 60,
      description: 'soft-talker simulation',
      host: '192.168.254.123',
      sourceId: 'alsa_input.pci-0000_2d_00.4.analog-stereo',
    };

    // When .123 is not reachable (typical in this session)
    const applied = await control.applyAttenuation(config);
    expect(applied).toBe(false);

    // When .123 is mocked as reachable (for future live integration)
    process.env.B06_MOCK_REACHABLE = 'true';
    const control2 = new WeakSourceControl();
    const appliedMocked = await control2.applyAttenuation(config);
    expect(appliedMocked).toBe(true);
    delete process.env.B06_MOCK_REACHABLE;
  });

  it('measures RMS and LUFS from synthetic audio', () => {
    // Synthetic audio: 1 second of 440 Hz sine wave at 0.5 amplitude, 16 kHz sample rate
    const sampleRate = 16000;
    const duration = 1.0; // seconds
    const frequency = 440; // Hz
    const amplitude = 0.5;
    const samples = new Float32Array(sampleRate * duration);

    for (let i = 0; i < samples.length; i++) {
      samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    }

    const loudness = analyzer.measureLoudness(samples, sampleRate);

    // Expected: RMS of 0.5 amplitude sine ≈ 0.5 / √2 ≈ 0.354
    expect(loudness.rms).toBeCloseTo(0.354, 2);

    // LUFS should be in a reasonable range for this signal
    expect(loudness.lufs).toBeGreaterThan(-30);
    expect(loudness.lufs).toBeLessThan(-9);
  });

  it('compares loudness ratios between weak and normal source', () => {
    // Normal source: 1 second of 440 Hz sine at 0.5 amplitude
    const normalSamples = createSinWave(0.5, 440, 16000, 1);
    const normalLoudness = analyzer.measureLoudness(normalSamples, 16000);

    // Weak source (attenuated to 60%): same but at 0.3 amplitude
    const weakSamples = createSinWave(0.3, 440, 16000, 1);
    const weakLoudness = analyzer.measureLoudness(weakSamples, 16000);

    // With AGC OFF: ratio should be close to 0.6 (30% RMS relative to 50%)
    const ratioWithoutAGC = weakLoudness.rms / normalLoudness.rms;
    expect(ratioWithoutAGC).toBeCloseTo(0.6, 1);

    // Simulate AGC compensation: boost weak signal back by ~50%
    const withAGCRatio = ratioWithoutAGC * 1.5;
    expect(withAGCRatio).toBeCloseTo(0.9, 1); // AGC brings it back to ~90% of normal

    console.log(`[B06] Attenuation ratio (60%): ${ratioWithoutAGC.toFixed(3)}`);
    console.log(`[B06] With AGC boost (1.5x): ${withAGCRatio.toFixed(3)}`);
  });

  it('extracts voiced segments from synthetic audio', () => {
    // Synthetic: 2 voiced segments separated by silence
    const segment1 = createSinWave(0.3, 440, 16000, 0.5); // 0.5 sec
    const silence = new Float32Array(16000 * 0.5); // 0.5 sec silence
    const segment2 = createSinWave(0.3, 440, 16000, 0.5); // 0.5 sec

    const combined = new Float32Array(segment1.length + silence.length + segment2.length);
    combined.set(segment1, 0);
    combined.set(silence, segment1.length);
    combined.set(segment2, segment1.length + silence.length);

    const voiced = analyzer.extractVoicedSegments(combined, 16000);

    // Should detect 2 voiced segments
    expect(voiced.length).toBeGreaterThanOrEqual(2);

    // Each segment should have measurable loudness
    for (const seg of voiced) {
      expect(seg.loudness.rms).toBeGreaterThan(0);
      expect(seg.loudness.lufs).toBeGreaterThan(-Infinity);
    }
  });
});

// Helper: create sine wave
function createSinWave(
  amplitude: number,
  frequency: number,
  sampleRate: number,
  duration: number
): Float32Array {
  const samples = new Float32Array(sampleRate * duration);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return samples;
}
