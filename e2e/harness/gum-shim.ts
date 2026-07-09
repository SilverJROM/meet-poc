// D19 forced (deterministic) weak-signal mode.
//
// `gumShimInitScript` is a Playwright `addInitScript`-injectable function: it
// wraps the page's REAL `navigator.mediaDevices.getUserMedia`, lets Chrome's own
// audio processing (echoCancellation/noiseSuppression/autoGainControl, requested
// by the app in mic-energy.ts's audioCaptureConstraints) run exactly as it
// normally would, and only attenuates the resulting track AFTER that processing
// has already happened — via a GainNode downstream of the real capture. Because
// AGC has already seen and processed the un-attenuated signal by the time the
// GainNode touches it, AGC cannot claw the attenuation back. The app calls
// getUserMedia() exactly as before (media.service.ts:55) and is unaware.
//
// The math/verification helpers below are pure (no DOM) so they're testable in
// plain Node; only `gumShimInitScript` itself requires a real browser.

import type { StimulusVerification } from './recording-arbiter.js';

export const DEFAULT_TOLERANCE_FRACTION = 0.2;
export const MIN_BASELINE = 0.01; // Reject baselines below this floor (dead/noise-only mics)

/**
 * Page-context function. Pass to `page.addInitScript(gumShimInitScript, intendedRatio)`
 * BEFORE navigation. Must be self-contained — Playwright serializes it into the
 * page, so it cannot close over anything outside its own argument.
 */
export function gumShimInitScript(intendedRatio: number): void {
  const mediaDevices = navigator.mediaDevices;
  const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);

  mediaDevices.getUserMedia = async function shimmedGetUserMedia(
    constraints?: MediaStreamConstraints,
  ): Promise<MediaStream> {
    const realStream = await originalGetUserMedia(constraints);
    const audioTracks = realStream.getAudioTracks();
    if (audioTracks.length === 0) {
      // Video-only request: nothing to attenuate, pass through untouched.
      return realStream;
    }

    const AudioContextCtor =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('AudioContext unavailable; cannot apply forced weak-signal shim');

    const audioContext = new AudioContextCtor();
    await audioContext.resume();

    // Source is the REAL, already-AGC/EC/NS-processed audio track. Everything
    // from here down is downstream of Chrome's own processing.
    const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
    const gainNode = audioContext.createGain();
    gainNode.gain.value = intendedRatio;
    const destination = audioContext.createMediaStreamDestination();
    source.connect(gainNode);
    gainNode.connect(destination);

    const shimmedAudioTrack = destination.stream.getAudioTracks()[0];
    const outputTracks: MediaStreamTrack[] = [shimmedAudioTrack, ...realStream.getVideoTracks()];
    return new MediaStream(outputTracks);
  };
}

/** Relative-error tolerance check shared by verification and the arbiter's FAIL/PASS split. */
export function withinTolerance(intended: number, measured: number, toleranceFraction = DEFAULT_TOLERANCE_FRACTION): boolean {
  if (intended === 0) return measured === 0;
  const relativeError = Math.abs(measured - intended) / Math.abs(intended);
  return relativeError <= toleranceFraction;
}

/** Builds a StimulusVerification from measured baseline/attenuated loudness (e.g. RMS). */
export function computeStimulusVerification(
  intendedGain: number,
  baselineLevel: number,
  attenuatedLevel: number,
  toleranceFraction = DEFAULT_TOLERANCE_FRACTION,
): StimulusVerification {
  const measuredGain = baselineLevel === 0 ? 0 : attenuatedLevel / baselineLevel;
  return {
    intendedGain,
    measuredGain,
    withinTolerance: withinTolerance(intendedGain, measuredGain, toleranceFraction),
  };
}

/**
 * D19's hard rule: the stimulus must be VERIFIED before any assertion. If either
 * measurement is missing (baseline never captured, attenuated capture failed, no
 * usable reference level), verification cannot be computed — that must surface as
 * INVALID (via RecordingArbiter.determineVerdict receiving `undefined`), never a
 * silent PASS. Dead/too-quiet baselines (below MIN_BASELINE) also surface as INVALID
 * to prevent noise-floor coincidences from falsely passing.
 */
export function verifyStimulus(
  intendedGain: number,
  baselineLevel: number | null,
  attenuatedLevel: number | null,
  toleranceFraction = DEFAULT_TOLERANCE_FRACTION,
): StimulusVerification | undefined {
  if (
    baselineLevel === null ||
    attenuatedLevel === null ||
    baselineLevel <= 0 ||
    baselineLevel < MIN_BASELINE
  ) {
    return undefined;
  }
  return computeStimulusVerification(intendedGain, baselineLevel, attenuatedLevel, toleranceFraction);
}
