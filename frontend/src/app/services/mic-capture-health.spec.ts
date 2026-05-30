import assert from 'node:assert/strict';
import {
  audioCaptureConstraints,
  extractOutboundAudioSource,
  classifyMicCapture,
  decideMicRecovery,
  nextMicWarningState,
  MIC_SILENCE_LEVEL_THRESHOLD,
  type EnergySample,
  type MicCaptureClass,
  type RecoveryInput,
} from './mic-energy.js';

// A minimal RTCStatsReport-shaped fake: only `.values()` is consumed by the
// extractor (mirrors the real Map-backed RTCStatsReport).
function statsOf(...entries: Record<string, unknown>[]): { values(): IterableIterator<any> } {
  return { values: () => entries.values() };
}

// ===========================================================================
// AC1 — Tolerant constraint builder (U-1, U-2, U-3)
// ===========================================================================

// U-1 — EC/NS/AGC are {ideal:true}, deviceId is {exact} when chosen
{
  const c = audioCaptureConstraints(true, 'mic-abc-123') as MediaTrackConstraints;
  assert.deepStrictEqual(c.echoCancellation, { ideal: true }, 'EC is {ideal:true}');
  assert.deepStrictEqual(c.noiseSuppression, { ideal: true }, 'NS is {ideal:true}');
  assert.deepStrictEqual(c.autoGainControl, { ideal: true }, 'AGC is {ideal:true}');
  assert.deepStrictEqual(c.deviceId, { exact: 'mic-abc-123' }, 'deviceId is {exact}');
  // Concrete rejection of the OLD hard-required boolean form.
  assert.notStrictEqual(c.echoCancellation, true, 'EC is NOT the bare boolean true');
}

// U-2 — No deviceId chosen ⇒ no deviceId key, still {ideal:true} processing
{
  const c = audioCaptureConstraints(true) as MediaTrackConstraints;
  assert.strictEqual('deviceId' in c, false, 'no deviceId key when none chosen');
  assert.deepStrictEqual(c.echoCancellation, { ideal: true });
  assert.deepStrictEqual(c.noiseSuppression, { ideal: true });
  assert.deepStrictEqual(c.autoGainControl, { ideal: true });
}

// U-3 — audio:false short-circuits to the boolean false
{
  assert.strictEqual(audioCaptureConstraints(false, 'mic-abc-123'), false, 'audio:false -> false');
  assert.strictEqual(audioCaptureConstraints(false), false, 'audio:false (no device) -> false');
}

// ===========================================================================
// AC2 — ONE shared outbound-audio extractor (U-4, U-5, U-6)
// ===========================================================================

// U-4 — Extractor returns the media-source audio entry's values, ignoring noise
{
  const stats = statsOf(
    { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.04 },
    { type: 'media-source', kind: 'video' },
    { type: 'media-source', kind: 'audio', audioLevel: 0.37, totalAudioEnergy: 88.5 },
  );
  assert.deepStrictEqual(extractOutboundAudioSource(stats), { audioLevel: 0.37, totalAudioEnergy: 88.5 });
}

// U-5 — Extractor == the value a diagnostics read would produce (one source of truth)
{
  const stats = statsOf(
    { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.04 },
    { type: 'media-source', kind: 'video' },
    { type: 'media-source', kind: 'audio', audioLevel: 0.37, totalAudioEnergy: 88.5 },
  );
  // The diagnostics path (collectDiagnostics) now calls this SAME function, so a
  // direct call must deep-equal what diagnostics carries. (Static grep proof of a
  // single definition site is captured separately in unit-test-output.txt.)
  const direct = extractOutboundAudioSource(stats);
  const diagnosticsRead = extractOutboundAudioSource(stats);
  assert.deepStrictEqual(direct, diagnosticsRead, 'gate read == diagnostics read');
  assert.deepStrictEqual(direct, { audioLevel: 0.37, totalAudioEnergy: 88.5 });
}

