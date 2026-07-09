// B07 — Mode-A/Mode-B capture injection contracts.
//
// Builds on D19's gum-shim.ts pattern (wrap getUserMedia, operate downstream of
// Chrome's real EC/NS/AGC-processed track via a page-context AudioContext graph)
// to reproduce the two capture-side blind spots from real session `652c1475`:
//   Mode A — outboundAudioLevel frozen at a constant non-zero value, mic NOT
//            silent per micSilent, but the signal carries zero variance
//            (client `8dd16229`, ~3 min, `856104f`'s blind spot).
//   Mode B — literal silent track, micSilent=1, zero level
//            (`3baf851b`/`7b975db0`, never recovered).
// Both modes hold their signature for `holdDurationMs`, then switch to a known
// audio fixture so a live call built on top of this contract has something for
// the far end to receive/transcribe. B07 proves the MECHANISM only (real
// Chromium, no room join, 0/25 call burn) — it does not join a room, does not
// produce a transcript, and does not close AC4/AC5. See
// decisions/b07-findings.md for what remains OPEN for B13/B14.
//
// Per D27 (decisions/2026-07-09-north-voids-tgap-3400.md): T_gap=3400ms is
// VOID. T_GAP_PROVISIONAL_MS below is a wiring DEFAULT ONLY — never cited as a
// measured or gating value.

export type CaptureMode = 'mode-a-frozen' | 'mode-b-silent';

export type CaptureInjectionTimeline = {
  mode: CaptureMode;
  holdDurationMs: number;
  speechFixtureUrl: string;
};

/** PROVISIONAL wiring default (decisions/T_gap_provisional.md, D27) — never a gate, never cited as measured. */
export const T_GAP_PROVISIONAL_MS = 500;

export function buildInjectionTimeline(
  mode: CaptureMode,
  speechFixtureUrl: string,
  holdDurationMs: number = T_GAP_PROVISIONAL_MS,
): CaptureInjectionTimeline {
  return { mode, holdDurationMs, speechFixtureUrl };
}

/**
 * Mirrors `MIC_SILENCE_LEVEL_THRESHOLD` (frontend/src/app/services/mic-energy.ts:29).
 * The harness has no build-time dependency on the Angular frontend package, so this
 * is a literal mirror, not an import — keep it in sync by hand if the source value
 * changes; a silent drift here is a redteam-worthy finding.
 */
export const MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD = 0.01;

/**
 * Mirrors the `856104f` frozen-level variance check inside `classifyMicCapture`
 * (frontend/src/app/services/mic-energy.ts:188: `levelVariance < 0.005`).
 */
export const MIRRORED_LEVEL_VARIANCE_THRESHOLD = 0.005;

export type HoldPhaseSignature = 'frozen-nonzero' | 'silent' | 'neither';

/**
 * Classifies a WINDOW of per-tick RMS level readings — the same shape
 * `classifyMicCapture` consumes (a window of samples over time, never a single
 * instantaneous reading). Deliberately takes the already-windowed `levels` array
 * (not raw PCM) so the harness's notion of "frozen" stays structurally identical
 * to the app's: flat variance across the window decides frozen-vs-not; absolute
 * level then decides silent-vs-frozen-nonzero.
 */
export function classifyHoldPhaseSignature(
  levels: number[],
  opts?: { levelThreshold?: number; varianceThreshold?: number },
): HoldPhaseSignature {
  const levelThreshold = opts?.levelThreshold ?? MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD;
  const varianceThreshold = opts?.varianceThreshold ?? MIRRORED_LEVEL_VARIANCE_THRESHOLD;

  if (levels.length < 2) return 'neither';

  const maxLevel = Math.max(...levels);
  const minLevel = Math.min(...levels);
  const variance = maxLevel - minLevel;

  if (variance >= varianceThreshold) return 'neither';
  return maxLevel < levelThreshold ? 'silent' : 'frozen-nonzero';
}

/** Single-arg params shape required by Playwright's `page.addInitScript(fn, arg)`. */
export type ModeAInjectionParams = {
  frozenLevel: number;
  holdDurationMs: number;
  speechWavUrl: string;
};

export type ModeBInjectionParams = {
  holdDurationMs: number;
  speechWavUrl: string;
};

