# Code Review — Batch B5: Device self-test fidelity (R8)

**Reviewer**: [reviewer] Mode 1 (code review of the diff)
**Branch**: `feat/meet-diagnostics-audio-20260529`
**Commit reviewed**: `2c062ff` (on top of `4a50da2`)
**Diff command**: `git diff 4a50da2 2c062ff`
**Date**: 2026-05-30

## Verdict

**APPROVE — STATUS: DONE**

The diff is a faithful, scope-contained implementation of R8/NS10: it feeds the EXISTING single AnalyserNode's per-frame mean-square into a sustained cumulative-energy window and classifies it with the SAME `classifyMicCapture` + `nextMicWarningState` + `0.01` threshold the in-call watchdog uses, on a SEPARATE non-blocking `lobbySelfTestFlag`. No shadow verdict logic, no new AudioContext/analyser, no flag-bound Join disable, in-call B2 paths untouched. All 7 specific checks hold. All 4 unit specs green.

---

## Diff Summary (11 files, +314/-2)

| File | Change |
|---|---|
| `services/mic-energy.ts` | +1 pure helper `accumulateEnergyFrame` (the ONLY change; all reused funcs untouched) |
| `services/media.service.ts` | `startMicLevel` accumulates into bounded window off the SAME analyser; `getMicCaptureWindow()` (copy); reset in `stopMicLevel`; 2 private fields + 1 import + 1 const |
| `pages/room/room.page.ts` | `lobbySelfTestFlag` signal + `selectedAudioLabel` computed + `start/stop/pollLobbySelfTest` poller; wired into preflight/reacquire/enableMicPreview, stop+reset in cleanupCall, flag reset in `changeAudioDevice` lobby branch |
| `pages/room/room.page.html` | flag inputs added to `app-lobby-preview` + LOBBY `app-device-dialog` only |
| `lobby-preview.{ts,html,scss}` | 2 inputs + `role="status"` flag + style |
| `device-dialog.{ts,html,scss}` | 2 inputs + `role="status"` flag gated `mode()==='lobby'` + style |
| `services/mic-selftest.spec.ts` (NEW) | deterministic unit proof U-1..U-6, U-8 |

---

## Codex-Template Section Check (changes.md)

| Section | Present | Note |
|---|---|---|
| User Report (verbatim) | ✅ | JROM R8 quote verbatim |
| Root Cause (mechanism) | ✅ | Mechanism-level: instantaneous single-frame AnalyserNode RMS×3 with NO sustained window / NO 'silent' verdict / NO flag → never disagrees with in-call → false pass. Fix mechanism named (reuse per-frame mean-square → cumulative window → same classifier). PASS Rule 8. |
| Code Changes (per-file WHAT+WHY) | ✅ | Each file with WHAT + WHY |
| Verification | ✅ | 4 specs + builds + structural self-checks |
| Caveats | ✅ | PRE-EXISTING build warnings, no regression, NS5 limitation, mobile-gate note |

All sections present. Root Cause is mechanism-level (lifecycle/signal-source, not symptom).

---

## Specific-Checks Verification (the 7 load-bearing checks)

