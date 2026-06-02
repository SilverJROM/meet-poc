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

/** Subset of MediaTrackSettings carrying the three processing flags (B2 R1). */
export type AudioProcessingSettings = {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
};

/**
 * Pure diagnostic: which of EC/NS/AGC the DEVICE declined (B2 R1).
 *
 * `audioCaptureConstraints` requests the three as `{ ideal: true }` — best-effort,
 * never hard-required — so a device may quietly NOT apply one. `track.getSettings()`
 * reports what was ACTUALLY applied. This returns the names that came back STRICTLY
 * `=== false` (the device applied-and-disabled them). An ABSENT key (undefined —
 * browsers omit keys they don't support) is NOT flagged, and a non-boolean falsy
 * value (0, '') is NOT flagged: only an explicit boolean `false` counts. Pure,
 * framework-free, tsx-testable; consumed by media.service's log-only verifier.
 * Deterministic check order: echoCancellation, noiseSuppression, autoGainControl.
 */
export function unappliedAudioProcessing(settings: AudioProcessingSettings): string[] {
  const unapplied: string[] = [];
  if (settings.echoCancellation === false) unapplied.push('echoCancellation');
  if (settings.noiseSuppression === false) unapplied.push('noiseSuppression');
  if (settings.autoGainControl === false) unapplied.push('autoGainControl');
  return unapplied;
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
 * B5 — PURE per-frame energy accumulator for the pre-call lobby self-test (R8).
 *
 * Framework-free: no Angular, DOM, AudioContext, or timers — so it is
 * node/tsx unit-testable AND it lets the lobby self-test feed the EXISTING single
 * AnalyserNode's per-frame energy into the SAME classifyMicCapture the in-call
 * watchdog uses (NO new meter, NO new verdict logic).
 *
 * Maps the prior cumulative total + this frame's mean-square (sum of
 * centered-sample^2 / N — the SAME quantity startMicLevel already computes before
 * its sqrt×3 display scale) into the next EnergySample:
 *  - totalAudioEnergy is the running cumulative (monotone non-decreasing over a
 *    frame stream) — so classifyMicCapture's last-first delta proves capture
 *    identically to the in-call media-source totalAudioEnergy window.
 *  - audioLevel is the RAW RMS (sqrt of mean-square) — SAME units as the in-call
 *    media-source audioLevel for the 0.01 corroboration. The ×3 stays display-only
 *    on micLevel.
 * Guards NaN/negative input: a frameMeanSquare < 0 (or NaN) is treated as 0.
 */
export function accumulateEnergyFrame(prevTotal: number, frameMeanSquare: number): EnergySample {
  const safe = typeof frameMeanSquare === 'number' && frameMeanSquare > 0 ? frameMeanSquare : 0;
  return {
    totalAudioEnergy: prevTotal + safe,
    audioLevel: Math.sqrt(safe),
  };
}

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

/**
 * B2b — in-call silent-mic warn-state reducer (AC-B1, the headline).
 *
 * Pure, framework-free: no Angular, DOM, or timers. Maps the current banner
 * state + this poll's capture classification + the live mic gate to the NEXT
 * banner-shown boolean. The continuous in-call watchdog applies it each ~1s tick;
 * the post-publish one-shot fallback reuses the same signal so there is ONE
 * silent-mic warn surface (AC-B8).
 *
 * Locked truth table:
 *  - micActive === false ⇒ false — muted/disabled never warns (and muting WHILE
 *    shown clears it); never warn about silence the user caused.
 *  - 'silent'        ⇒ true  — sustained published silence ⇒ show.
 *  - 'working'       ⇒ false — energy returned ⇒ auto-clear (no user action).
 *  - 'indeterminate' ⇒ current — unchanged, prevents flicker on a thin window.
 *
 * Note: classifyMicCapture returns the literal 'indeterminate' (NOT 'unknown');
 * the reducer treats 'indeterminate' as "keep current".
 */
export function nextMicWarningState(
  current: boolean,
  classification: MicCaptureClass,
  micActive: boolean,
): boolean {
  if (!micActive) return false;
  if (classification === 'silent') return true;
  if (classification === 'working') return false;
  return current; // 'indeterminate' — no change, no flicker.
}

// ---------------------------------------------------------------------------
// B2c — multi-device microphone fallback (R10; AMENDS B2a's AC5).
//
// AC5 LOCKED recovery to the SAME device only. R10 LIFTS that lock: on confirmed
// sustained silence the protocol walks an ORDERED candidate list (current device
// FIRST, then every OTHER available mic), adopting the first that produces audio
// energy; only when NONE works does it surface the error prompt. The pure pieces
// below carry the deterministic proof (NS5) — all framework-free, no DOM, no
// timers, no AudioContext (the meter stays classifyMicCapture + getOutboundAudioSource).
// ---------------------------------------------------------------------------

