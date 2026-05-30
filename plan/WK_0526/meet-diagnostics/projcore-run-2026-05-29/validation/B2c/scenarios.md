# Scenarios: Batch B2c — Multi-device microphone fallback BEFORE warning (R10; AMENDS AC5)

**Batch**: B2c (third slice of B2; B2a landed @ b8fa5f7, B2b landed @ 1ba17b5)
**Requirement (verbatim, R10)**: "On confirmed sustained silence (mic enabled+unmuted), the app re-acquires the current device once, then automatically tries each OTHER available microphone and adopts the first that produces audio energy (switching to it and notifying the user which device). ONLY when NO available microphone produces energy does it surface the error prompt. Recovery stays non-destructive (never zero audio tracks) and bounded to one sweep per silence episode (no thrash)."
**User report (verbatim, JROM / NS11)**: "ok, can we use a fallback of the other available mics when one mic fails and when there is non just prompt the user about the error"
**North-star anchors**: NS11 (this batch — multi-device fallback AMENDS AC5; reuse `classifyMicCapture` + `getOutboundAudioSource`, NO new meter), NS9 (root-cause in OUR capture path), NS5 (WebRTC mic can't be e2e'd headless ⇒ pure unit/integration tests carry the proof + manual localhost:4700; Chrome fake-media emits a TONE on ALL fake inputs ⇒ the multi-device ADOPTION path is NOT Playwright-able and is MANUAL), NS4 (deferral OFF — each slice finishes, no shims/double-warn).
**Branch**: feat/meet-diagnostics-audio-20260529 (B2c commits ON TOP of 1ba17b5)
**Written**: 2026-05-30
**Scope**: B2c ONLY — the multi-device sweep that sits BETWEEN B2a's "re-acquire same device once" and the "keep + warn" terminal. Reuses B2a's pure `classifyMicCapture()` + `getOutboundAudioSource()` + `media.service.ts:replaceAudioTrack()` (non-destructive) + the single B2b `micSilentWarning` banner surface. Does NOT re-open B2a's constraints/extractor, does NOT touch the B2b reducer's truth table, does NOT touch B3/B4/B5/B6, SFU/transport, or auth.

---

## What B2c implements (the OUTCOMES these scenarios assert — NOT implementing here)

R10 **AMENDS** B2a's AC5 (which LOCKED recovery to the SAME device only — `decideMicRecovery` at `mic-energy.ts:196` returns `reacquire-same-device` then `keep-and-warn`, never a different concrete device). That same-device lock is now **LIFTED**. The new recovery protocol, shared by BOTH the join-time gate (`verifyInitialCaptureEnergy`, room.page.ts:2260) and the in-call watchdog (`pollMicSilenceWatchdog`, room.page.ts:2481):

1. **Re-acquire the CURRENT device once** (relaxed constraints) — the existing B2a transient/constraint catch (unchanged step 1).
2. **Still silent ⇒ SWEEP the OTHER available `audioinput` devices** — iterate the remaining enumerated mics, acquire each NON-DESTRUCTIVELY via `replaceAudioTrack`, re-sample + classify with the EXISTING `classifyMicCapture`, and ADOPT the FIRST candidate that classifies `'working'` (switch to it). Stop the sweep on first success.
3. **On adoption** — update `selectedAudioId` + PERSIST (`storeDevice(DEVICE_STORAGE.audioInput, ...)`, the `changeAudioDevice` convention at room.page.ts:786) + notify the user WHICH device. No silent switch.
4. **NO device produces energy ⇒ KEEP a live track + RESTORE the originally-selected device + persistent error prompt.** Non-destructive throughout (audio tracks never reach zero); the `micSilentWarning` banner (the single B2b surface) shows, "Switch microphone" still opens the picker.
5. **Bounded: EXACTLY ONE full sweep per silence episode.** Re-arm only after energy RETURNS (`'working'`) then DROPS again. Muted/disabled ⇒ no sweep. No thrash.
6. **Candidate hygiene** — dedupe by `deviceId` AND `groupId` (the `'default'`/`'communications'` aliases collapse to their physical twin), skip an already-failed candidate, and skip a throwing/null `replaceAudioTrack` candidate (not fatal — sweep continues).

The notify copy is load-bearing (see Copy Lock below). The sweep is the NEW middle phase; B2a's step 1 and B2b's banner/auto-clear are reused unchanged.

### Copy Lock (load-bearing — flag for implementer + reviewer)
- **Adoption notice** (a different device produced energy): exactly **`"Switched to <label> — your previous microphone had no sound"`** where `<label>` is the adopted device's `MediaDeviceInfo.label` (fallback to `track.label` when the label is empty, per the existing `recoveryNotice` convention at room.page.ts:2397). Surfaced as a NON-blocking notice (the `actionNotice`/`.device-notice` pattern), NOT the error banner.
- **Terminal error prompt** (NO device produced energy): exactly **`"No working microphone detected — check your mic/permissions"`**, rendered through the single B2b `micSilentWarning` surface (one silent-mic banner; the "Switch microphone" action button still calls `openInCallDeviceDialog()`).
- If the impl's rendered strings differ, the test report MUST quote the EXACT rendered string and the reviewer verifies it against this lock. The non-negotiables are: (a) the adoption notice NAMES the adopted device, and (b) the terminal prompt is the SINGLE `micSilentWarning` surface (no second simultaneous silent-mic banner).

---

## Pure-function contracts under test (the deterministic proof per NS5)

