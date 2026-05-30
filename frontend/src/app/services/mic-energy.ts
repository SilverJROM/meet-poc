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

// ---------------------------------------------------------------------------
// B2a — capture-side root-cause helpers (R3).
// All pure: no Angular, DOM, AudioContext, or RTCPeerConnection construction.
// They operate on plain data so they are node/tsx unit-testable.
// ---------------------------------------------------------------------------

/**
 * Tolerant audio-capture constraints (AC1).
 *
 * EC/NS/AGC are applied as `{ ideal: true }` (best-effort, never hard-required)
 * so a pro/USB/multi-channel external mic that can't honour them still yields a
 * track instead of a silent/failed one. `deviceId:{exact}` is set ONLY when a
 * device was chosen — never `{exact:undefined}`. `audio:false` short-circuits to
 * the boolean `false`. Deliberately does NOT constrain channelCount/sampleRate:
 * the post-publish energy gate is the safety net, not over-reaching constraints.
 */
export function audioCaptureConstraints(audio: boolean, deviceId?: string): boolean | MediaTrackConstraints {
  if (!audio) return false;
  return {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

/**
 * Pure extractor for the source-side outbound-audio stat (AC2).
 *
 * ONE source of truth: both collectDiagnostics() and the post-publish energy
 * gate call this over a single getStats() report. Returns the first
 * `media-source`/`kind==='audio'` entry's audioLevel/totalAudioEnergy (non-number
 * fields → null, never throw), or null when there is no audio media-source.
 */
export function extractOutboundAudioSource(stats: {
  values(): IterableIterator<any>;
}): OutboundAudioSourceStat | null {
  for (const stat of stats.values()) {
    if (stat && stat.type === 'media-source' && stat.kind === 'audio') {
      return {
        audioLevel: typeof stat.audioLevel === 'number' ? stat.audioLevel : null,
        totalAudioEnergy: typeof stat.totalAudioEnergy === 'number' ? stat.totalAudioEnergy : null,
      };
    }
  }
  return null;
}

/** A single window sample for the sustained-capture discriminator. */
export type EnergySample = {
  totalAudioEnergy: number | null;
  audioLevel: number | null;
};

export type MicCaptureClass = 'silent' | 'working' | 'indeterminate';

/**
 * Default flat-energy tolerance. totalAudioEnergy is a monotonically increasing
 * cumulative value; a working mic accrues energy every sample, so even a tiny
 * positive last-first delta proves capture. EPSILON is small enough to catch a
 * quiet-but-working mic, large enough to ignore float noise on a truly flat stat.
 */
export const ENERGY_DELTA_EPSILON = 1e-7;

/**
 * SUSTAINED capture discriminator (AC3, LOCKED by JROM).
 *
 * Decides silence ONLY from a window, never a single instantaneous sample:
 *  - WORKING if totalAudioEnergy is INCREASING across the window (last usable −
 *    first usable ≥ epsilon) — even if every audioLevel is below threshold
 *    (a quiet-but-working mic must NEVER be classed silent).
 *  - SILENT only if energy is FLAT (delta < epsilon) AND the max audioLevel
 *    across the window is below the silence threshold (corroboration).
 *  - INDETERMINATE if fewer than 2 usable (non-null) energy samples — cannot
 *    prove flatness, so never a false silence claim.
 */
export function classifyMicCapture(
  window: EnergySample[],
  opts?: { energyDeltaEpsilon?: number; levelThreshold?: number },
): MicCaptureClass {
  const epsilon = opts?.energyDeltaEpsilon ?? ENERGY_DELTA_EPSILON;
  const levelThreshold = opts?.levelThreshold ?? MIC_SILENCE_LEVEL_THRESHOLD;

  const energies = window
    .map((s) => s.totalAudioEnergy)
    .filter((e): e is number => typeof e === 'number');

  // Need at least two usable energy readings to judge flat-vs-increasing.
  if (energies.length < 2) return 'indeterminate';

  const delta = energies[energies.length - 1] - energies[0];
  if (delta >= epsilon) return 'working';

  // Energy is flat — corroborate with the instantaneous level before claiming
  // silence. A flat-energy window with an above-threshold level is NOT silent.
  const levels = window
    .map((s) => s.audioLevel)
    .filter((l): l is number => typeof l === 'number');
  const maxLevel = levels.length ? Math.max(...levels) : 0;
  if (maxLevel < levelThreshold) return 'silent';

  return 'working';
}

export type RecoveryInput = {
  classification: MicCaptureClass;
  micEnabled: boolean; // track.enabled
  micUnmuted: boolean; // !track.muted
  hasLiveAudioTrack: boolean; // track exists AND readyState === 'live'
  alreadyAttempted: boolean; // one-shot guard
  selectedDeviceId: string | undefined;
};

export type RecoveryAction = 'reacquire-same-device' | 'keep-and-warn' | 'none';

export type RecoveryDecision = {
  action: RecoveryAction;
  deviceId: string | undefined; // when reacquiring, ALWAYS equals selectedDeviceId
};

/**
 * Bounded NON-DESTRUCTIVE recovery decision (AC4 + AC5, LOCKED by JROM).
 *
 * Pure predicate — no I/O. The action union contains NO destructive value
 * (nothing that stops/removes the track), so the wiring can never end with zero
 * audio tracks. Rules:
 *  - Only a 'silent' classification is ever actionable; 'working'/'indeterminate'
 *    → 'none' (a quiet-but-working mic never triggers recovery).
 *  - Gated on enabled + unmuted + live track; any gate false → 'none' (a muted
 *    user is intentionally silent).
 *  - First silent pass (not-yet-attempted) → reacquire the SAME selectedDeviceId
 *    (AC5 — never switches to a different concrete device).
 *  - Still silent after the one attempt (alreadyAttempted) → 'keep-and-warn'
 *    (keep the existing track, surface a warn). NEVER a second reacquire.
 */
export function decideMicRecovery(input: RecoveryInput): RecoveryDecision {
  const none: RecoveryDecision = { action: 'none', deviceId: input.selectedDeviceId };

  if (input.classification !== 'silent') return none;
  if (!input.micEnabled || !input.micUnmuted || !input.hasLiveAudioTrack) return none;

  if (input.alreadyAttempted) {
    return { action: 'keep-and-warn', deviceId: input.selectedDeviceId };
  }
  return { action: 'reacquire-same-device', deviceId: input.selectedDeviceId };
}

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