export type RecoveryInput = {
  classification: MicCaptureClass;
  micEnabled: boolean; // track.enabled
  micUnmuted: boolean; // !track.muted
  hasLiveAudioTrack: boolean; // track exists AND readyState === 'live'
  candidateDeviceIds: string[]; // ordered, deduped, CURRENT-FIRST; empty strings excluded by caller
  attemptedDeviceIds: string[]; // already tried this episode
};

export type RecoveryAction = 'try-device' | 'keep-and-warn' | 'none';

export type RecoveryDecision = {
  action: RecoveryAction;
  deviceId?: string; // the candidate to try when action === 'try-device'
};

/**
 * Bounded NON-DESTRUCTIVE recovery STEP decision (AC4 + amended AC5, R10).
 *
 * Pure predicate — no I/O. The action union contains NO destructive value
 * (nothing that stops/removes the track), so the wiring can never end with zero
 * audio tracks. Walks an ordered candidate list one step at a time:
 *  - Only a 'silent' classification is ever actionable; 'working'/'indeterminate'
 *    → 'none' (a quiet-but-working mic is NEVER swept — B2a U-8 preserved).
 *  - Gated on enabled + unmuted + live track; any gate false → 'none' (a muted
 *    user is intentionally silent and must never trigger a sweep).
 *  - The FIRST unattempted candidate → 'try-device'. Because candidateDeviceIds
 *    is CURRENT-FIRST, the first step re-acquires the current device once; the
 *    subsequent steps try each OTHER mic (the AC5 lock is lifted here).
 *  - Every candidate attempted, still silent → 'keep-and-warn' (terminal: keep
 *    the existing track, surface the single warn). NEVER destructive.
 */
export function decideMicRecovery(input: RecoveryInput): RecoveryDecision {
  if (input.classification !== 'silent') return { action: 'none' };
  if (!input.micEnabled || !input.micUnmuted || !input.hasLiveAudioTrack) return { action: 'none' };

  const attempted = new Set(input.attemptedDeviceIds);
  const next = input.candidateDeviceIds.find((id) => id && !attempted.has(id));
  if (next) return { action: 'try-device', deviceId: next };
  return { action: 'keep-and-warn' };
}

/** A device candidate for the recovery sweep. MediaDeviceInfo is structurally assignable. */
export type DeviceCandidate = { deviceId: string; groupId?: string; label?: string };

/**
 * PURE candidate builder (R10 candidate hygiene).
 *
 * Builds the CURRENT-FIRST ordered candidate list the sweep walks:
 *  - the currently-selected device is placed FIRST (re-acquiring it is the
 *    protocol's step 1 — it is NOT excluded);
 *  - every other enumerated mic follows in enumeration order;
 *  - deduped by BOTH deviceId AND groupId, so the 'default'/'communications'
 *    aliases collapse to their physical twin (only the first occurrence of a
 *    groupId survives);
 *  - empty deviceIds and already-failed devices are dropped.
 */
export function orderedMicCandidates(
  selectedDeviceId: string,
  devices: DeviceCandidate[],
  failed: Set<string> = new Set(),
): DeviceCandidate[] {
  const ordered: DeviceCandidate[] = [];
  const selected = selectedDeviceId ? devices.find((d) => d.deviceId === selectedDeviceId) : undefined;
  if (selected) ordered.push(selected);
  for (const d of devices) if (d !== selected) ordered.push(d);

  const seenIds = new Set<string>();
  const seenGroups = new Set<string>();
  const out: DeviceCandidate[] = [];
  for (const d of ordered) {
    if (!d.deviceId || failed.has(d.deviceId)) continue;
    if (seenIds.has(d.deviceId)) continue;
    if (d.groupId && seenGroups.has(d.groupId)) continue;
    seenIds.add(d.deviceId);
    if (d.groupId) seenGroups.add(d.groupId);
    out.push(d);
  }
  return out;
}

/**
 * PURE sweep-GATE reducer (R10 bounded-to-one-sweep-per-episode).
 *
 * Single `swept` model — `shouldSweep` is true on exactly the FIRST silent poll
 * of an episode. Mute is a PAUSE, not a permanent consume: a muted/disabled poll
 * RE-ARMS (swept:false) so a post-unmute silent episode still gets one sweep.
 *  - micActive=false (muted/disabled) → re-arm, never sweep.
 *  - 'working' (energy present/returned) → re-arm (new episode may sweep again).
 *  - 'silent' + not-yet-swept → consume the ONE sweep (swept:true, shouldSweep:true).
 *  - 'silent' + already-swept → no re-sweep (no thrash).
 *  - 'indeterminate' → unchanged, no flicker.
 */