| # | Check | Result | Evidence (file:line) |
|---|---|---|---|
| 1 | `accumulateEnergyFrame` returns `{ prevTotal+frameMeanSquare, sqrt(frameMeanSquare) }` RAW RMS, guards negative/NaN | ✅ | `mic-energy.ts:106-112` — `safe = ...> 0 ? frameMeanSquare : 0` (NaN/neg→0); `audioLevel: Math.sqrt(safe)` raw RMS (no ×3). `classifyMicCapture`(134), `nextMicWarningState`(181), `audioCaptureConstraints`(47), `MIC_SILENCE_LEVEL_THRESHOLD`(29), `ENERGY_DELTA_EPSILON`(120) all confirmed UNCHANGED (diff scoped to mic-energy.ts is the accumulator block only). |
| 2 | `startMicLevel` reuses SAME mean-square (no 2nd loop/analyser); bounded cap 24 + `.shift()`; `getMicCaptureWindow` returns copy; reset in `stopMicLevel`; ×3 display unchanged; ZERO new AudioContext/createAnalyser | ✅ | `media.service.ts:212` `meanSquare` computed once, reused at 217 (accum) and 221 (×3 display). Window push+`.shift()` cap 24 at 219-220. `getMicCaptureWindow():228` returns `.slice()`. Reset `micEnergyCumulative=0`/`micCaptureWindow=[]` in `stopMicLevel:356-357`. `git diff` of media.service.ts adds 0 `createAnalyser`/`new AudioContext` (line 188-189 ctor + 199 analyser are pre-existing, unchanged). |
| 3 | `lobbySelfTestFlag` signal; `selectedAudioLabel` computed (fallback 'this microphone'); poller gated lobby+audioContextActivated+live/enabled track; uses `classifyMicCapture(getMicCaptureWindow())`+`nextMicWarningState` on SEPARATE flag; started in preflight/reacquire/enableMicPreview; stopped+reset in cleanupCall; reset in changeAudioDevice; self-stops off-lobby; in-call paths UNTOUCHED | ✅ | flag `room.page.ts:193`; `selectedAudioLabel:197-201` fallback `'this microphone'` on blank label. Poller `2641-2667`: `startLobbySelfTest` guards `state()!=='lobby'`; `pollLobbySelfTest:2656` self-stops when not lobby OR `!audioContextActivated()`; `micActive:2664` = `microphoneRequested() && live && enabled`; SEPARATE `lobbySelfTestFlag` (not `micSilentWarning`). Started: preflight `1785`, reacquire `1815`, enableMicPreview `884-886`. cleanupCall `stopLobbySelfTest():1992`. `changeAudioDevice:829` reset (lobby branch, AFTER in-call early-return at 823-826). In-call `verifyInitialCaptureEnergy`/`pollMicSilenceWatchdog`/`runMicRecoverySweep`/`sampleCaptureEnergy` absent from diff +/- lines. |
| 4 | Flag inputs to `app-lobby-preview` AND lobby `app-device-dialog`, NOT in-call dialog (~157); Join `[disabled]` unchanged | ✅ | `room.page.html`: lobby-preview `420-421`, lobby dialog (`mode="lobby"`) `533-534`. In-call dialog (`mode="in-call"` `157-178`) has NO `micTestFlagged`. Join submit `[disabled]="state() === 'connecting'"` (446/461); grep for `[disabled].*(lobbySelfTest|micTest|micSilent)` → 0 hits. |
| 5 | Components: inputs added; `role="status"` flag with locked copy; dialog flag gated `mode()==='lobby'`; non-blocking | ✅ | `lobby-preview.component.ts:30-31` inputs; `.html:49-51` `role="status"` `No sound detected from {{ micTestDeviceLabel() }} — pick another`. `device-dialog.component.ts:35-36` inputs; `.html:54-56` same copy gated `micTestFlagged() && mode()==='lobby'`. No `[disabled]` in either flag. Copy matches Copy Lock exactly in both surfaces. |
| 6 | `mic-selftest.spec.ts` covers U-1..U-6, U-8; names start with scenario IDs; no fabricated fake-media Playwright test | ✅ | Blocks `// U-1`(21), `U-2`(44), `U-3`(72), `U-4`(93), `U-5`(106), `U-6`(112), `U-8`(127). 0.01 boundary asserted in U-3; clear-on-fix in U-4; mute-gate in U-5; thin-hold + prior-flag-preserved in U-6; deep-equal + never `{exact:''}` in U-8; NaN/neg guard in U-1. Only spec file added is this unit spec (`npx tsx`); no `.e2e`/playwright file in `--stat`. |
| 7 | changes.md all Codex sections; Root Cause mechanism-level | ✅ | See Codex-Template Check above. |

---

## Scenario Coverage + Brief Anchoring