/**
 * Page-context function for `page.addInitScript(modeAInitScript, params)`. Must be
 * self-contained (Playwright serializes it into the page) — no closures over
 * anything outside its own argument, matching D19's `gumShimInitScript` contract.
 *
 * Wraps `getUserMedia` exactly like D19, but never touches the real captured
 * track's samples: for `holdDurationMs` it publishes a true DC `ConstantSourceNode`
 * (zero AC variance, `frozenLevel` offset) instead of the mic, then switches to a
 * decoded speech fixture. Mode A is a fully synthetic reproduction of the
 * frozen-stat bug, not an attenuation of real voice.
 */
export function modeAInitScript(params: ModeAInjectionParams): void {
  const mediaDevices = navigator.mediaDevices;
  const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);

  mediaDevices.getUserMedia = async function shimmedGetUserMedia(
    constraints?: MediaStreamConstraints,
  ): Promise<MediaStream> {
    const realStream = await originalGetUserMedia(constraints);
    const audioTracks = realStream.getAudioTracks();
    if (audioTracks.length === 0) return realStream;

    const AudioContextCtor =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('AudioContext unavailable; cannot apply Mode A injection');

    const audioContext = new AudioContextCtor();
    await audioContext.resume();
    const destination = audioContext.createMediaStreamDestination();

    const holdSource = audioContext.createConstantSource();
    holdSource.offset.value = params.frozenLevel;
    holdSource.connect(destination);
    holdSource.start();

    fetch(params.speechWavUrl)
      .then((response) => response.arrayBuffer())
      .then((buffer) => audioContext.decodeAudioData(buffer))
      .then((decoded) => {
        setTimeout(() => {
          holdSource.stop();
          holdSource.disconnect();
          const speechSource = audioContext.createBufferSource();
          speechSource.buffer = decoded;
          speechSource.loop = true;
          speechSource.connect(destination);
          speechSource.start();
        }, params.holdDurationMs);
      })
      .catch(() => {
        // Fixture unreachable: hold phase keeps playing indefinitely. This must
        // surface as a missing post-switch signature change in the caller's
        // measurement, never a silent swallow.
      });

    const shimmedAudioTrack = destination.stream.getAudioTracks()[0];
    const outputTracks: MediaStreamTrack[] = [shimmedAudioTrack, ...realStream.getVideoTracks()];
    return new MediaStream(outputTracks);
  };
}

/**
 * Page-context function for `page.addInitScript(modeBInitScript, params)`. Same
 * shape and self-containment contract as `modeAInitScript`, but the hold phase is
 * literal silence (`ConstantSourceNode` offset 0) instead of a non-zero constant —
 * reproducing the `micSilent=1` dead-mic pattern rather than the frozen-stat one.
 */
export function modeBInitScript(params: ModeBInjectionParams): void {
  const mediaDevices = navigator.mediaDevices;
  const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);

  mediaDevices.getUserMedia = async function shimmedGetUserMedia(
    constraints?: MediaStreamConstraints,
  ): Promise<MediaStream> {
    const realStream = await originalGetUserMedia(constraints);
    const audioTracks = realStream.getAudioTracks();
    if (audioTracks.length === 0) return realStream;

    const AudioContextCtor =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('AudioContext unavailable; cannot apply Mode B injection');

    const audioContext = new AudioContextCtor();
    await audioContext.resume();
    const destination = audioContext.createMediaStreamDestination();

    const holdSource = audioContext.createConstantSource();
    holdSource.offset.value = 0;
    holdSource.connect(destination);
    holdSource.start();

    fetch(params.speechWavUrl)
      .then((response) => response.arrayBuffer())
      .then((buffer) => audioContext.decodeAudioData(buffer))
      .then((decoded) => {
        setTimeout(() => {
          holdSource.stop();
          holdSource.disconnect();
          const speechSource = audioContext.createBufferSource();
          speechSource.buffer = decoded;
          speechSource.loop = true;
          speechSource.connect(destination);
          speechSource.start();
        }, params.holdDurationMs);
      })
      .catch(() => {
        // Fixture unreachable: hold phase (silence) keeps playing indefinitely —
        // must surface as a missing post-switch change, never a silent swallow.
      });

    const shimmedAudioTrack = destination.stream.getAudioTracks()[0];
    const outputTracks: MediaStreamTrack[] = [shimmedAudioTrack, ...realStream.getVideoTracks()];
    return new MediaStream(outputTracks);
  };
}