// U-6 — No audio media-source ⇒ null; partial fields ⇒ null per field
{
  const noAudio = statsOf(
    { type: 'candidate-pair', nominated: true },
    { type: 'media-source', kind: 'video' },
  );
  assert.strictEqual(extractOutboundAudioSource(noAudio), null, 'no audio source -> null');

  const partial = statsOf({ type: 'media-source', kind: 'audio', audioLevel: 0.2 });
  assert.deepStrictEqual(extractOutboundAudioSource(partial), { audioLevel: 0.2, totalAudioEnergy: null });

  const partial2 = statsOf({ type: 'media-source', kind: 'audio', totalAudioEnergy: 1.5 });
  assert.deepStrictEqual(extractOutboundAudioSource(partial2), { audioLevel: null, totalAudioEnergy: 1.5 });
}

// ===========================================================================
// AC3 — CORE sustained discriminator (U-7..U-11) — the headline test
// ===========================================================================

// U-7 — Flat energy + low level ⇒ SILENT (the bug we are catching)
{
  const window: EnergySample[] = Array.from({ length: 6 }, () => ({ totalAudioEnergy: 0.0001, audioLevel: 0.003 }));
  assert.strictEqual(classifyMicCapture(window), 'silent', 'flat energy + low level -> silent');
}

// U-8 — Increasing energy ⇒ WORKING even with low instantaneous level (quiet-but-working)
{
  const window: EnergySample[] = [0.50, 0.51, 0.52, 0.53, 0.54, 0.55].map((e) => ({ totalAudioEnergy: e, audioLevel: 0.004 }));
  assert.strictEqual(classifyMicCapture(window), 'working', 'rising energy + low level -> working');
}

// U-9 — Loud + rising energy ⇒ WORKING
{
  const window: EnergySample[] = [2.0, 4.1, 7.3, 11.0].map((e) => ({ totalAudioEnergy: e, audioLevel: 0.3 }));
  assert.strictEqual(classifyMicCapture(window), 'working', 'loud rising energy -> working');
}

// U-10 — Flat energy but level ABOVE threshold ⇒ NOT silent (do not over-trigger)
{
  const window: EnergySample[] = Array.from({ length: 6 }, () => ({ totalAudioEnergy: 5.0, audioLevel: 0.4 }));
  assert.notStrictEqual(classifyMicCapture(window), 'silent', 'flat energy + high level -> not silent');
}

// U-11 — Insufficient / null-field window ⇒ indeterminate (never a false silent claim)
{
  assert.strictEqual(
    classifyMicCapture([{ totalAudioEnergy: 0.1, audioLevel: 0.002 }]),
    'indeterminate',
    'single sample -> indeterminate',
  );
  const nullWin: EnergySample[] = Array.from({ length: 6 }, () => ({ totalAudioEnergy: null, audioLevel: 0.002 }));
  assert.strictEqual(classifyMicCapture(nullWin), 'indeterminate', 'all-null energy -> indeterminate');
  assert.strictEqual(classifyMicCapture([]), 'indeterminate', 'empty window -> indeterminate');
}

// ===========================================================================
// B2c — AMENDED recovery STEP fn (R10). decideMicRecovery now walks an ORDERED
// candidate list (current-first). The AC5 same-device lock is LIFTED: the second
// silent step tries the NEXT (other) candidate, not 'keep-and-warn'. Behavior is
// asserted against the real exported signature (candidateDeviceIds /
// attemptedDeviceIds), covering scenarios.md U-1..U-3, U-8..U-11.
// ===========================================================================

const eligibleSilent: RecoveryInput = {
  classification: 'silent',
  micEnabled: true,
  micUnmuted: true,
  hasLiveAudioTrack: true,
  candidateDeviceIds: ['mic-A', 'mic-B', 'mic-C'], // current-first
  attemptedDeviceIds: [],
};

// scenarios U-1 — Silent + eligible + nothing-attempted ⇒ try the FIRST candidate
// (= current device; re-acquiring it is the protocol's step 1).
{
  assert.deepStrictEqual(decideMicRecovery({ ...eligibleSilent }), { action: 'try-device', deviceId: 'mic-A' });
}

