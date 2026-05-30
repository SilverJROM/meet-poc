// Pure derivation of the local mic-energy diagnostic fields (R1).
//
// This module is deliberately framework-free: no Angular, no DOM, and no
// Web Audio API. It maps the source-side RTCAudioSourceStats
// (audioLevel / totalAudioEnergy) plus local-track ground truth into the
// three diagnostic fields the sample payload carries.

export type OutboundAudioSourceStat = {
  audioLevel: number | null;
  totalAudioEnergy: number | null;
};

export type DeriveOutboundAudioInput = {
  audioSource: OutboundAudioSourceStat | null;
  hasLiveAudioTrack: boolean; // track exists AND readyState === 'live'
  micEnabled: boolean; // track.enabled
};

export type OutboundAudioFields = {
  outboundAudioLevel: number | null;
  outboundAudioEnergy: number | null;
  micSilent: boolean | null;
};

/**
 * Instantaneous audioLevel below this is treated as silence.
 * micSilent is driven by audioLevel, never the cumulative totalAudioEnergy.
 */
export const MIC_SILENCE_LEVEL_THRESHOLD = 0.01;

export function deriveOutboundAudioFields(input: DeriveOutboundAudioInput): OutboundAudioFields {
  const { audioSource, hasLiveAudioTrack, micEnabled } = input;

  // TT-E — no live audio track: nothing to measure.
  if (!hasLiveAudioTrack) {
    return { outboundAudioLevel: null, outboundAudioEnergy: null, micSilent: null };
  }

  // TT-C — live track but muted (track.enabled === false): known-silent.
  // Pass through whatever source stats we have; micSilent is true from track state.
  if (!micEnabled) {
    return {
      outboundAudioLevel: audioSource?.audioLevel ?? null,
      outboundAudioEnergy: audioSource?.totalAudioEnergy ?? null,
      micSilent: true,
    };
  }

  // TT-D — live + enabled but the browser exposes no media-source audio stat:
  // graceful absence, not a silence claim.
  if (!audioSource) {
    return { outboundAudioLevel: null, outboundAudioEnergy: null, micSilent: null };
  }

  // TT-A/B — live + enabled + source present.
  // micSilent derives from the instantaneous audioLevel; partial stats
  // (audioLevel null) yield micSilent null rather than a false claim.
  const micSilent =
    typeof audioSource.audioLevel === 'number'
      ? audioSource.audioLevel < MIC_SILENCE_LEVEL_THRESHOLD
      : null;

  return {
    outboundAudioLevel: audioSource.audioLevel,
    outboundAudioEnergy: audioSource.totalAudioEnergy,
    micSilent,
  };
}
