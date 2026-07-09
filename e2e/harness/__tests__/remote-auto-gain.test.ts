import { describe, it, expect } from 'vitest';
import type { RemoteAudioLevelSample } from '../../../frontend/src/app/services/remote-audio.service';
import { computeRemoteAutoGains } from '../../../frontend/src/app/services/remote-audio.service';

const AUTO_LEVEL_TARGET_RATIO = 0.88;
const AUTO_LEVEL_NOISE_FLOOR = 0.003;
const AUTO_LEVEL_MAX_GAIN = 2.5;
const AUTO_LEVEL_SMOOTHING = 0.35;

describe('computeRemoteAutoGains', () => {
  describe('2-party single remote (no-op)', () => {
    it.each([0.5, 0.3, 0.2, 0.1, 0.05, 0.02])(
      'single remote at level %.3f should gain ≈ 1.0 (2-party unity)',
      (remoteLevel: number) => {
        const samples: RemoteAudioLevelSample[] = [
          { publisherClientId: 'remote-1', audioLevel: remoteLevel },
        ];
        const gains = computeRemoteAutoGains(samples);

        // 2-party: loudest = remoteLevel
        // raw = max(1, min(2.5, (remoteLevel * 0.88) / remoteLevel)) = max(1, 0.88) = 1.0
        // After smoothing with initial prev=1: 1 + (1 - 1) * 0.35 = 1.0
        expect(gains['remote-1']).toBeCloseTo(1.0, 3);
      }
    );
  });

  describe('multi-party unequal levels (boost)', () => {
    it('quieter peer gets boost toward target when two remotes unequal', () => {
      const samples: RemoteAudioLevelSample[] = [
        { publisherClientId: 'remote-loud', audioLevel: 0.5 },
        { publisherClientId: 'remote-quiet', audioLevel: 0.2 },
      ];
      const gains = computeRemoteAutoGains(samples);

      // loudest = 0.5
      // loud: raw = max(1, min(2.5, (0.5 * 0.88) / 0.5)) = max(1, 0.88) = 1.0
      // quiet: raw = max(1, min(2.5, (0.5 * 0.88) / 0.2)) = max(1, min(2.5, 2.2)) = 2.2
      // Smoothed from prev=1: 1 + (2.2 - 1) * 0.35 = 1.42
      expect(gains['remote-loud']).toBeCloseTo(1.0, 3);
      expect(gains['remote-quiet']).toBeCloseTo(1.42, 2);
      expect(gains['remote-quiet']).toBeGreaterThan(1.0);
    });

    it('three remotes unequal: middle and quietest boosted', () => {
      const samples: RemoteAudioLevelSample[] = [
        { publisherClientId: 'r-loud', audioLevel: 0.6 },
        { publisherClientId: 'r-mid', audioLevel: 0.3 },
        { publisherClientId: 'r-quiet', audioLevel: 0.1 },
      ];
      const gains = computeRemoteAutoGains(samples);

      // loudest = 0.6
      // loud: raw = max(1, min(2.5, (0.6 * 0.88) / 0.6)) = 1.0
      // mid: raw = max(1, min(2.5, (0.6 * 0.88) / 0.3)) = max(1, 1.76) = 1.76
      // quiet: raw = max(1, min(2.5, (0.6 * 0.88) / 0.1)) = max(1, 5.28) → clamped to 2.5
      // Smoothed: mid: 1 + (1.76-1)*0.35=1.266, quiet: 1 + (2.5-1)*0.35=1.525
      expect(gains['r-loud']).toBeCloseTo(1.0, 3);
      expect(gains['r-mid']).toBeCloseTo(1.266, 2);
      expect(gains['r-quiet']).toBeCloseTo(1.525, 2);
    });
  });

  describe('noise floor filtering', () => {
    it('samples below noise floor (0.003) are ignored in loudest calculation', () => {
      const samples: RemoteAudioLevelSample[] = [
        { publisherClientId: 'remote-1', audioLevel: 0.002 }, // below floor
        { publisherClientId: 'remote-2', audioLevel: 0.5 }, // above floor
      ];
      const gains = computeRemoteAutoGains(samples);

      // Only remote-2 is usable; loudest = 0.5
      // remote-1 is not usable so raw = 1.0 (line 108 condition fails)
      // remote-2: raw = max(1, min(2.5, (0.5 * 0.88) / 0.5)) = 1.0
      expect(gains['remote-1']).toBeCloseTo(1.0, 3);
      expect(gains['remote-2']).toBeCloseTo(1.0, 3);
    });

    it('all samples below noise floor yield all gain = 1.0', () => {
      const samples: RemoteAudioLevelSample[] = [
        { publisherClientId: 'r1', audioLevel: 0.002 },
        { publisherClientId: 'r2', audioLevel: 0.001 },
      ];
      const gains = computeRemoteAutoGains(samples);

      // No usable samples; loudest = 0
      // All fall through to raw = 1.0
      expect(gains['r1']).toBeCloseTo(1.0, 3);
      expect(gains['r2']).toBeCloseTo(1.0, 3);
    });

    it('null/non-finite audio levels are ignored', () => {
      const samples: RemoteAudioLevelSample[] = [
        { publisherClientId: 'r1', audioLevel: null },
        { publisherClientId: 'r2', audioLevel: 0.5 },
        { publisherClientId: 'r3', audioLevel: Infinity },
      ];
      const gains = computeRemoteAutoGains(samples);

      // Only r2 is usable; loudest = 0.5
      // r1, r3: raw = 1.0
      // r2: raw = 1.0
      expect(gains['r1']).toBeCloseTo(1.0, 3);
      expect(gains['r2']).toBeCloseTo(1.0, 3);
      expect(gains['r3']).toBeCloseTo(1.0, 3);
    });
  });

  describe('smoothing', () => {
    it('applies exponential smoothing with factor 0.35', () => {
      const samples1: RemoteAudioLevelSample[] = [
        { publisherClientId: 'r1', audioLevel: 0.5 },
        { publisherClientId: 'r2', audioLevel: 0.1 },
      ];
      const gains1 = computeRemoteAutoGains(samples1);
      // r2: raw = 2.5 (clamped), prev = 1, smoothed = 1 + (2.5 - 1) * 0.35 = 1.525

      expect(gains1['r2']).toBeCloseTo(1.525, 3);

      // Second call reuses previous gain
      const samples2: RemoteAudioLevelSample[] = [
        { publisherClientId: 'r1', audioLevel: 0.5 },
        { publisherClientId: 'r2', audioLevel: 0.1 },
      ];
      const gains2 = computeRemoteAutoGains(samples2, gains1);
      // r2: raw = 2.5, prev = 1.525, smoothed = 1.525 + (2.5 - 1.525) * 0.35 ≈ 1.865
      expect(gains2['r2']).toBeCloseTo(1.865, 2);
      expect(gains2['r2']).toBeGreaterThan(gains1['r2']);
    });
  });

  describe('max gain clamp', () => {
    it('gain cannot exceed AUTO_LEVEL_MAX_GAIN (2.5)', () => {
      const samples: RemoteAudioLevelSample[] = [
        { publisherClientId: 'loud', audioLevel: 0.5 },
        { publisherClientId: 'very-quiet', audioLevel: 0.01 },
      ];
      const gains = computeRemoteAutoGains(samples);

      // loud: raw = 1.0, smoothed = 1.0
      // very-quiet: raw = max(1, min(2.5, (0.5 * 0.88) / 0.01)) = max(1, min(2.5, 44)) = 2.5
      // Smoothed: 1 + (2.5-1)*0.35 = 1.525
      expect(gains['loud']).toBeCloseTo(1.0, 3);
      expect(gains['very-quiet']).toBeCloseTo(1.525, 2);
      expect(gains['very-quiet']).toBeLessThanOrEqual(2.5);
    });
  });

  describe('edge cases', () => {
    it('empty samples array', () => {
      const gains = computeRemoteAutoGains([]);
      expect(gains).toEqual({});
    });

    it('single sample preserves publisherClientId key', () => {
      const samples: RemoteAudioLevelSample[] = [
        { publisherClientId: 'my-peer-id-123', audioLevel: 0.3 },
      ];
      const gains = computeRemoteAutoGains(samples);
      expect(gains).toHaveProperty('my-peer-id-123');
      expect(gains['my-peer-id-123']).toBeCloseTo(1.0, 3);
    });

    it('missing publisherClientId is handled safely', () => {
      const samples: RemoteAudioLevelSample[] = [
        { publisherClientId: '', audioLevel: 0.5 },
        { publisherClientId: 'r1', audioLevel: 0.3 },
      ];
      const gains = computeRemoteAutoGains(samples);
      // Empty string is falsy, filtered out in usable, but still processed in loop
      // loudest = 0.3 (only r1 is usable)
      // empty: not usable, raw = 1.0
      // r1: raw = 1.0
      expect(gains['r1']).toBeCloseTo(1.0, 3);
    });
  });

  describe('formula table validation', () => {
    it.each([
      { r: 0.1, rawGain: 2.5, smoothed: 1.525 }, // clamped
      { r: 0.2, rawGain: 2.2, smoothed: 1.42 },
      { r: 0.3, rawGain: 1.47, smoothed: 1.1645 },
      { r: 0.4, rawGain: 1.1, smoothed: 1.035 },
      { r: 0.5, rawGain: 1.0, smoothed: 1.0 },
      { r: 0.6, rawGain: 1.0, smoothed: 1.0 },
    ])(
      'gain formula: for loudest=0.5, r=$r → smoothed≈$smoothed',
      ({ r, smoothed }: { r: number; rawGain: number; smoothed: number }) => {
        const samples: RemoteAudioLevelSample[] = [
          { publisherClientId: 'loud', audioLevel: 0.5 },
          { publisherClientId: 'test', audioLevel: r },
        ];
        const gains = computeRemoteAutoGains(samples);
        // Expect smoothed value (initial prev=1)
        expect(gains['test']).toBeCloseTo(smoothed, 1); // 1 decimal tolerance for rounding
      }
    );
  });
});