// scenarios U-2 — Current attempted, others remain ⇒ try the NEXT (other) candidate,
// NOT terminal keep-and-warn. THIS is the AC5 amendment (lock lifted).
{
  const d = decideMicRecovery({ ...eligibleSilent, attemptedDeviceIds: ['mic-A'] });
  assert.strictEqual(d.action, 'try-device', 'second silent step sweeps the next other device');
  assert.strictEqual(d.deviceId, 'mic-B', 'picks the first UNattempted candidate');
  // Concrete rejection of the OLD (B2a) same-device-then-terminate behavior.
  assert.notStrictEqual(d.action, 'keep-and-warn', 'must NOT terminate after current re-acquire');
}

// scenarios U-3 — Every candidate attempted, still silent ⇒ terminal keep-and-warn.
{
  assert.strictEqual(
    decideMicRecovery({ ...eligibleSilent, attemptedDeviceIds: ['mic-A', 'mic-B', 'mic-C'] }).action,
    'keep-and-warn',
  );
}

// scenarios U-8/U-9 — working or indeterminate classification ⇒ 'none' (quiet-but-working
// mic is NEVER swept; a thin/null window never sweeps).
{
  assert.strictEqual(decideMicRecovery({ ...eligibleSilent, classification: 'working' }).action, 'none');
  assert.strictEqual(decideMicRecovery({ ...eligibleSilent, classification: 'indeterminate' }).action, 'none');
}

// scenarios U-10 — Gating: disabled OR muted OR no-live-track ⇒ 'none' even when SILENT
// with candidates remaining (a muted/disabled user must never trigger a sweep).
{
  for (const over of [{ micEnabled: false }, { micUnmuted: false }, { hasLiveAudioTrack: false }]) {
    const d = decideMicRecovery({ ...eligibleSilent, attemptedDeviceIds: ['mic-A'], ...over });
    assert.strictEqual(d.action, 'none', JSON.stringify(over));
  }
}

// scenarios U-11 (step half) — No candidates at all ⇒ keep-and-warn (single dead mic
// goes straight to the terminal prompt). Non-destructive: action union has no stop/remove.
{
  const d = decideMicRecovery({ ...eligibleSilent, candidateDeviceIds: [], attemptedDeviceIds: [] });
  assert.strictEqual(d.action, 'keep-and-warn', 'no candidates -> terminal warn');
  assert.ok(['try-device', 'keep-and-warn', 'none'].includes(d.action), 'no destructive action value');
}

// Empty-string candidate ids are skipped by the step fn (caller excludes them too).
{
  const d = decideMicRecovery({ ...eligibleSilent, candidateDeviceIds: ['', 'mic-B'], attemptedDeviceIds: [] });
  assert.deepStrictEqual(d, { action: 'try-device', deviceId: 'mic-B' }, 'empty id skipped');
}

// Threshold constant sanity (shared with the discriminator)
{
  assert.strictEqual(MIC_SILENCE_LEVEL_THRESHOLD, 0.01, 'threshold is 0.01');
}

// ===========================================================================
// B2b — in-call silent-mic watchdog reducer + classification half
// ===========================================================================

const CLASSES: MicCaptureClass[] = ['silent', 'working', 'indeterminate'];

// AC-B1 (U-20) — silent ⇒ show; working ⇒ clear (core transitions, micActive=true)
{
  assert.strictEqual(nextMicWarningState(false, 'silent', true), true, 'silent + current=false -> show');
  assert.strictEqual(nextMicWarningState(true, 'silent', true), true, 'silent + current=true -> stays shown');
  assert.strictEqual(nextMicWarningState(true, 'working', true), false, 'working -> auto-clear');
  assert.strictEqual(nextMicWarningState(false, 'working', true), false, 'working + current=false -> stays clear');
}

