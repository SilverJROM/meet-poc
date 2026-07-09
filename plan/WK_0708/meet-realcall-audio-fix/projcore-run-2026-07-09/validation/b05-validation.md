# B05 Validation — D19 forced-mode gUM shim + stimulus verifier

**Verdict:** PASS
**Commit:** `df131358de0330bac97b7c8a5c39c0d5239e228e`
**Validated:** 2026-07-09
**Validator:** L3 opus (independent — implementer was L3 sonnet; verifier ≠ fixer, no code changed by this validation)

---

## Mandated Checks

| # | Check | Result |
|---|-------|--------|
| 1 | `cd e2e && npx vitest run harness/__tests__/gum-shim.test.ts` | **PASS** — 11/11 |
| 2 | Post-gUM GainNode (downstream of Chrome EC/NS/AGC) | **PASS** — measured, not asserted |
| 3 | Stimulus ±20% | **PASS** — measured gain 0.5026, rel-err ≤1.2% vs 20% budget |
| 4 | INVALID path (no silent PASS) | **PASS** — three distinct verdict paths confirmed in arbiter source |
| 5 | No app `media.service.ts` / `mic-energy.ts` edits | **PASS** — commit is 100% `e2e/harness/`; working tree clean |

---

## 1. Required test command

```
$ cd e2e && npx vitest run harness/__tests__/gum-shim.test.ts
 ✓ harness/__tests__/gum-shim.test.ts (11 tests) 3ms
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

Boundary math independently re-derived: `withinTolerance(0.5, 0.6)` → rel-err `0.19999999999999996 ≤ 0.2` → inclusive `true`; `0.61` → `0.22 > 0.2` → `false`. No floating-point edge failure at the ±20% boundary.

## 2. Post-gUM GainNode — verified by measurement, not by comment

A pure-math unit test **cannot** prove the GainNode survives AGC. I therefore did not accept the redteam's argument-from-source-comment and instead ran the real-Chromium proof and instrumented it.

`gum-shim.browser.test.ts` passes, and **5/5 repeat runs** passed (no flakiness from the looping fake-audio WAV, which was my leading flake hypothesis).

Instrumented the actual ratio across 5 trials (throwaway probe, since removed):

```
trial 0: baseline=0.126574 attenuated=0.063613 measuredGain=0.5026 relErr=0.5%
trial 1: baseline=0.126574 attenuated=0.063613 measuredGain=0.5026 relErr=0.5%
trial 2: baseline=0.126574 attenuated=0.063613 measuredGain=0.5026 relErr=0.5%
trial 3: baseline=0.126888 attenuated=0.063613 measuredGain=0.5013 relErr=0.3%
trial 4: baseline=0.126574 attenuated=0.062513 measuredGain=0.4939 relErr=1.2%
```

**The clawback premise is real, and the shim defeats it.** I confirmed AGC is actually engaged on the real track rather than assuming it:

```
REAL    track getSettings() EC/NS/AGC: {"ec":true,"ns":true,"agc":true}
SHIMMED track getSettings() EC/NS/AGC: {}
```

The app requests `autoGainControl: { ideal: true }` (`mic-energy.ts:52`), Chrome grants it (`agc:true`), and measured gain still lands at 0.5026 — flat across trials. Had the GainNode been placed upstream of AGC, AGC would have re-normalized and driven `measuredGain` toward 1.0. It does not. Attenuation is genuinely applied downstream of Chrome's processing.

Interception is also sound: `media.service.ts:55` is `createMediaAcquisitionQueue((constraints) => navigator.mediaDevices.getUserMedia(constraints))` — a **dynamic property lookup at call time**, so the shim's own-property override on `mediaDevices` is seen. It is the only `getUserMedia` site in the app. `getDisplayMedia` (`media.service.ts:469`) is not shimmed and requests `audio: false`, so it is correctly out of scope.

## 3. INVALID path — three genuinely distinct verdicts

A passing test proves nothing if `determineVerdict` is a stub, so I read the arbiter source. `recording-arbiter.ts` implements three real branches: `!stimulusVerification` → `INVALID`; `!withinTolerance` → `FAIL`; else `PASS`. `verifyStimulus` returns `undefined` on `baselineLevel === null || attenuatedLevel === null || baselineLevel <= 0`, so a missing/degenerate reference cannot be laundered into a fabricated `measuredGain`. Both unit and real-browser invalid-controls land on `INVALID`, not `PASS`. D19's "third verdict must exist in code" is satisfied.

## 4. App untouched — verified behaviorally, not just by filename

`git show df13135 --name-only` is entirely under `e2e/harness/`; `git diff HEAD -- frontend/ backend/` is empty. Beyond that, I checked that the shim's **synthetic** track does not perturb the app's own diagnostics:

- `unappliedAudioProcessing(shimmedTrack.getSettings())` → `[]`. The shimmed track omits the EC/NS/AGC keys entirely, and absent keys are (per that function's contract) not flagged — so the app's log-only verifier raises no false "device declined AGC" alarm.
- `mediaTrackDeviceId()` (`room.page.ts:4545`) → `''` on the shimmed track (no `deviceId`), guarded by an explicit `typeof === 'string'` check. Degrades gracefully.

The shimmed track's label is `"MediaStreamAudioDestinationNode"` rather than a device label. No app consumer branches on it. "App is unaware" holds under measurement.

## 5. Binding check

Brief binding: *"Later A definition is same-speaker normal-vs-attenuated far-end. Design verifier so normal reference can be recorded first."* Satisfied — `verifyStimulus(intended, baselineLevel, attenuatedLevel)` takes the baseline as a separate, independently-captured argument, and the browser test records the normal reference first (unshimmed context) before the attenuated pass. Note `intendedRatio` is bound at `addInitScript` time, so normal-vs-attenuated requires two browser contexts (or `r=1.0`); the test does exactly this and it is consistent with the binding.

Scope discipline also holds: no amplification/fix claim is made anywhere in the batch artifacts.

---

## Findings (all non-blocking — none breaches B05 acceptance)

**F1 — Real mic track and AudioContext are never released (medium, harness-only).**
`gum-shim.ts:32–57` returns a MediaStream containing the WebAudio destination track. The **real** mic track from `originalGetUserMedia` is never stopped, and the `AudioContext` is never closed. When the app calls `.stop()` on the returned tracks it stops the synthetic track only; the underlying mic stays `live`. The app re-acquires via `getUserMedia` on its mic re-acquire path (`media.service.ts:337`), so each acquire leaks one `AudioContext` plus one live mic track. Chrome bounds AudioContexts per page. This will bite once the shim drives long multi-toggle harness runs — which is precisely its intended use. Recommend stopping `realStream`'s audio track when the shimmed track ends, and closing the context.

**F2 — `verifyStimulus` has no minimum-signal floor; a dead mic can PASS (medium, latent, matters for real-call batches).**
The only degeneracy guard is `baselineLevel <= 0`. That catches Chromium's default fake device (exact digital silence, RMS exactly 0). It does **not** catch a real recording, whose noise floor is never exactly zero. A muted or dead microphone yields `baseline = n`, `attenuated = 0.5n` → `measuredGain = 0.50` → `withinTolerance` → `PASS`. Stimulus verification would certify "attenuation works" on a dead mic.
This is not a B05 acceptance breach: the verifier's contract is narrowly "did my forced attenuation take effect," and it answers that correctly. But per the real-call acceptance bar, a signal floor (or a voiced-segment precondition) should gate verification before this meets live recordings.

**F3 — Arbiter comment contradicts arbiter code (low, B04 surface, not a B05 regression).**
`recording-arbiter.ts` comments `"Stats logged but never decide PASS alone"`, yet `determineVerdict` returns `PASS` on stimulus verification **alone** — `analysis.voicedSegments` and `analysis.overallLoudness` are never read. A recording with zero voiced segments returns `PASS` if the gain ratio checks out. Compounds F2. Belongs to B02/B04's arbiter; flagged for projcore, not chargeable to B05.

**F4 — `harness/__tests__/call-ledger.test.ts` registers zero vitest suites (low, PRE-EXISTING, not B05).**
`npx vitest run harness/` reports `1 failed | 5 passed (6)`, `Tests 50 passed`. The failure is `call-ledger.test.ts` → *"No test suite found in file."* Cause: the file hand-rolls its own local `test()` / `assert()` functions and ends in `process.exit()` — it is a standalone script that vitest collects by filename glob but which registers no suites. **The file is byte-identical at `df13135^`** (verified), last touched by `22db4f4`. Not a B05 regression, but it means the harness suite cannot be claimed green repo-wide, and B01's call-ledger assertions are not actually executing under vitest.

**F5 — `attenuatedLevel <= 0` is unguarded (info).** A zero attenuated capture yields `measuredGain = 0` → `FAIL`, not `INVALID`. Defensible (silence is a present measurement of a failed ratio) and produces no false PASS. Noting the FAIL-vs-INVALID ambiguity only.

**F6 — `await audioContext.resume()` inside the gUM wrapper (info).** Under a restrictive autoplay policy `resume()` could stall, and because it is awaited before the shim returns, `getUserMedia()` would never resolve and the app would hang. Empirically fine under Playwright's fake-device flags across 10+ launches here.

---

## Verdict

**PASS.** All four mandated acceptance criteria are met, and the two load-bearing ones were confirmed by direct measurement rather than by reading the implementer's comments: AGC is provably active (`agc:true`) yet the forced ratio survives at **0.5026 (≤1.2% rel-err against a 20% budget, 5/5 stable)**, and `INVALID` is a real code path distinct from both `PASS` and `FAIL`. The commit touches only `e2e/harness/`, and the shim is behaviorally transparent to the app's own diagnostics.

F1 and F2 are real defects and should be queued — F2 in particular is the kind of thing that would let a later batch declare a green stimulus on a dead microphone — but neither is within B05's stated acceptance, and B05 explicitly makes no amplification/fix claim. F4 is pre-existing and should be routed independently of this batch.

Per verifier ≠ fixer, no code was modified during this validation. Two throwaway probe test files were created under `harness/__tests__/` and both were removed; `git status` on `e2e/harness/` is clean.