export function nextSweepGate(
  swept: boolean,
  classification: MicCaptureClass,
  micActive: boolean,
): { swept: boolean; shouldSweep: boolean } {
  if (!micActive) return { swept: false, shouldSweep: false };
  if (classification === 'working') return { swept: false, shouldSweep: false };
  if (classification === 'silent') {
    if (!swept) return { swept: true, shouldSweep: true };
    return { swept: true, shouldSweep: false };
  }
  return { swept, shouldSweep: false };
}

/** Acquired-track shape the sweep orchestrator works with (framework-free). */
export type SweepCandidate = { deviceId: string; label?: string };

export type SweepHooks = {
  /** Ordered, current-first candidate list (from orderedMicCandidates). */
  candidates: SweepCandidate[];
  /** Re-read each iteration so a mute mid-sweep aborts. */
  gates(): { micEnabled: boolean; micUnmuted: boolean; hasLiveAudioTrack: boolean };
  /** = media.replaceAudioTrack; may throw; null = failed (old track kept, NON-DESTRUCTIVE). */
  acquire(deviceId: string): Promise<{ deviceId: string; label?: string } | null>;
  /** Re-sample + classify the NOW-published track. */
  classifyCurrent(): Promise<MicCaptureClass>;
  /** deviceId of the currently-live published track (used to decide if a restore is needed). */
  currentLiveDeviceId(): string;
};

export type SweepResult =
  | { outcome: 'adopted'; deviceId: string; label?: string }
  | { outcome: 'none-working'; restoredDeviceId: string | null }
  | { outcome: 'aborted' };

/**
 * PURE ASYNC sweep orchestrator (R10 — the never-zero-audio wiring proof).
 *
 * Framework-free: no DOM, no timers — all I/O via injected hooks. It CALLS
 * decideMicRecovery internally so the step fn is exercised by the wiring. The
 * acquire hook models the NON-DESTRUCTIVE replaceAudioTrack contract (adds the
 * new track before removing the old; null/throw keeps the old track live), so
 * the protocol never holds zero tracks. Adopts the first candidate that
 * classifies 'working'; on total failure restores the ORIGINAL device so the
 * user is not stranded on a random silent mic; aborts if the mic is muted/
 * disabled mid-sweep.
 */
export async function runMicSweep(originalDeviceId: string, hooks: SweepHooks): Promise<SweepResult> {
  const attempted: string[] = [];
  let classification: MicCaptureClass = 'silent'; // entered ONLY on confirmed silence

  for (;;) {
    const g = hooks.gates();
    const decision = decideMicRecovery({
      classification,
      micEnabled: g.micEnabled,
      micUnmuted: g.micUnmuted,
      hasLiveAudioTrack: g.hasLiveAudioTrack,
      candidateDeviceIds: hooks.candidates.map((c) => c.deviceId),
      attemptedDeviceIds: attempted,
    });

    if (decision.action === 'none') return { outcome: 'aborted' }; // muted/disabled mid-sweep

    if (decision.action === 'keep-and-warn') {
      // Restore the ORIGINAL device so the user isn't stranded on a random silent mic.
      let restoredDeviceId: string | null = null;
      if (originalDeviceId && hooks.currentLiveDeviceId() !== originalDeviceId) {
        try {
          const r = await hooks.acquire(originalDeviceId);
          if (r) restoredDeviceId = r.deviceId;
        } catch {
          /* non-destructive: the old track stays live */
        }
      } else if (originalDeviceId) {
        restoredDeviceId = originalDeviceId;
      }
      return { outcome: 'none-working', restoredDeviceId };
    }

    const deviceId = decision.deviceId!; // try-device
    attempted.push(deviceId);
    let track: { deviceId: string; label?: string } | null = null;
    try {
      track = await hooks.acquire(deviceId);
    } catch {
      track = null; // throw = skip (non-fatal); old track kept
    }
    if (!track) {
      classification = 'silent'; // null = skip; do NOT classify a null track
      continue;
    }
    classification = await hooks.classifyCurrent();
    if (classification === 'working') return { outcome: 'adopted', deviceId: track.deviceId, label: track.label };
    // still silent → loop; decideMicRecovery picks the next unattempted candidate
  }
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