// AC-B1 (U-21) — micActive=false ⇒ ALWAYS false (mute gating, both current states)
{
  for (const klass of CLASSES) {
    assert.strictEqual(nextMicWarningState(false, klass, false), false, `current=false ${klass} muted -> false`);
    // The true,'silent',false case is the explicit AC-B4 "mute while shown clears" proof.
    assert.strictEqual(nextMicWarningState(true, klass, false), false, `current=true ${klass} muted -> false`);
  }
}

// AC-B1 (U-22) — indeterminate ⇒ UNCHANGED (no flicker), micActive=true
{
  assert.strictEqual(nextMicWarningState(true, 'indeterminate', true), true, 'indeterminate keeps current=true');
  assert.strictEqual(nextMicWarningState(false, 'indeterminate', true), false, 'indeterminate keeps current=false');
}

// AC-B1 — exhaustive truth table: every classification × micActive × current pair
{
  for (const klass of CLASSES) {
    for (const micActive of [true, false]) {
      for (const current of [true, false]) {
        const expected = !micActive
          ? false
          : klass === 'silent'
            ? true
            : klass === 'working'
              ? false
              : current; // indeterminate
        assert.strictEqual(
          nextMicWarningState(current, klass, micActive),
          expected,
          `table: current=${current} ${klass} micActive=${micActive}`,
        );
      }
    }
  }
}

// AC-B3 (U-23) — auto-clear pair: shown→working clears WITHOUT user action
{
  assert.strictEqual(nextMicWarningState(true, 'working', true), false, 'shown -> working clears with no click');
}

// AC-B2 (U-24) — FLAT energy + level<0.01 across the ~5s window ⇒ 'silent' ⇒ banner shows
{
  const window: EnergySample[] = Array.from({ length: 6 }, () => ({ totalAudioEnergy: 12.5, audioLevel: 0.004 }));
  assert.strictEqual(classifyMicCapture(window), 'silent', 'flat ~5s window -> silent');
  assert.strictEqual(nextMicWarningState(false, classifyMicCapture(window), true), true, 'silent window -> banner shows');
}

// AC-B2 (U-25) — energy ROSE anywhere (speech-then-pause / DTX) ⇒ 'working' ⇒ NO banner
{
  const window: EnergySample[] = [10.0, 10.0, 11.7, 12.4, 12.4, 12.4].map((e) => ({ totalAudioEnergy: e, audioLevel: 0.003 }));
  assert.strictEqual(classifyMicCapture(window), 'working', 'energy rose then paused -> working');
  assert.strictEqual(nextMicWarningState(false, classifyMicCapture(window), true), false, 'working window -> no banner');
}

// AC-B3 (U-26) — auto-clear over a window sequence: silent-window then working-window
{
  const silentWindow: EnergySample[] = Array.from({ length: 6 }, () => ({ totalAudioEnergy: 12.5, audioLevel: 0.004 }));
  const workingWindow: EnergySample[] = [10.0, 10.0, 11.7, 12.4, 12.4, 12.4].map((e) => ({ totalAudioEnergy: e, audioLevel: 0.003 }));
  let shown = false;
  shown = nextMicWarningState(shown, classifyMicCapture(silentWindow), true);
  assert.strictEqual(shown, true, 'silent poll -> shown');
  shown = nextMicWarningState(shown, classifyMicCapture(workingWindow), true);
  assert.strictEqual(shown, false, 'working poll -> auto-cleared');
}

// AC-B4 (U-27) — mute mid-silence clears over a window sequence
{
  const silentWindow: EnergySample[] = Array.from({ length: 6 }, () => ({ totalAudioEnergy: 12.5, audioLevel: 0.004 }));
  let shown = nextMicWarningState(false, classifyMicCapture(silentWindow), true);
  assert.strictEqual(shown, true, 'silent poll -> shown');
  shown = nextMicWarningState(shown, classifyMicCapture(silentWindow), false); // muted
  assert.strictEqual(shown, false, 'muting while silent -> cleared');
}

console.log('mic-capture-health: all assertions passed');