| Scenario / AC | Code addressing it (file:line) | Brief field anchor | Status |
|---|---|---|---|
| AC1 / U-8 — same `audioCaptureConstraints` (deep-equal guard) | reused `audioCaptureConstraints` (mic-energy.ts:47, unchanged); guard `mic-selftest.spec.ts:127-151` | invariant (a) | ✅ |
| AC2 / U-1,U-2,U-3,U-7 — sustained window not one-frame | `media.service.ts:217-220` window; poller passes `getMicCaptureWindow()` `room.page.ts:2665` | invariant (a)(b) | ✅ |
| AC3 / U-3,U-4 — no-energy flagged; quiet-working NOT flagged | `classifyMicCapture` (silent vs working); spec U-3/U-4 | invariant (b)(c)(d) | ✅ |
| AC4 / U-3,U-5 — verdict matches in-call | SAME `classifyMicCapture`+`nextMicWarningState`+`0.01` (no shadow); `room.page.ts:2665-2666` | invariant (b) | ✅ |
| AC5 / U-4,U-9 — non-blocking; clears on working | flag-only (no disable); `nextMicWarningState('working')→false`; reset on device change | invariant (d)(f)(h) | ✅ |
| AC6 / U-6 — no premature flag while window fills | `<2 usable ⇒ indeterminate ⇒ hold`; spec U-6 | invariant (a) | ✅ |
| Reset on stopMicLevel / device change / leave | `media.service.ts:356-357`; `room.page.ts:829`,`1992` | invariant (h) | ✅ |
| Single analyser (no new AudioContext) | 0 added `createAnalyser`/`AudioContext` | invariant (e) | ✅ |
| In-call paths / SFU / layout / B3/B4/B6 untouched | absent from diff | invariant (g) | ✅ |

Every diff change traces to a brief invariant. No out-of-scope changes (Rule 10 PASS). The only files touched beyond the named surfaces are the 3 `.scss` (flag styling) — in-scope per the scenario "Touches" list.

---

## Convention Conformance

- Pure helper is framework-free (no Angular/DOM/AudioContext/timers) — matches existing `mic-energy.ts` pure-function discipline. ✅
- Spec uses `npx tsx`, ESM `./mic-energy.js` specifier, `node:assert/strict`, prints `mic-selftest: all assertions passed` — mirrors `mic-energy.spec.ts`/`mic-capture-health.spec.ts`. ✅
- Poller lifecycle mirrors the in-call `pollMicSilenceWatchdog` shape (own timer field, self-stop guard, cleared in `cleanupCall`) — no leaked interval. ✅
- Signal/computed style matches the file. Comments are mechanism-anchored (B5 tagged). ✅

## Code Quality

- **No second loop / second analyser**: `meanSquare` (media.service.ts:212) is computed once and reused for both accumulation (217) and the ×3 display (221). Confirmed. ✅
- **RAW RMS in window**: `audioLevel: Math.sqrt(safe)` (mic-energy.ts:110) — no ×3; ×3 stays display-only on `micLevel`. ✅
- **Guard correctness**: `frameMeanSquare > 0 ? frameMeanSquare : 0` collapses NaN, negative, AND exactly-0 to 0 — `sqrt(0)=0`, cumulative unchanged. Matches the U-1 contract (silent frame keeps cumulative at 0, level 0) and the spec asserts negative→treated-as-0 and NaN→level 0. Note: the scenario's prose `prevTotal + frameMeanSquare` is the un-guarded ideal; the implementation's guard is a strict superset (identical for valid non-negative input, safe on garbage). This is the documented NaN/negative guard the review explicitly requires — not a divergence. ✅
- **`getMicCaptureWindow()` returns a copy** (`.slice()`) — poller can't mutate the live window. ✅
- **micActive gate** computes from `microphoneRequested()` + live+enabled track (not merely "audio context active"), matching U-5's requirement. ✅
- Verified independently: `mic-selftest` + `mic-energy` + `mic-capture-health` + `mic-sweep` specs all print "all assertions passed" (U-11 regression holds).

## Scenarios.md quality (Rule 7)

ACs are concrete and assertable: each scenario carries exact windows, expected classifier outputs, the `0.01`/`1e-7` boundaries, deep-equal constraint objects, and grep/structural targets. Copy Lock is explicit (substring `No sound detected` in both templates, `this microphone` fallback). NS5 limitation honestly stated (fake-media tones every input → no "silent" Playwright test possible; unit + MANUAL carry the proof). Not vague — no REVISE-back-to-qa.

## Concerns / Non-blocking notes

1. **MANUAL-PENDING (M-1..M-3) is correct, not a gap.** Per NS5 a fake-media headless "silent mic" test cannot exist (Chrome tones every fake input). The real dead-device flag, working-mic-no-flag-and-transmits, and switch-clears-flag proofs require a USER seat at localhost:4700. This is an accurate limitation, not missing coverage — the deterministic unit cases carry the false-pass-kill proof by hand-built FLAT-energy windows. Flagged so the coordinator/JROM runs the manual close-out before declaring R8 field-validated.
2. **Mobile gate (informational):** the window only fills after the AudioContext is activated ("Tap to enable mic preview"); until then `getMicCaptureWindow()` is short → `indeterminate` → no premature flag. Consistent with AC6 and existing meter gating. The `enableMicPreview` start-hook (room.page.ts:884-886) covers this path.

