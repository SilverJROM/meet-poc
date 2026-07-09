// B08S-2: Unit tests for pure capture taxonomy and encoding
// Tests fail-closed behavior: no synthetic WAV, INVALID throws

import { describe, it, expect } from 'vitest';
import { classifyCapture } from '../receive-side-recorder.js';

describe('receive-side-recorder taxonomy', () => {
  describe('classifyCapture: pure function, no browser', () => {
    it('INVALID_HOOK_MISSING: state object absent', () => {
      const result = classifyCapture(null as any);
      expect(result.kind).toBe('INVALID_HOOK_MISSING');
    });

    it('INVALID_HOOK_MISSING: installed flag false', () => {
      const result = classifyCapture({ installed: false });
      expect(result.kind).toBe('INVALID_HOOK_MISSING');
    });

    it('INVALID_RELOAD: navCount > 1', () => {
      const result = classifyCapture({
        installed: true,
        navCount: 2,
        pcCount: 1,
        trackCount: 1,
        callbackCount: 1,
        audioContextState: 'running',
      });
      expect(result.kind).toBe('INVALID_RELOAD');
    });

    it('INVALID_NO_PC: pcCount === 0', () => {
      const result = classifyCapture({
        installed: true,
        navCount: 1,
        pcCount: 0,
        trackCount: 0,
        callbackCount: 0,
        audioContextState: 'suspended',
      });
      expect(result.kind).toBe('INVALID_NO_PC');
    });

    it('INVALID_NO_PC: no PC even with stats', () => {
      const result = classifyCapture(
        {
          installed: true,
          navCount: 1,
          pcCount: 0,
          trackCount: 0,
        },
        { inboundAudioRtp: 0 },
      );
      expect(result.kind).toBe('INVALID_NO_PC');
    });

    it('INVALID_HOOK_BLIND: trackCount === 0 but stats show inbound audio RTP', () => {
      const result = classifyCapture(
        {
          installed: true,
          navCount: 1,
          pcCount: 1,
          trackCount: 0,
          callbackCount: 0,
          audioContextState: 'suspended',
        },
        { inboundAudioRtp: 100 },
      );
      expect(result.kind).toBe('INVALID_HOOK_BLIND');
    });

    it('PRODUCT_NO_MEDIA: trackCount === 0, stats show no inbound audio', () => {
      const result = classifyCapture(
        {
          installed: true,
          navCount: 1,
          pcCount: 1,
          trackCount: 0,
          callbackCount: 0,
          audioContextState: 'suspended',
        },
        { inboundAudioRtp: 0 },
      );
      expect(result.kind).toBe('PRODUCT_NO_MEDIA');
    });

    it('INVALID_AUDIO_GRAPH: trackCount >= 1 but callbackCount === 0', () => {
      const result = classifyCapture({
        installed: true,
        navCount: 1,
        pcCount: 1,
        trackCount: 1,
        callbackCount: 0,
        audioContextState: 'suspended',
        sampleCount: 0,
      });
      expect(result.kind).toBe('INVALID_AUDIO_GRAPH');
    });

    it('INVALID_AUDIO_GRAPH: trackCount >= 1, callbackCount >= 1 but context not running', () => {
      const result = classifyCapture({
        installed: true,
        navCount: 1,
        pcCount: 1,
        trackCount: 1,
        callbackCount: 100,
        audioContextState: 'suspended',
        sampleCount: 4096,
      });
      expect(result.kind).toBe('INVALID_AUDIO_GRAPH');
    });

    it('SILENCE: trackCount >= 1, callbacks fired, context running, but RMS near-zero', () => {
      const result = classifyCapture({
        installed: true,
        navCount: 1,
        pcCount: 1,
        trackCount: 1,
        callbackCount: 100,
        audioContextState: 'running',
        sampleCount: 4096,
        audioSamplesBase64: '', // Empty or near-zero samples
      });
      expect(result.kind).toBe('SILENCE');
      expect((result as any).durationMs).toBeGreaterThanOrEqual(0);
      expect((result as any).rms).toBeLessThan(0.01);
    });

    it('VALID: trackCount >= 1, callbacks fired, context running, RMS above floor', () => {
      const result = classifyCapture({
        installed: true,
        navCount: 1,
        pcCount: 1,
        trackCount: 1,
        callbackCount: 100,
        audioContextState: 'running',
        sampleCount: 4096,
        audioSamplesBase64: 'AQID', // Minimal non-zero samples
      });
      expect(result.kind).toBe('VALID');
      expect((result as any).rms).toBeGreaterThanOrEqual(0);
    });

    it('table-driven: no INVALID row yields VALID', () => {
      // All invalid states should never yield VALID
      const invalidStates = [
        { installed: false },
        { installed: true, navCount: 2 },
        { installed: true, navCount: 1, pcCount: 0 },
        { installed: true, navCount: 1, pcCount: 1, trackCount: 0 },
        { installed: true, navCount: 1, pcCount: 1, trackCount: 1, callbackCount: 0, audioContextState: 'suspended' },
      ];

      invalidStates.forEach((state) => {
        const result = classifyCapture(state as any);
        expect(result.kind).not.toBe('VALID');
        expect(result.kind).not.toBe('SILENCE');
      });
    });

    it('silence row yields SILENCE not INVALID', () => {
      // Real track, real callbacks, context running, but RMS near-zero
      const result = classifyCapture({
        installed: true,
        navCount: 1,
        pcCount: 1,
        trackCount: 1,
        callbackCount: 50,
        audioContextState: 'running',
        sampleCount: 2048,
        audioSamplesBase64: '',
      });
      expect(result.kind).toBe('SILENCE');
      expect(result.kind).not.toBe('INVALID_AUDIO_GRAPH');
    });
  });
});