The deterministic proof is **UNIT/INTEGRATION level**. The implementation MUST expose these as framework-free, DOM-free, AudioContext-free, timer-free pure functions/orchestrators (mirrors B2a's `mic-capture-health.spec.ts` + `mic-energy.spec.ts`). Names are guidance; assertions target observable input→output. (If the impl folds these together, that is fine — assert behavior, and the test report maps the chosen export names.)

```ts
// (1) AMENDED recovery STEP function — the per-step decision (extends decideMicRecovery).
//     'sweep-other-devices' is the NEW action between 'reacquire-same-device' and 'keep-and-warn'.
type RecoveryPhase = 'reacquire-same-device' | 'sweep-other-devices' | 'keep-and-warn' | 'none';
//     reacquireAttempted/sweepAttempted are the bounded one-shot guards (per episode).
nextMicRecoveryStep(input: {
  classification: 'silent' | 'working' | 'indeterminate';
  micEnabled: boolean;        // track.enabled
  micUnmuted: boolean;        // !track.muted
  hasLiveAudioTrack: boolean; // track exists AND readyState === 'live'
  reacquireAttempted: boolean;
  sweepAttempted: boolean;
  selectedDeviceId: string | undefined;
}): { action: RecoveryPhase; deviceId: string | undefined };

// (2) PURE sweep orchestrator — iterates candidates, calls an INJECTED acquire fn
//     (replaceAudioTrack MOCKED) + an INJECTED classify fn over the re-sampled window,
//     adopts the first 'working', restores the original on total failure. No DOM/timers.
type SweepCandidate = { deviceId: string | undefined; groupId?: string; label: string };
type SweepResult =
  | { outcome: 'adopted'; deviceId: string | undefined; label: string }
  | { outcome: 'none-working'; restoredDeviceId: string | undefined }; // restore original
runMicSweep(args: {
  originalDeviceId: string | undefined;
  candidates: SweepCandidate[];                  // OTHER devices (sweep order)
  acquire: (deviceId: string | undefined) => Promise<MediaStreamTrack | null>; // MOCK: throw|null|track
  classifyAcquired: (track: MediaStreamTrack) => 'silent' | 'working' | 'indeterminate'; // MOCK
}): Promise<SweepResult>;

// (3) PURE sweep-GATE reducer — bounds to ONE sweep per silence episode; re-arms only
//     after energy returns then drops again. micActive=false ⇒ disarmed.
type SweepGate = { swept: boolean; armed: boolean }; // armed=true means a fresh sweep may run
nextSweepGate(
  current: SweepGate,
  classification: 'silent' | 'working' | 'indeterminate',
  micActive: boolean,
): SweepGate;

// (4) PURE candidate builder/deduper — collapses 'default'/'communications' aliases to the
//     physical twin (by groupId), dedupes by deviceId, drops the current + already-failed,
//     drops empty/blank deviceIds. Reuses the deviceCandidates dedup convention (room.page.ts:2381).
buildSweepCandidates(args: {
  currentDeviceId: string | undefined;
  devices: { deviceId: string; groupId?: string; label: string }[];
  failed: Set<string | undefined>;
}): SweepCandidate[];
```

> Non-negotiables: **(a)** ZERO new `new AudioContext` / `AnalyserNode` / `createMediaStreamSource` introduced — reuse `getOutboundAudioSource` + `classifyMicCapture`; **(b)** the sweep orchestrator + step fn + gate reducer + candidate builder are PURE and node-runnable; **(c)** `replaceAudioTrack` stays the only acquire path (non-destructive: adds the new track before removing the old, returns null without harming the old — media.service.ts:88) and the sweep NEVER calls the destructive `removeAudioTrack()` (room.page.ts:2242).

---

## Acceptance Criteria → Proof Map (Batch B2c)

| AC | What it asserts | Proof type | Scenarios |
|----|-----------------|-----------|-----------|
| AC-C1 | AMENDS AC5: confirmed silence ⇒ re-acquire CURRENT once; STILL silent ⇒ `sweep-other-devices` (NOT terminal `keep-and-warn` yet). The same-device lock is LIFTED. | **Unit (pure step fn)** | U-1, U-2, U-3 |
| AC-C2 | Sweep adopts the FIRST candidate whose acquired track classifies `'working'`; stops sweeping on first success; later candidates not acquired | **Unit (pure orchestrator, mock acquire/classify)** | U-4, U-5 |
| AC-C3 | On adoption: result names the adopted device ⇒ wiring sets+persists `selectedAudioId` (`storeDevice`) + shows the "Switched to <label>…" notice. No silent switch. | **Unit (orchestrator)** + **Static/wiring** + **MANUAL** | U-4, U-12, U-13 + M-1 |
| AC-C4 | NO candidate works ⇒ `none-working` + RESTORE original device + KEEP a live track (count never 0) + terminal `micSilentWarning` "No working microphone detected…" | **Unit (orchestrator)** + **Static/wiring** + **MANUAL** | U-6, U-7, U-14 + M-2 |
| AC-C5 | Quiet-but-WORKING mic (rising cumulative energy, level<0.01) is NEVER swept/switched (U-8 of B2a preserved) | **Unit (pure, reuses classify + step fn)** | U-8, U-9 |
| AC-C6 | Bounded: EXACTLY one full sweep per silence episode; re-arm only after `'working'` then `'silent'` again; muted/disabled ⇒ no sweep (gate reducer) | **Unit (pure gate reducer)** + **MANUAL** | U-15..U-19 + M-3 |
| AC-C7 | Candidate hygiene: dedupe by deviceId AND groupId ('default'/'communications' alias collapses to physical twin); already-failed skipped; throwing/null candidate skipped (not fatal) | **Unit (pure builder + orchestrator)** | U-10, U-11, U-20, U-21 |
| AC-C8 | Non-destructive throughout: sweep uses `replaceAudioTrack` only, never `removeAudioTrack`; audio-track count never 0 across the whole protocol | **Static/wiring** + **MANUAL** | U-22 + M-1, M-2 |

**Unit-provable (deterministic, node/tsx):** AC-C1 (step fn), AC-C2/C3-orchestration/C4-orchestration (`runMicSweep` with MOCKED acquire/classify — inject throw/null/silent/working candidates), AC-C5 (quiet-but-working preserved), AC-C6 (`nextSweepGate`), AC-C7 (`buildSweepCandidates` + orchestrator skip behavior). These carry the proof per NS5.

**Static/wiring (code review + grep + green build):** AC-C3 persistence + notice copy, AC-C4 restore + single-surface terminal prompt, AC-C8 non-destructive (`replaceAudioTrack` only, no `removeAudioTrack` in the sweep path).

**MANUAL-only (live, localhost:4700, NS5):** the live multi-device ADOPTION end-to-end. **Chrome fake-media emits a TONE on ALL fake inputs**, so every fake mic classifies `'working'` ⇒ the "current silent, OTHER device adopted" path **cannot be forced headless** and is **NOT** Playwright-able. M-1/M-2/M-3 are **MANUAL-PENDING localhost:4700 (USER seat)** — the test report must NOT fabricate a fake-media adoption result; it carries them as MANUAL with a real second physical mic.

---

## Unit Scenarios (U-*) — deterministic, node/tsx

**Run** (mirror B2a/B2b): `cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/<spec>.spec.ts` using `import assert from 'node:assert/strict'` and a terminal `console.log('<module>: all assertions passed')`. Suggested spec file: `mic-sweep.spec.ts` (sibling of `mic-capture-health.spec.ts`). Build MUST stay green: `cd frontend && npm run build` (NS5). The mocked `MediaStreamTrack` may be a minimal stub `{ readyState:'live', enabled:true, muted:false, label:'<x>' } as unknown as MediaStreamTrack`.

### --- AC-C1: AMENDS AC5 — silence ⇒ reacquire-same → SWEEP (not terminal) ---  [UNIT]

### U-1 — Silent + eligible + nothing-attempted ⇒ `reacquire-same-device` (step 1 unchanged)
**Given** `nextMicRecoveryStep({ classification:'silent', micEnabled:true, micUnmuted:true, hasLiveAudioTrack:true, reacquireAttempted:false, sweepAttempted:false, selectedDeviceId:'mic-A' })`
**Then** `{ action:'reacquire-same-device', deviceId:'mic-A' }` — the existing B2a transient catch fires first.
```
assert.deepStrictEqual(
  nextMicRecoveryStep({classification:'silent',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,reacquireAttempted:false,sweepAttempted:false,selectedDeviceId:'mic-A'}),
  { action:'reacquire-same-device', deviceId:'mic-A' });
```

### U-2 — Re-acquire done, STILL silent ⇒ `sweep-other-devices` (the AC5 amendment — LOCK LIFTED)
**Given** the same SILENT input but `reacquireAttempted:true, sweepAttempted:false`
**Then** `action === 'sweep-other-devices'` — NOT `'keep-and-warn'`. This is the new behavior R10 introduces: before B2c the second silent pass terminated at `keep-and-warn`.
```
const d = nextMicRecoveryStep({classification:'silent',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,reacquireAttempted:true,sweepAttempted:false,selectedDeviceId:'mic-A'});
assert.strictEqual(d.action, 'sweep-other-devices');
```
**Concrete rejection of the OLD (B2a) behavior**: `assert.notStrictEqual(d.action, 'keep-and-warn')` for THIS input (re-acquire done, sweep not yet attempted). The pre-B2c `decideMicRecovery` returned `keep-and-warn` here.

### U-3 — Re-acquire done AND sweep done, STILL silent ⇒ terminal `keep-and-warn`
**Given** SILENT with `reacquireAttempted:true, sweepAttempted:true`
**Then** `action === 'keep-and-warn'` — the terminal error prompt phase, reached ONLY after the sweep also failed.
```
assert.strictEqual(
  nextMicRecoveryStep({classification:'silent',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,reacquireAttempted:true,sweepAttempted:true,selectedDeviceId:'mic-A'}).action,
  'keep-and-warn');
```

### --- AC-C2 / AC-C3: Sweep adopts the FIRST working candidate ---  [UNIT]

### U-4 — First candidate silent, SECOND working ⇒ adopt the second, stop sweeping
**Given** `runMicSweep` with `originalDeviceId:'mic-A'`, candidates `[{deviceId:'mic-B',label:'USB Mic'},{deviceId:'mic-C',label:'Webcam Mic'}]`, a mocked `acquire` that returns a live stub track for each, and a mocked `classifyAcquired` that returns `'silent'` for the mic-B track and `'working'` for the mic-C track
**Then** the result is `{ outcome:'adopted', deviceId:'mic-C', label:'Webcam Mic' }`.
```
const calls:(string|undefined)[] = [];
const res = await runMicSweep({
  originalDeviceId:'mic-A',
  candidates:[{deviceId:'mic-B',label:'USB Mic'},{deviceId:'mic-C',label:'Webcam Mic'}],
  acquire: async (id) => { calls.push(id); return {readyState:'live',enabled:true,muted:false,label:String(id)} as any; },
  classifyAcquired: (t:any) => t.label==='mic-C' ? 'working' : 'silent',
});
assert.deepStrictEqual(res, { outcome:'adopted', deviceId:'mic-C', label:'Webcam Mic' });
assert.deepStrictEqual(calls, ['mic-B','mic-C']); // tried B (silent) then C (working)
```

### U-5 — First candidate working ⇒ adopt it, NEVER acquire later candidates (stop on first success)
**Given** the same shape but `classifyAcquired` returns `'working'` for the FIRST candidate (mic-B)
**Then** result `{ outcome:'adopted', deviceId:'mic-B', ... }` and `acquire` was called for mic-B ONLY — mic-C is never acquired (no needless thrash).
```
const calls:(string|undefined)[] = [];
const res = await runMicSweep({originalDeviceId:'mic-A',candidates:[{deviceId:'mic-B',label:'USB'},{deviceId:'mic-C',label:'Cam'}],
  acquire: async(id)=>{calls.push(id); return {readyState:'live',label:String(id)} as any;},
  classifyAcquired: ()=> 'working'});
assert.strictEqual(res.outcome,'adopted');
assert.strictEqual((res as any).deviceId,'mic-B');
assert.deepStrictEqual(calls, ['mic-B']); // stopped on first success
```

### --- AC-C4: No candidate works ⇒ none-working + RESTORE original ---  [UNIT]

### U-6 — Every candidate silent ⇒ `none-working`, restores the ORIGINAL device
**Given** `runMicSweep` with `originalDeviceId:'mic-A'`, candidates `[mic-B, mic-C]`, `acquire` returns a live track for each, `classifyAcquired` returns `'silent'` for ALL
**Then** result is `{ outcome:'none-working', restoredDeviceId:'mic-A' }` and the LAST `acquire` call re-targets `'mic-A'` (the original is re-acquired so the kept live track is the user's chosen device, not whichever candidate happened to be last).
```
const calls:(string|undefined)[] = [];
const res = await runMicSweep({originalDeviceId:'mic-A',candidates:[{deviceId:'mic-B',label:'B'},{deviceId:'mic-C',label:'C'}],
  acquire: async(id)=>{calls.push(id); return {readyState:'live',label:String(id)} as any;},
  classifyAcquired: ()=> 'silent'});
assert.deepStrictEqual(res, { outcome:'none-working', restoredDeviceId:'mic-A' });
assert.strictEqual(calls[calls.length-1], 'mic-A'); // original restored last
```

### U-7 — none-working NEVER yields zero tracks: a live track is always present at exit
**Given** the all-silent sweep of U-6
**Then** the orchestrator's final `acquire` (the restore) returned a non-null live track — the protocol exits holding a track. Assert the restore call resolved to a live track (the mock returns one) and the result discriminant is `none-working` (NOT an outcome that implies a stopped/removed track).
```
let lastTrack:any = 'unset';
await runMicSweep({originalDeviceId:'mic-A',candidates:[{deviceId:'mic-B',label:'B'}],
  acquire: async(id)=>{ lastTrack = {readyState:'live',label:String(id)}; return lastTrack as any; },
  classifyAcquired: ()=> 'silent'});
assert.strictEqual(lastTrack.readyState, 'live'); // a live track is held at exit
```
> Non-destructive invariant lives in `replaceAudioTrack` (media.service.ts:88, adds-before-removes). The orchestrator must NOT return a "removed/zero-track" outcome — the `SweepResult` union has no such value. U-22 + M-2 confirm the live wiring keeps `getAudioTracks().length >= 1`.

### --- AC-C5: Quiet-but-working mic is NEVER swept (B2a U-8 preserved) ---  [UNIT]

### U-8 — Rising cumulative energy + level<0.01 ⇒ `classifyMicCapture`='working' ⇒ step fn 'none' (no sweep)
**Given** a window with monotonically rising `totalAudioEnergy` (`0.50,0.51,0.52,0.53,0.54,0.55`) and `audioLevel:0.004` each (below 0.01), classified by the UNCHANGED B2a `classifyMicCapture`
**Then** classification is `'working'`, and `nextMicRecoveryStep` with that classification (all other fields recovery-eligible) returns `action:'none'` — a quiet-but-capturing mic is NEVER swept or switched.
```
const win = [0.50,0.51,0.52,0.53,0.54,0.55].map(e=>({totalAudioEnergy:e,audioLevel:0.004}));
assert.strictEqual(classifyMicCapture(win), 'working');
assert.strictEqual(
  nextMicRecoveryStep({classification:'working',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,reacquireAttempted:true,sweepAttempted:false,selectedDeviceId:'mic-A'}).action,
  'none');
```
> This is the LOCKED B2a boundary (its U-8) carried forward: the AC5 amendment must NOT widen the trigger. Only `classifyMicCapture==='silent'` is ever sweep-eligible.

### U-9 — `indeterminate` classification ⇒ step fn 'none' (never sweep on a thin/null window)
**Given** `classification:'indeterminate'` (insufficient/null-field window — B2a returns this literal, NOT `'unknown'`), all other fields eligible
**Then** `action:'none'`.
```
assert.strictEqual(
  nextMicRecoveryStep({classification:'indeterminate',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,reacquireAttempted:true,sweepAttempted:false,selectedDeviceId:'mic-A'}).action,
  'none');
```

### --- AC-C7 (gating part): muted/disabled/no-track ⇒ no sweep ---  [UNIT]

### U-10 — disabled OR muted OR no-live-track ⇒ step fn 'none' even when SILENT + reacquire-done
**Given** SILENT classification, `reacquireAttempted:true, sweepAttempted:false`, but one gate false
**Then** `action:'none'` for each — a muted/disabled user is intentionally silent and must NEVER trigger a sweep.
```
for (const over of [{micEnabled:false},{micUnmuted:false},{hasLiveAudioTrack:false}]) {
  const d = nextMicRecoveryStep({classification:'silent',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,reacquireAttempted:true,sweepAttempted:false,selectedDeviceId:'mic-A',...over});
  assert.strictEqual(d.action, 'none', JSON.stringify(over));
}
```
> Matches B2a's U-15 gating convention; the sweep inherits the same gate.

### U-11 — No OTHER devices to sweep (only the current mic enumerated) ⇒ straight to terminal
**Given** `buildSweepCandidates({currentDeviceId:'mic-A', devices:[{deviceId:'mic-A',groupId:'g1',label:'A'}], failed:new Set()})`
**Then** returns `[]` (no other devices). The orchestrator over `[]` returns `{ outcome:'none-working', restoredDeviceId:'mic-A' }` WITHOUT acquiring anything new beyond the restore, and the wiring goes terminal (warn). A single-mic machine with one dead mic shows the error prompt — exactly the "when there is none, just prompt" half of JROM's ask.
```
assert.deepStrictEqual(buildSweepCandidates({currentDeviceId:'mic-A',devices:[{deviceId:'mic-A',groupId:'g1',label:'A'}],failed:new Set()}), []);
```

### --- AC-C6: Bounded to ONE sweep per episode (gate reducer) ---  [UNIT]

### U-12 — Adoption result carries the device id + label for the persist+notify wiring
**Given** the adopted result of U-4 (`{outcome:'adopted',deviceId:'mic-C',label:'Webcam Mic'}`)
**Then** both `deviceId` and a non-empty `label` are present so the wiring can `storeDevice(...)` AND build the "Switched to <label> …" notice. Assert the adopted result has a string `deviceId` and a non-empty `label`.
```
const res = await runMicSweep({originalDeviceId:'mic-A',candidates:[{deviceId:'mic-C',label:'Webcam Mic'}],
  acquire: async(id)=>({readyState:'live',label:String(id)} as any), classifyAcquired: ()=> 'working'});
assert.strictEqual(res.outcome,'adopted');
assert.strictEqual(typeof (res as any).deviceId, 'string');
assert.ok((res as any).label && (res as any).label.length > 0);
```
> The persist call (`storeDevice(DEVICE_STORAGE.audioInput, deviceId)`) and the `selectedAudioId.set(...)` are WIRING (U-13, code review) — the orchestrator just supplies the adopted id+label.

### U-15 — Gate: first SILENT episode arms+consumes ONE sweep; a SECOND silent poll does NOT re-sweep
**Given** `nextSweepGate` starting `{ swept:false, armed:true }`
**When** a `'silent'` poll arrives (micActive=true) ⇒ the sweep runs once ⇒ gate becomes `{ swept:true, armed:false }`; a subsequent `'silent'` poll keeps `swept:true, armed:false`
**Then** no second sweep is permitted within the same silence episode.
```
let g = { swept:false, armed:true };
g = nextSweepGate(g, 'silent', true);   // sweep consumed
assert.deepStrictEqual(g, { swept:true, armed:false });
g = nextSweepGate(g, 'silent', true);   // still silent — must NOT re-arm
assert.deepStrictEqual(g, { swept:true, armed:false });
```
> Exact field names are guidance; assert the OBSERVABLE invariant: a "may-sweep-now" predicate is true for the FIRST silent poll and false for every subsequent silent poll until a re-arm.

### U-16 — Re-arm: energy RETURNS ('working') then DROPS ('silent') again ⇒ a NEW sweep is allowed
**Given** the gate is `{ swept:true, armed:false }` (already swept this episode)
**When** a `'working'` poll arrives (energy returned) ⇒ gate re-arms `{ swept:false, armed:true }`; THEN a `'silent'` poll ⇒ a new sweep is permitted/consumed
**Then** exactly one NEW sweep is allowed for the new silence episode.
```
let g = { swept:true, armed:false };
g = nextSweepGate(g, 'working', true);   // energy returned -> re-arm
assert.deepStrictEqual(g, { swept:false, armed:true });
g = nextSweepGate(g, 'silent', true);    // new episode -> sweep consumed
assert.deepStrictEqual(g, { swept:true, armed:false });
```

### U-17 — `indeterminate` poll ⇒ gate UNCHANGED (no flicker, no re-arm)
**Given** any gate state, an `'indeterminate'` poll (micActive=true)
**Then** the gate is returned unchanged — a thin/null window neither re-arms nor consumes a sweep.
```
assert.deepStrictEqual(nextSweepGate({swept:true,armed:false},'indeterminate',true), {swept:true,armed:false});
assert.deepStrictEqual(nextSweepGate({swept:false,armed:true},'indeterminate',true), {swept:false,armed:true});
```

### U-18 — Muted/disabled (micActive=false) ⇒ gate DISARMED, no sweep
**Given** `micActive=false` (muted/disabled) with any classification
**Then** the gate is disarmed (`armed:false`) — a muted user never sweeps, mirroring B2b's reducer mute-gate.
```
for (const k of ['silent','working','indeterminate'] as const) {
  const g = nextSweepGate({swept:false,armed:true}, k, false);
  assert.strictEqual(g.armed, false, k);
}
```

### U-19 — Mute does NOT permanently consume the sweep budget: unmute + silent ⇒ a fresh sweep
**Given** gate `{swept:false,armed:true}`, then a muted poll disarms it; then the user UNMUTES and the window is still `'silent'`
**Then** the gate re-arms on unmute such that the first post-unmute silent poll may sweep once (mute is a pause, not a permanent consume). Assert: after `false`(muted) then a `'silent'` micActive=true poll, a sweep is permitted exactly once.
```
let g = { swept:false, armed:true };
g = nextSweepGate(g, 'silent', false);  // muted -> disarmed, NOT swept
assert.strictEqual(g.swept, false);
g = nextSweepGate(g, 'silent', true);   // unmuted, still silent -> sweep consumed once
assert.deepStrictEqual(g, { swept:true, armed:false });
```
> If the impl models mute differently (e.g. armed stays true while muted but `micActive` separately gates execution), assert the OBSERVABLE: muted never sweeps (U-18) AND a post-unmute silent episode still gets exactly one sweep.

### --- AC-C7: Candidate hygiene — dedupe by deviceId AND groupId, skip failed/throwing ---  [UNIT]

### U-20 — Dedupe: 'default'/'communications' aliases collapse to their physical groupId twin; current excluded
**Given** `buildSweepCandidates({ currentDeviceId:'mic-A', devices:[{deviceId:'default',groupId:'gB',label:'Default - USB'},{deviceId:'mic-B',groupId:'gB',label:'USB Mic'},{deviceId:'communications',groupId:'gB',label:'Communications - USB'},{deviceId:'mic-A',groupId:'gA',label:'Built-in'},{deviceId:'mic-C',groupId:'gC',label:'Webcam'}], failed:new Set() })`
**Then** the returned candidates contain the USB mic (group `gB`) EXACTLY ONCE and the webcam (`gC`) once, and DO NOT contain `mic-A` (the current device) nor a separate `'default'`/`'communications'` duplicate of `gB`. Concretely: exactly 2 candidates, one per physical group `gB` and `gC`.
```
const cands = buildSweepCandidates({currentDeviceId:'mic-A',devices:[
  {deviceId:'default',groupId:'gB',label:'Default - USB'},
  {deviceId:'mic-B',groupId:'gB',label:'USB Mic'},
  {deviceId:'communications',groupId:'gB',label:'Communications - USB'},
  {deviceId:'mic-A',groupId:'gA',label:'Built-in'},
  {deviceId:'mic-C',groupId:'gC',label:'Webcam'}], failed:new Set()});
const groups = cands.map(c=>c.groupId);
assert.strictEqual(cands.length, 2);                       // gB collapsed to one, gC one
assert.ok(!cands.some(c=>c.deviceId==='mic-A'));           // current excluded
assert.strictEqual(new Set(groups).size, 2);               // no duplicate physical group
assert.ok(groups.includes('gB') && groups.includes('gC'));
```
> Reuses the existing `deviceCandidates` dedup-by-deviceId convention (room.page.ts:2381-2394) extended with groupId collapse. The `'default'` alias must not be tried as if it were a distinct physical mic from its twin.

### U-21 — Already-failed candidate is skipped (no re-try within the episode)
**Given** `buildSweepCandidates` with `failed:new Set(['mic-B'])` over devices including `mic-B` and `mic-C`
**Then** the returned candidates EXCLUDE `mic-B` (and its group aliases) — a mic that already failed this episode is not re-acquired.
```
const cands = buildSweepCandidates({currentDeviceId:'mic-A',devices:[
  {deviceId:'mic-A',groupId:'gA',label:'A'},{deviceId:'mic-B',groupId:'gB',label:'B'},{deviceId:'mic-C',groupId:'gC',label:'C'}],
  failed:new Set(['mic-B'])});
assert.ok(!cands.some(c=>c.deviceId==='mic-B'));
assert.ok(cands.some(c=>c.deviceId==='mic-C'));
```

### --- AC-C7 (orchestrator robustness): throwing/null candidate is non-fatal ---  [UNIT]

> Adoption persistence + notice wiring is U-13, terminal-prompt wiring is U-14, non-destructive grep is U-22 — all in the Static/Wiring section below.

### U-23 — A candidate whose `acquire` THROWS is skipped; sweep continues to the next
**Given** `runMicSweep` over `[mic-B, mic-C]` where `acquire('mic-B')` THROWS and `acquire('mic-C')` returns a `'working'` track
**Then** the throw is swallowed (not fatal), mic-B is treated as failed, and the result adopts mic-C.
```
const res = await runMicSweep({originalDeviceId:'mic-A',candidates:[{deviceId:'mic-B',label:'B'},{deviceId:'mic-C',label:'C'}],
  acquire: async(id)=>{ if(id==='mic-B') throw new Error('OverconstrainedError'); return {readyState:'live',label:String(id)} as any; },
  classifyAcquired: ()=> 'working'});
assert.deepStrictEqual(res, { outcome:'adopted', deviceId:'mic-C', label:'C' });
```

### U-24 — A candidate whose `acquire` returns NULL is skipped; sweep continues
**Given** `runMicSweep` over `[mic-B, mic-C]` where `acquire('mic-B')` resolves `null` (replaceAudioTrack returns null without harming the old track — media.service.ts:96-99) and `acquire('mic-C')` returns a `'working'` track
**Then** mic-B is skipped (no classify call on a null track) and mic-C is adopted.
```
const classifyCalls:any[] = [];
const res = await runMicSweep({originalDeviceId:'mic-A',candidates:[{deviceId:'mic-B',label:'B'},{deviceId:'mic-C',label:'C'}],
  acquire: async(id)=> id==='mic-B' ? null : ({readyState:'live',label:String(id)} as any),
  classifyAcquired: (t:any)=>{ classifyCalls.push(t); return 'working'; }});
assert.deepStrictEqual(res, { outcome:'adopted', deviceId:'mic-C', label:'C' });
assert.strictEqual(classifyCalls.length, 1); // null track was NOT classified
```

### U-25 — ALL candidates throw/null ⇒ `none-working` + restore original (robustness terminal)
**Given** every candidate's `acquire` throws or returns null
**Then** result `{ outcome:'none-working', restoredDeviceId:'mic-A' }` and the original is restored — total failure is graceful, never an unhandled rejection, never zero tracks.
```
const res = await runMicSweep({originalDeviceId:'mic-A',candidates:[{deviceId:'mic-B',label:'B'},{deviceId:'mic-C',label:'C'}],
  acquire: async(id)=>{ if(id==='mic-B') throw new Error('x'); if(id==='mic-C') return null; return {readyState:'live',label:String(id)} as any; },
  classifyAcquired: ()=> 'working'});
assert.strictEqual(res.outcome,'none-working');
assert.strictEqual((res as any).restoredDeviceId,'mic-A');
```

---

## Static / Wiring Scenarios (U-* code-review + grep + build)

> Cannot be node-asserted (Angular signals, persistence, template, the destructive-path guard). Verified by code review + the grep commands + a green `cd frontend && npm run build`. Each lists the SPECIFIC assertion the reviewer checks.

### U-13 — Adoption WIRING: `selectedAudioId` set + PERSISTED + "Switched to <label>…" notice
**Verification** (code review + grep):
- On a `runMicSweep` `'adopted'` result, BOTH gate callers (`verifyInitialCaptureEnergy` room.page.ts:2260 AND `pollMicSilenceWatchdog` room.page.ts:2481) update `this.selectedAudioId.set(<adopted id>)` and PERSIST via `storeDevice(DEVICE_STORAGE.audioInput, <adopted id>)` — the SAME persistence the user-driven `changeAudioDevice` uses (room.page.ts:785-786). No silent switch: the adopted device is the new selected+persisted device.
- A NON-blocking notice with the exact copy `"Switched to <label> — your previous microphone had no sound"` is surfaced (the `actionNotice`/`.device-notice` pattern), `<label>` = adopted device label (fallback to `track.label`). Grep:
  ```
  grep -nE "Switched to|your previous microphone had no sound|storeDevice\(DEVICE_STORAGE.audioInput" frontend/src/app/pages/room/room.page.ts
  ```
  must show the adoption copy AND a `storeDevice(DEVICE_STORAGE.audioInput, ...)` on the adoption path.
**Expected**: adoption persists the new device (survives lobby→in-call / rejoin) and the user is told WHICH mic was adopted — never a silent switch.

### U-14 — Terminal WIRING: restore original + SINGLE `micSilentWarning` "No working microphone detected…" surface
**Verification** (code review + grep):
- On a `'none-working'` result, the wiring restores the ORIGINALLY-selected device (`selectedAudioId` unchanged / re-set to the original) and the kept live track is the original device's (or the best available) — NEVER a candidate the sweep just proved silent.
- The terminal prompt drives the SINGLE B2b `micSilentWarning` surface with the exact copy `"No working microphone detected — check your mic/permissions"`; the "Switch microphone" button still calls `openInCallDeviceDialog()`. There is NO second simultaneous silent-mic banner. Grep:
  ```
  grep -nE "No working microphone detected|micSilentWarning" frontend/src/app/pages/room/room.page.ts
  ```
  must show the terminal copy associated with `micSilentWarning` ONLY (single surface), reusing the B2b banner (room.page.html:194-198) — not a separate new banner.
**Expected**: "when there is none, just prompt the user about the error" (JROM) — one error surface, original device restored, picker still reachable.

### U-22 — Non-destructive: sweep uses `replaceAudioTrack` ONLY, never `removeAudioTrack`; track count never 0
**Verification** (code review + grep):
- The sweep acquire path is `media.replaceAudioTrack(deviceId, (next)=>sfuClient.replaceAudioTrack(next))` (the existing non-destructive helper — adds the new track BEFORE removing the old, returns null without harming the old; media.service.ts:88-109). The sweep body contains NO call to the destructive `this.media.removeAudioTrack()` (room.page.ts:2242) and NO `track.stop()` of the current track before a replacement is live. Grep the sweep method body:
  ```
  grep -nE "replaceAudioTrack|removeAudioTrack|\.stop\(\)" frontend/src/app/pages/room/room.page.ts
  ```
  must show the sweep path using `replaceAudioTrack` and NOT `removeAudioTrack` within the sweep/recovery body.
- No new `new AudioContext` / `AnalyserNode` / `createMediaStreamSource` introduced by B2c. Grep:
  ```
  git diff 1ba17b5 -- frontend/src | grep -nE "^\+.*(new AudioContext|AnalyserNode|createMediaStreamSource)"
  ```
  must return NO added lines — the sweep reuses `getOutboundAudioSource` + `classifyMicCapture`.
**Expected**: across re-acquire → sweep → adopt/restore, `localStream().getAudioTracks().length` is ALWAYS ≥ 1 (proven live in M-1/M-2).

---

## Manual Smoke Scenarios (M-*) — localhost:4700 (NS5; MANUAL-PENDING, USER seat)

Target `http://localhost:4700` (PM2 `meet-poc-fe` + `meet-poc-be` up; `cd frontend && npm run build` then `pm2 restart meet-poc-fe`). **Chrome fake-media emits a TONE on ALL fake inputs ⇒ every fake mic classifies `'working'`**, so the multi-device ADOPTION path **cannot be forced headless and is NOT Playwright-able**. These require a REAL machine with a real working mic AND a second mic that can be made silent (e.g. OS-mute one input, or a disconnected/dead input still enumerated). Carry as **MANUAL-PENDING localhost:4700 (USER seat)** in the test report — do NOT fabricate a fake-media adoption result. A forced-silent harness (DevTools override pinning the CURRENT device's media-source `audioLevel`/`totalAudioEnergy` flat while a real OTHER mic stays live) drives M-1/M-2 deterministically; the harness is test-only and must NOT ship.

### M-1 — Current mic silent, a DIFFERENT mic works ⇒ auto-adopt + notify which device (AC-C2/C3/C8)
**Given** the host joins (or is in-call) with the current mic forced/observed silent (enabled + unmuted + live, flat energy) AND at least one OTHER audioinput that produces real energy
**When** the protocol runs: re-acquire current once (still silent) ⇒ sweep ⇒ adopt the first working OTHER mic
**Then** (the headline R10 outcome):
1. the app SWITCHES to the working mic WITHOUT the user clicking anything;
2. a NON-blocking notice reads exactly **"Switched to <label> — your previous microphone had no sound"** with the adopted device's label;
3. `selectedAudioId` now equals the adopted device AND is PERSISTED (reload / rejoin keeps it; confirm in DevTools `localStorage`);
4. audio is now audible to a second participant (2-tab room);
5. `localStream().getAudioTracks().length` never dropped to 0 (DevTools console) and NO terminal "No working microphone detected" prompt appeared.
**Screenshot**: the "Switched to <label> …" notice + diagnostics row showing rising `outboundAudioEnergy` after the switch + audio-track-count ≥ 1.

### M-2 — NO mic works ⇒ original restored + single terminal error prompt, picker reachable (AC-C4/C8)
**Given** the host has ONLY mics that produce no energy (current silent + every OTHER enumerated mic also silent/dead)
**When** the protocol runs: re-acquire current ⇒ sweep all OTHERS (all silent) ⇒ none-working
**Then**:
1. the ORIGINALLY-selected device is restored (selectedAudioId back to the original; the kept track is not a candidate proven silent);
2. EXACTLY ONE banner appears — the single `micSilentWarning` surface — reading exactly **"No working microphone detected — check your mic/permissions"** (no second silent-mic banner, no "Switched to…" notice);
3. clicking **"Switch microphone"** opens the EXISTING in-call device picker (`inCallDeviceDialogOpen` true);
4. `getAudioTracks().length` stayed ≥ 1 throughout (never zero).
**Screenshot**: the single terminal banner (exact text + "Switch microphone") over an operable call UI; the picker open after the click; console showing track-count ≥ 1.

### M-3 — Bounded: ONE sweep per episode; re-arm only after energy returns then drops (AC-C6)
**Given** the host triggers a silence episode that causes a sweep (M-1 or M-2 setup)
**When** the silence PERSISTS after the sweep completes
**Then** NO second sweep fires (no device re-iteration / thrash in console/diagnostics) for the SAME episode. THEN restore real energy (mic speaks ⇒ `'working'`), THEN force silence again ⇒ a NEW single sweep is permitted for the new episode. While MUTED, no sweep ever fires.
**Screenshot/console**: console/diagnostics log showing exactly ONE sweep iteration per silence episode (count does not grow while silence persists) + a fresh sweep only after a working→silent transition.

---

## Edge Cases (explicitly covered)
- AC5 amendment — second silent pass now sweeps instead of terminating at keep-and-warn — U-2 (with explicit old-behavior rejection).
- Adopt FIRST working OTHER mic; stop on first success (no needless acquires) — U-4, U-5.
- No OTHER device at all (single dead mic) ⇒ straight to terminal prompt — U-11, M-2.
- Quiet-but-working mic NEVER swept (B2a U-8 preserved) — U-8, U-9, AC-C5.
- Muted/disabled/no-track ⇒ never sweep — U-10, U-18, M-3.
- Bounded to ONE sweep per episode; re-arm only on working→silent; mute is a pause not a permanent consume — U-15, U-16, U-17, U-19, M-3.
- Dedupe by deviceId AND groupId ('default'/'communications' alias collapses to physical twin); current excluded — U-20.
- Already-failed candidate skipped — U-21.
- Throwing candidate skipped (non-fatal) — U-23; null candidate skipped (not classified) — U-24; ALL throw/null ⇒ graceful none-working + restore — U-25.
- Adoption persists + names the device (no silent switch) — U-12, U-13, M-1.
- No-device-works ⇒ restore original + single terminal surface — U-6, U-7, U-14, M-2.
- Non-destructive throughout: `replaceAudioTrack` only, never `removeAudioTrack`, track count never 0 — U-7, U-22, M-1, M-2.
- No new AudioContext/meter (reuses `getOutboundAudioSource` + `classifyMicCapture`) — U-22 grep.

## Out-of-Scope Reminder (NOT tested here)
- B2a's capture-side fix (constraints, extractor, the step-1 re-acquire) — already gated @ b8fa5f7; NOT re-opened beyond extending the recovery step fn.
- B2b's warn-state reducer truth table + watchdog lifecycle/start-stop — already gated @ 1ba17b5; B2c only drives the SAME `micSilentWarning` surface for the new terminal copy.
- B3 diagnostics on/off toggle, B4 attribution/remote-audio, B5 self-test fidelity, B6 back-to-rooms.
- SFU/transport, auth, and the pre-existing lobby `AnalyserNode` preview meter (must not regress, not re-tested).

STATUS: DONE