---

**STATUS: DONE**

---

## Test Report Verification

**Reviewer**: [reviewer] Mode 2 (Test Report Verification — evidence is real, not re-reviewing the already-APPROVED diff)
**Date**: 2026-05-30
**HEAD verified**: `2c062ff` (matches report) — `git rev-parse HEAD` = `2c062ff78859a...`

### NS5 evidence-shape note
This is a deterministic-unit-proof batch. Per NS5, WebRTC real-mic capture cannot be exercised headless (Chrome fake-media tones every input → `classifyMicCapture` always `'working'`), so the correct evidence is **unit-test stdout + build output + structural greps**, NOT browser screenshots. This is the right shape here — NOT an INSUFFICIENT.

### Evidence Check

| Item | Result |
|---|---|
| Required evidence files present | **Y** — all 7 present: `unit-mic-selftest-b5.txt`, `unit-mic-energy-b5.txt`, `unit-mic-capture-health-b5.txt`, `unit-mic-sweep-b5.txt`, `build-frontend-b5.txt`, `build-backend-b5.txt`, `structural-b5.txt` |
| Total files in `screenshots/` | 10 (7 required + optional smoke `lobby-smoke-b5.txt`, `lobby-render-b5.png`, `lobby-smoke.mjs`) |
| Unit specs re-run (mine, this session) | **all 4 PASS** — `mic-selftest`, `mic-energy`, `mic-capture-health`, `mic-sweep` each printed `all assertions passed` (exit 0). Not fabricated. |
| Backend build evidence | `tsc -p tsconfig.json` clean, no errors (confirmed file content) |
| Structural file integrity | independently re-ran S1/S3/S5 — match: "No sound detected" in BOTH templates; **0** new `AudioContext`/`createAnalyser` in media.service.ts diff; `[disabled]…lobbySelfTestFlag` grep empty (exit 1) → Join non-blocking |

### Coverage Check

| Claim under audit | Verified? | How |
|---|---|---|
| Evidence files exist (7 required) | ✅ | `ls` of `screenshots/` |
| Unit specs really pass (not fabricated) | ✅ | re-ran all 4 myself → `all assertions passed` ×4, exit 0 |
| "No sound detected" in BOTH lobby templates | ✅ | `grep -rl` → lobby-preview + device-dialog both hit |
| 0 new AudioContext/createAnalyser | ✅ | `git diff 4a50da2 2c062ff … \| grep '^+' \| grep -E 'new AudioContext\|createAnalyser' \| wc -l` = 0 |
| Join button non-blocking (no flag-bound disable) | ✅ | `grep -nE "\[disabled\][^>]*lobbySelfTestFlag"` → empty (exit 1) |
| M-1..M-3 recorded as MANUAL-PENDING (not fabricated PASS) | ✅ | report table rows M-1/M-2/M-3 all `MANUAL-PENDING`, prose states "Not run; not fabricated" |
| U-1..U-6,U-8 mapped to `mic-selftest.spec.ts` blocks; PASS only on deterministic checks | ✅ | report table maps U-1..U-6,U-8 to scenario-ID-labelled blocks (`grep "U-[0-9]"` in structural-b5.txt confirms blocks at lines 21/44/72/93/106/112/127); PASS asserted on deterministic unit/build/structural only; real-device fidelity left MANUAL-PENDING |

### Verdict: **VERIFIED**

Evidence is real and complete for an NS5 deterministic-unit-proof batch: all 7 required evidence files present, all 4 unit specs independently re-confirmed passing this session, structural claims (copy in both templates, 0 new analyser/context, non-blocking Join) re-verified against the tree at HEAD `2c062ff`, M-1..M-3 honestly recorded as MANUAL-PENDING (no fabricated PASS), and the per-scenario table correctly maps U-1..U-6,U-8 to the mic-selftest spec blocks with PASS scoped to the deterministic checks only.

STATUS: DONE (VERIFIED)
