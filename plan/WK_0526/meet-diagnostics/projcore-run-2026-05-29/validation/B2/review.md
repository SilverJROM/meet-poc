# B2a Review — Root-cause silent-mic capture (tolerant constraints + shared energy reader + post-publish energy gate + bounded non-destructive recovery)

**Mode:** 1 (diff review — qa Playwright/manual happens after APPROVE)
**Batch:** B2a · commit `b8fa5f7` on top of B1 `3c1ebff`
**Branch:** feat/meet-diagnostics-audio-20260529
**Reviewer:** [reviewer]
**Date:** 2026-05-30

---

## Verdict: APPROVE

All 4 JROM-LOCKED must-dos are honored in the DIFF (not just claimed). The new decision logic is pure and node-testable, the unit spec asserts real OUTCOMES (including the locked quiet-but-working boundary), recovery is provably non-destructive, and nothing out of scope (B2b/B3-B6, SFU/transport, room layout, auth) was touched. No new AudioContext/AnalyserNode. Builds reported green, unit run genuine.

---

## Diff Summary (`git diff 3c1ebff..b8fa5f7 --stat`)

```
 frontend/src/app/pages/room/room.page.ts           | 116 +++++++++++-
 frontend/src/app/services/media.service.ts         |  15 +-
 frontend/src/app/services/mic-capture-health.spec.ts | 197 +++++++++++++++++++
 frontend/src/app/services/mic-energy.ts            | 147 +++++++++++++++
 frontend/src/app/services/sfu-client.service.ts    |  39 ++--
 (+ 2 validation artifacts: changes.md, unit-test-output.txt)
```

Source surface = exactly the 4 files the brief expects + 1 new spec. No backend, no other frontend file. Confirmed via `--stat` filtered to `frontend/src/app` minus specs: only room.page.ts, media.service.ts, mic-energy.ts, sfu-client.service.ts.

---

## Codex-Template Section Check (Rule 9) — PASS

| Section | Present | Note |
|---|---|---|
| User Report (verbatim) | ✅ | US-user external-mic report + JROM greenlight quote |
| Root Cause (mechanism) | ✅ | Mechanism-level — see Rule 8 below |
| Code Changes (per-file WHAT+WHY) | ✅ | 5 files, each WHAT + WHY |
| Verification (build + smoke) | ✅ | BE PASS, FE PASS, unit PASS + B1 regression PASS; manual correctly MANUAL-PENDING (NS5) |
| Caveats (regression vs pre-existing) | ✅ | Pre-existing sfu-client.spec failure flagged & not touched; `default`-device adjacency noted; B2b scope boundary stated |

## Root Cause — mechanism level (Rule 8) — PASS

changes.md identifies the actual mechanism, not the symptom: `getUserMedia` resolve ≠ proof of energy (wrong channel / OS-mixer-muted / dead-but-enumerable external); `doPublish` addTransceiver's whatever track unchecked; the only safety nets (`onended`/`onmute`) never fire for a `muted===false`/`enabled===true`/`readyState==='live'` silent track; B1's `micSilent` was computed but never acted on. Triggers named: hard EC/NS/AGC booleans + first-run `devices[0]` default. This is the true causal chain.

---

## JROM-LOCKED Must-Dos — verified in the DIFF

### MUST-DO 1 — Tolerant constraints — PASS
`audioCaptureConstraints` (mic-energy.ts:47-55) returns EC/NS/AGC as `{ ideal: true }` (not bare booleans), spreads `deviceId:{exact:deviceId}` ONLY when `deviceId` truthy, and short-circuits `audio:false → false`. NO channelCount/sampleRate — the only diff occurrence of those tokens is a comment (mic-energy.ts:433-region) explicitly stating they are deliberately NOT constrained. media.service.ts deletes the old `AUDIO_PROCESSING_CONSTRAINTS` hard-boolean const and `private audioConstraints()` now delegates to the pure builder. The builder is framework-free and is the surface the AC1 unit test imports and asserts shape on (spec U-1..U-3, incl. `assert.notStrictEqual(c.echoCancellation, true)` rejecting the old form).

### MUST-DO 2 — Bounded NON-DESTRUCTIVE recovery — PASS
- **At most once:** boolean guard `initialCaptureEnergyChecked` (room.page.ts:386), set true at the top of `verifyInitialCaptureEnergy()` before any await (room.page.ts:2260-2261), reset in `cleanupCall()` (room.page.ts:1945). Re-entry within a publish session is impossible.
- **Gated:** `captureGatePasses()` requires `captureTrackLive() && captureTrackEnabled() && captureTrackUnmuted()`, and `captureTrackLive()` itself requires `state()==='in-call'` + track present + `readyState==='live'`. So: in-call + live + enabled + unmuted. ✅
- **Keeps the existing track / never destructive:** the recovery path calls ONLY `media.replaceAudioTrack(decision.deviceId, …)`. Inspected `replaceAudioTrack` (media.service.ts:88-110): it acquires the NEW track first, `addTrack`s it, awaits `onAudioTrackChanged`, and only THEN removes/stops the old — and on a `getUserMedia` throw it never touches the old track, on an empty new-stream it returns null without removing the old. Therefore the old track survives any failed re-acquire ⇒ never zero tracks. The gate does NOT call `removeAudioTrack()` (the destructive path lives only at room.page.ts:2228 inside `recoverLocalAudioTrack`, which the gate never invokes — confirmed by grep). ✅ AVOIDS room.page.ts:2215/2228 destructive path.
- **Single relaxed re-acquire of the SAME device:** `decision.deviceId` is passed straight through; `decideMicRecovery` always returns `deviceId === selectedDeviceId` (no switch). One attempt only — after the resample the only further outcome is keep-and-warn. ✅
- **Still-silent → existing `deviceFailureNotice` one-shot warn:** room.page.ts:2287 sets `deviceFailureNotice` to the approved copy. Confirmed `deviceFailureNotice` is a PRE-EXISTING signal (present at 3c1ebff, room.page.ts:158) — NOT a new R2/B2b banner. No dedicated banner component built. ✅

### MUST-DO 3 — SUSTAINED discriminator (the critical correctness point) — PASS
`classifyMicCapture` (mic-energy.ts:107-133) decides from the **energy delta across the window**: builds `energies` from non-null `totalAudioEnergy`, returns `indeterminate` if `<2` usable samples, `working` if `last − first >= epsilon` (1e-7), and `silent` ONLY when the delta is flat AND `max(audioLevel) < threshold` (0.01) corroborates. It NEVER decides from a single instantaneous `audioLevel`. A quiet-but-working mic (energy still rising, low level) hits the `delta >= epsilon → working` branch BEFORE any level check ⇒ classified working ⇒ no recovery. The unit test proves the boundary genuinely: U-8 (mic-capture-health.spec.ts:103-107) asserts `classifyMicCapture([0.50..0.55] with audioLevel 0.004) === 'working'` — a real OUTCOME assertion of the locked quiet-but-working case, not just the flat-silent case (U-7) and not just the loud case (U-9). U-10 guards the inverse over-trigger (flat energy + high level ⇒ not silent). U-11 covers indeterminate (1-sample, all-null, empty). This is the must-not-regress false-positive guard and it is asserted.

### MUST-DO 4 — First-run devices[0] default (preferredDeviceId) — PASS
`preferredDeviceId` (room.page.ts:2885-2890) adds exactly one trivial line: after stored/current checks, `if (devices.some(d => d.deviceId === 'default')) return 'default';` before the `devices[0]` fallback. Trivial, correct, no TODO left behind. Caveat correctly documents that browsers not enumerating a `'default'` input fall through to existing behavior unchanged.

---

## Also-Verify checklist

| Check | Result | Evidence |
|---|---|---|
| ONE shared media-source extractor; no duplicate getStats loop in collectDiagnostics | ✅ | sfu-client.service.ts: inline media-source loop REMOVED; `outboundAudioSource = extractOutboundAudioSource(stats)` over the existing single getStats pass. New public `getOutboundAudioSource()` does its own one getStats + the SAME extractor (it is the gate's sampling primitive — a separate sampling call, not a second loop inside collectDiagnostics). Grep confirms executable `'media-source'` match exists only in mic-energy.ts:69. |
| No SECOND getStats inside collectDiagnostics | ✅ | collectDiagnostics still has one getStats; the extractor runs over that report. |
| No new AudioContext/AnalyserNode/createMediaStreamSource | ✅ | `git diff 3c1ebff -- frontend/src/app | grep -E '^\+.*(new AudioContext|AnalyserNode|createMediaStreamSource)'` → no added lines (re-ran during review). |
| Reuses MIC_SILENCE_LEVEL_THRESHOLD (0.01) | ✅ | classifyMicCapture defaults `levelThreshold` to `MIC_SILENCE_LEVEL_THRESHOLD`; spec asserts the constant is 0.01. |
| Hook point = `state?.status === 'published'` block, fire-and-forget | ✅ | room.page.ts:1325-1328: `void this.verifyInitialCaptureEnergy();` inside `if (state?.status === 'published')`, after the `sfu-publish` send. Fire-and-forget (`void`). |
| TEST VALIDITY — real OUTCOME assertions | ✅ | See below. |
| Unit-test-output reflects genuine `npx tsx` run | ✅ | `mic-capture-health: all assertions passed` / `EXIT=0`, plus B1 `mic-energy.spec.ts` regression green — matches B1 convention. |
| Scope: no B2b/B3-B6, SFU/transport, room-layout, auth | ✅ | grep for `watchdog|switch.microphone|setInterval|banner` → none. Only the 4 source files + spec changed. |
| Both builds green | ✅ | changes.md Verification: BACKEND_EXIT=0, FRONTEND_EXIT=0 (warnings all pre-existing/B1-documented). |

### Test-validity deep look (reviewer's special job)
The spec asserts behavior over synthetic windows/stats, not hollow fakery:
- No `page.setContent`, no static-HTML, no source-regex-dressed-as-test. Pure `node:assert/strict` over a `Map`-shaped fake (`statsOf`) that mirrors the real `RTCStatsReport.values()` contract.
- Extractor tests assert real return values incl. noise-rejection (video media-source + candidate-pair) and per-field null partials (U-4, U-6).
- Discriminator: U-7 silent, **U-8 quiet-but-working ⇒ working (the locked boundary, genuinely asserted)**, U-9 loud working, U-10 flat-but-loud ⇒ not silent, U-11 indeterminate trio.
- Recovery predicate: U-12 reacquire-same-device + deviceId equality (AC5), U-13 one-shot bound, U-14 working/indeterminate ⇒ none, U-15 gating matrix, U-16 keep-and-warn + non-destructive-union invariant, U-17 parametrized same-device (incl. undefined).
- Assertion labels match their proofs (e.g. "rising energy + low level -> working"). No label/proof mismatch.

---

## Scenario Coverage + Brief Anchoring

| Scenario(s) | Addressed by | Brief field |
|---|---|---|
| U-1..U-3 (AC1) | `audioCaptureConstraints` + media delegation | Must-do 1 |
| U-4..U-6 (AC2) | `extractOutboundAudioSource`, collectDiagnostics + getOutboundAudioSource reuse | Shared extractor |
| U-7..U-11 (AC3) | `classifyMicCapture` sustained delta | Must-do 3 |
| U-12..U-17 (AC4/AC5) | `decideMicRecovery` + replaceAudioTrack wiring | Must-do 2 |
| U-18 | no new AudioContext (grep clean) | Reuse B1 signal |
| U-19 | published-block hook + one-shot guard | Hook point |
| M-1..M-3 | MANUAL-PENDING | Correct per NS5 — not a REVISE at Mode 1 |

Every diff hunk traces to a brief field. No out-of-scope hunk found.

---

## Code Quality / Concerns (non-blocking, NOT required changes)
- room.page.ts:2261 sets the one-shot guard true before the first await — correct (prevents a re-entrant publish from double-arming). Good.
- `captureGatePasses()` is checked once up front; the post-resample keep-and-warn does not re-check gating, which is fine because the only branch reaching it is the confirmed-silent-eligible path. No issue.
- The `new MediaStream([reacquired])` fallbacks (room.page.ts:2277-2279) are defensive when `localStream()` is momentarily null; harmless and never destructive. Acceptable.
- Pre-existing `sfu-client.spec.ts` failure is correctly disclosed and out of this batch's required-green set. Not a blocker.

---

## Required Changes
None.

STATUS: DONE

---

## Test Report Verification (B2a)

**Mode:** 2 (Test Report Evidence Verification)
**Reviewer:** [reviewer]
**Date:** 2026-05-30
**Verifying:** `validation/B2/test-report.md` against the evidence under `validation/B2/screenshots/`
**Method:** Every headline claim was independently RE-RUN at HEAD `b8fa5f7` (confirmed `git rev-parse HEAD` == b8fa5f7; both `b8fa5f7` and baseline `3c1ebff` exist in the log). Not a paper read — the unit suite, all 6 structural greps, and both builds were re-executed.

### Evidence Check

| Item | Exists? | Genuine? | Notes |
|---|---|---|---|
| `unit-tests-b2a.txt` / `unit-test-output.txt` | ✅ | ✅ | Both show real `npx tsx` commands with `… all assertions passed` + `EXIT=0` for BOTH `mic-capture-health.spec.ts` (B2a) AND `mic-energy.spec.ts` (B1 regression). |
| Re-run: `mic-capture-health.spec.ts` | — | ✅ | I re-ran it: `mic-capture-health: all assertions passed`, **PRIMARY_EXIT=0**. Matches the captured file exactly. |
| Re-run: `mic-energy.spec.ts` (B1) | — | ✅ | I re-ran it: `mic-energy: all assertions passed`, **REGRESSION_EXIT=0**. B1 not regressed. |
| `structural-checks-b2a.txt` | ✅ | ✅ | 6 checks (S-1..S-6) each shows the literal command + its real stdout. I re-ran S-1/S-2/S-3/S-4 — output reproduces byte-for-byte. |
| `builds-b2a.txt` | ✅ | ✅ | Backend `BACKEND_EXIT=0`; frontend full chunk table + `Application bundle generation complete` + `FRONTEND_EXIT=0`. I re-ran both: BACKEND_EXIT=0, FRONTEND_EXIT=0, bundle complete, no `error TS`/`ERROR`. Warnings present are the 3 pre-existing/B1-documented ones only. |
| `app-render-smoke-b2a.txt` + `app-render-landing-b2a.png` | ✅ | ✅ | `PAGE_TITLE=VoiceLokal`, `CONSOLE_ERROR_COUNT=0`. PNG is a real `1280 x 720 8-bit RGB` image (`file` confirms). Correctly labelled best-effort, NOT a gate. |

- **Evidence count:** 5 text captures + 1 PNG; all referenced files present, no broken links.
- **Tested-against:** unit = node `node:assert/strict` via `npx tsx` (headless, no browser); structural = `grep`/`git diff`/`sed` over the tree at `b8fa5f7`; builds = real `tsc` + `ng build`.
- **Unit-runner used:** genuine `tsx` execution (NOT API-only, NOT static-HTML, NOT `page.setContent`, NOT source-regex-dressed-as-test). The spec (`mic-capture-health.spec.ts`) imports the real pure exports from `mic-energy.ts` and asserts input→output over a `Map`-shaped synthetic `RTCStatsReport` (`statsOf`) — real OUTCOME assertions.

### AC3 quiet-but-working boundary (U-8) — specifically confirmed

Read the spec source directly: **U-8 is genuinely asserted at `mic-capture-health.spec.ts:103-107`** —
`classifyMicCapture([0.50,0.51,0.52,0.53,0.54,0.55] with audioLevel 0.004) === 'working'`
(`'rising energy + low level -> working'`). This is the LOCKED quiet-but-working case asserted as a real positive, sitting between U-7 (flat→silent) and U-9 (loud→working), with U-10 guarding the inverse over-trigger. Not merely claimed in the report's table — present and passing in the executed suite.

### Structural checks — re-run, real command output (not narrative)

| Check | Claim | Independent re-run result |
|---|---|---|
| S-1 | ONE executable `media-source` extractor | ✅ `grep -rn "stat.type === 'media-source'" src/app/services/` → single hit `mic-energy.ts:69`. Other `media-source` mentions are comments. |
| S-2 | No new AudioContext/AnalyserNode/createMediaStreamSource in `3c1ebff..b8fa5f7` | ✅ `git diff 3c1ebff..b8fa5f7 -- src/app | grep -E '^\+.*(new AudioContext\|AnalyserNode\|createMediaStreamSource)'` → **no added lines** (rc=1). |
| S-3 | One-shot gate hooked in `published` block + reset in `cleanupCall` | ✅ `verifyInitialCaptureEnergy()` (line 1330) sits INSIDE `if (state?.status === 'published')` (1322), fire-and-forget `void`; guard `initialCaptureEnergyChecked` set true at 2247-2248 before any await, reset at 1945 inside `cleanupCall()` (1932). Read the surrounding source to confirm placement, not just the grep. |
| S-4 | Recovery avoids destructive `removeAudioTrack`/`recoverLocalAudioTrack` | ✅ Those tokens appear in room.page.ts only at 2194/2202/2228 (the pre-existing `onended`/`onmute` path) — the gate body (2246-2296) contains ONLY the comment at 2269 ruling them out. Read 2246-2296: recovery is one non-destructive `replaceAudioTrack` (2272), re-sample, then keep-track + `deviceFailureNotice` (2294) on still-silent — never zero tracks. |
| S-5 | Shared `getOutboundAudioSource` is the gate's sampling primitive | ✅ `sfu-client.service.ts:193-202` + reuse at 356 — one extractor. |
| S-6 | `media.service` delegates to the pure `audioCaptureConstraints`; old const gone | ✅ `AUDIO_PROCESSING_CONSTRAINTS` no longer present; `audioConstraints()` delegates (352-355), wired at 62/80/92. |

### Builds — re-confirmed green by independent re-run

- Backend: `BACKEND_EXIT=0` (tsc clean).
- Frontend: `FRONTEND_EXIT=0`, `Application bundle generation complete`, zero `error TS`/`ERROR`. Only the 3 documented pre-existing warnings (NG8113 DatePipe, Stencil empty-glob, mediapipe CommonJS).

### Coverage Check

| Scenario | Test case exists | Evidence | Result |
|---|---|---|---|
| U-1..U-3 (AC1 tolerant constraints) | ✅ spec:22-46 | unit run EXIT=0 (re-run) | PASS |
| U-4..U-6 (AC2 one shared extractor) | ✅ spec:52-91 | unit run EXIT=0 + S-1/S-5 grep | PASS |
| U-7 (flat→silent) | ✅ spec:97-101 | unit run EXIT=0 | PASS |
| **U-8 (quiet-but-working→working, LOCKED boundary)** | ✅ spec:103-107 | unit run EXIT=0 (source read + executed) | **PASS** |
| U-9..U-11 (loud/over-trigger/indeterminate) | ✅ spec:109-131 | unit run EXIT=0 | PASS |
| U-12..U-17 (bounded non-destructive recovery, AC4/AC5) | ✅ spec:146-190 | unit run EXIT=0 + S-4 grep + gate-body read | PASS |
| threshold sanity | ✅ spec:192-195 | unit run EXIT=0 | PASS |
| U-18 (no new AudioContext) | ✅ structural | S-2 re-run (no added lines) | PASS |
| U-19 (published-block hook + one-shot) | ✅ structural | S-3 re-run + source read | PASS |
| M-1..M-3 (live silent-mic) | n/a — manual | **MANUAL-PENDING (NS5)** — honestly marked, NOT claimed PASS, NOT faked | PENDING (accepted) |

### Manual items (M-1..M-3) — honesty check

Confirmed M-1..M-3 are carried as **MANUAL-PENDING** in §5 of the test-report with an explicit "NOT RUN HEADLESS / No manual PASS is claimed" banner, and as PENDING (not PASS) in the §Summary table. This is the agreed NS5 proof strategy for a WebRTC real-mic capture batch — a headless browser cannot capture a real microphone. Per the task instruction this is ACCEPTABLE and is NOT a basis for INSUFFICIENT. The deterministic gate is the unit suite + structural checks + builds, all of which I independently re-ran green. No live-mic Playwright test is demanded for this pure-logic + WebRTC-capture batch.

### Verdict: VERIFIED

The unit suite is genuinely green (re-run: PRIMARY_EXIT=0 and REGRESSION_EXIT=0; B1 not regressed; the LOCKED U-8 quiet-but-working boundary is a real executed assertion at spec:103-107, not narrative). All 6 structural checks are backed by real command output that reproduces on independent re-run (one shared extractor; zero new AudioContext/AnalyserNode in `3c1ebff..b8fa5f7`; one-shot guard in the published block + reset in cleanupCall; recovery body uses only the non-destructive `replaceAudioTrack` + keep-and-warn, never `removeAudioTrack`/`recoverLocalAudioTrack`). Both builds re-confirmed green (BACKEND_EXIT=0, FRONTEND_EXIT=0). The manual live-mic items (M-1..M-3) are honestly marked MANUAL-PENDING per NS5 and not claimed passed. No fakery, no label/proof mismatch, no API-passed-off-as-test.

STATUS: DONE (VERIFIED)

---
---

## Code Review: Batch 2b

**Mode:** 1 (diff review — qa Playwright/manual happens after APPROVE)
**Batch:** B2b · commit `1ba17b5` on top of B2a `b8fa5f7`
**Branch:** feat/meet-diagnostics-audio-20260529
**Reviewer:** [reviewer]
**Date:** 2026-05-30
**Diff reviewed:** `git diff b8fa5f7..1ba17b5` (truth, not the summary)

### Verdict: APPROVE

---

### Diff Summary

6 files, +346/-3. Source: `mic-energy.ts` (+30, the pure reducer), `room.page.ts` (+70/-3, watchdog + signal + unify re-point), `room.page.html` (+6, the banner), `mic-capture-health.spec.ts` (+92, B2b assertions). Artifacts: `changes.md` (+131 B2b section), `unit-test-output.txt` (+20 B2b run). Scope is exactly the four source files + two B2 artifacts the brief allows — NO out-of-scope hunks.

---

### Codex-Template Check (changes.md ## Batch 2b)

| Section | Present | Note |
|---|---|---|
| User Report (verbatim) | YES | US-user-with-external-mic quote + verbatim R2 requirement |
| Root Cause / Feature (mechanism-level) | YES | watchdog = safety-net on top of B2a one-shot; mechanism stated (B2a gate fires once near publish; mid-call silence would go unwarned) |
| Code Changes (per-file WHAT + WHY) | YES | all 4 files, WHAT+WHY each |
| Verification | YES | both builds EXIT=0, unit EXIT=0, B2a regression EXIT=0, static/wiring grep results, manual MANUAL-PENDING |
| Caveats | YES | warn-only by design, unify, pre-existing untouched, pre-existing sfu-client.spec failure noted |
| Commits / Standing Rules | YES | table + "None introduced" |

Template complete. Builds reported green both (BACKEND_EXIT=0, FRONTEND_EXIT=0).

---

### Scenario Coverage + Brief-Anchoring Table

| # | Brief check | Verified in DIFF | Result |
|---|---|---|---|
| 1 | PURE reducer `nextMicWarningState(current, classification, micActive)` | `mic-energy.ts:292-301`: `if(!micActive)return false; if(=='silent')return true; if(=='working')return false; return current`. Param type is `MicCaptureClass` = `'silent'\|'working'\|'indeterminate'` (mic-energy.ts:85) — handles the literal `'indeterminate'`, NOT `'unknown'`. No DOM/Angular/timer. | PASS |
| 1 | Unit asserts FULL transition table incl. indeterminate⇒current + micActive=false-overrides | spec:204-223 exhaustive 3×2×2 loop with computed `expected` (real `assert.strictEqual`); plus U-21 explicit `true,klass,false⇒false` (mute-while-shown) and U-22 `indeterminate` keeps current both states. Real outcome assertions, not narrative. | PASS |
| 2 | WARN-ONLY watchdog — ZERO device mutation in poll body | `pollMicSilenceWatchdog` (room.page.ts:2481-2507) reads ONLY `this.sfuClient.getOutboundAudioSource()`, pushes to window, classifies, sets `micSilentWarning`. NO replaceAudioTrack / recoverLocalAudioTrack / removeAudioTrack / getUserMedia / changeAudioDevice anywhere in the body (grepped). | PASS (critical invariant holds) |
| 3 | Lifecycle / no leak — own ~1s interval, start at publish, cleared in cleanupCall | `MIC_SILENCE_WATCHDOG_POLL_MS=1000` own interval (room.page.ts:37), `micSilenceWatchdogTimer` own field. `startMicSilenceWatchdog()` at room.page.ts:1349 next to `startDiagnosticsLogger()`. `stopMicSilenceWatchdog()` at 1947 next to `stopDiagnosticsLogger()`: `clearInterval` + null + buffer cleared. Poll self-stops on first post-leave tick (`state()!=='in-call'⇒stopMicSilenceWatchdog();return`, 2483-2486). NOT piggybacking the 7.5s logger. | PASS |
| 4 | Mute gating | poll body 2491-2495: `micActive = captureTrackLive() && captureTrackEnabled() && captureTrackUnmuted()`; `!micActive` ⇒ clear buffer + `nextMicWarningState(cur,'indeterminate',false)` (⇒false) + return before any stats poll. Helpers exist (2335-2347). | PASS |
| 5 | Banner: non-blocking `.device-notice role="status"`, exact text, `Switch microphone`→`openInCallDeviceDialog()` | room.page.html:9-14: `<div class="device-notice" role="status">`, `<span>We can't detect sound from your microphone</span>` (EXACT — no trailing "Open devices…" sentence, no period), `<button (click)="openInCallDeviceDialog()">Switch microphone</button>`. `openInCallDeviceDialog()` (room.page.ts:837) sets `inCallDeviceDialogOpen.set(true)` — the EXISTING picker. No new modal/focus-trap. `.device-notice` scss (room.page.scss:463) is inline flex, no position:fixed/overlay/backdrop. | PASS |
| 6 | Unify — B2a fallback re-pointed; ONE silent-mic surface; reset in cleanupCall | verifyInitialCaptureEnergy fallback: the old `deviceFailureNotice.set("We can't detect sound… Open devices to pick another.")` is REMOVED (single `-` line), replaced by `this.micSilentWarning.set(true)` (room.page.ts:2310). `grep "detect sound from your microphone" room.page.ts` ⇒ ZERO matches (copy now lives only in HTML). `micSilentWarning.set(false)` in cleanupCall (1986). Template renders it in exactly one `@if` block. | PASS |
| 7 | REUSE — no new meter | `git diff b8fa5f7..1ba17b5 \| grep "+.*new AudioContext\|AnalyserNode\|createMediaStreamSource"` ⇒ none added. Reuses `classifyMicCapture` + `getOutboundAudioSource` + the B1 threshold via the classifier. | PASS |
| 8 | SCOPE | Only room.page.ts/.html + mic-energy.ts + spec changed (scss untouched — banner reuses existing `.device-notice`). No B2a capture-logic change beyond the single unify re-point. No B3-B6 / SFU / auth. | PASS |
| 9 | Test validity | Reducer assertions are real OUTCOME assertions over the truth table (exhaustive computed-expected loop, not source-regex/label fakery). U-24/U-25 feed real windows through `classifyMicCapture` then the reducer. unit-test-output.txt shows a genuine `npx tsx mic-capture-health.spec.ts` run: `mic-capture-health: all assertions passed` / `EXIT=0`, plus B2a regression `mic-energy: all assertions passed` / `EXIT=0`. | PASS |
| 10 | Codex-template completeness + builds | All sections present (table above); both builds reported green. | PASS |

M-4..M-8 are correctly carried as MANUAL-PENDING per NS5 (headless fake-media emits a tone, can't force a silent published track) — not REVISE-able, qa runs them after APPROVE.

---

### Code Quality

- The reducer is minimal, total over the union, and self-documents the locked truth table in its doc comment. Treats `'indeterminate'` as pass-through correctly (the most subtle anti-flicker case).
- The `!micActive` branch routes through `nextMicWarningState(cur,'indeterminate',false)` rather than a bare `.set(false)` — slightly indirect but correct (the reducer's `!micActive⇒false` short-circuit makes the classification arg irrelevant) and keeps the single transition function as the one source of truth. Acceptable.
- Self-stop on the first stale tick (state≠in-call) is belt-and-suspenders on top of the cleanupCall clear — defends against an in-flight `await getOutboundAudioSource()` resolving after leave. Good.
- `micSilenceWindow` is cleared on both start and stop and on mute, so a leave→rejoin re-arms a fresh window — no cross-session bleed.

### Convention Conformance

Mirrors the existing `startDiagnosticsLogger`/`startConnectionQualitySampler` timer pattern (own field, in-call guard, `window.setInterval`, void async tick, paired stop in cleanupCall). Banner reuses the established `.device-notice role="status"` notice-stack pattern verbatim. Spec mirrors B2a's `mic-capture-health.spec.ts` node-assert + terminal `console.log('…all assertions passed')` convention.

### Concerns

None blocking. Minor: the reducer is exercised in the spec but the *wiring* (watchdog applies it each tick, start/stop lifecycle, banner render) is static/code-review-verified only — inherent to NS5 (timers/signals/template aren't node-assertable); the manual M-4..M-8 path closes it post-APPROVE. No action required.

---

STATUS: DONE (APPROVE)

---
---

## Test Report Verification (B2b)

**Mode:** 2 (Test Report Evidence Verification)
**Reviewer:** [reviewer]
**Date:** 2026-05-30
**Verifying:** `validation/B2/test-report.md` (## Test Report: Batch 2b) against `validation/B2/scenarios.md` (Batch 2b) + the evidence under `validation/B2/screenshots/` (unit-tests-b2b.txt, structural-checks-b2b.txt, builds-b2b.txt, app-render-smoke-b2b.txt, b2b-app-render.png).
**Method:** Independent RE-RUN at HEAD `1ba17b5` (confirmed `git rev-parse HEAD` == `1ba17b5ade...`; B2b on top of B2a `b8fa5f7`). NOT a paper read — both unit specs, the structural greps, both builds, and the reducer/banner/lifecycle source were re-executed/re-read.

### Evidence Check

| Item | Exists? | Genuine? | Notes |
|---|---|---|---|
| `unit-tests-b2b.txt` | YES | YES | Real `npx tsx` commands + `mic-capture-health: all assertions passed` / `MIC_CAPTURE_HEALTH_EXIT=0` AND `mic-energy: all assertions passed` / `MIC_ENERGY_EXIT=0`. Header pins HEAD `1ba17b5`. |
| Re-run: `mic-capture-health.spec.ts` | — | YES | I re-ran it: `mic-capture-health: all assertions passed`, **PRIMARY_EXIT=0**. Matches captured file. |
| Re-run: `mic-energy.spec.ts` (B1/B2a regression) | — | YES | I re-ran it: `mic-energy: all assertions passed`, **REGRESSION_EXIT=0**. No regression. |
| `structural-checks-b2b.txt` | YES | YES | S-1..S-6 each show the literal command + real stdout. I re-ran S-1/S-2/S-4/S-6 — reproduce byte-for-byte. |
| `builds-b2b.txt` | YES | YES | `BACKEND_EXIT=0`; frontend `Application bundle generation complete` + `FRONTEND_EXIT=0`. I re-ran both: BACKEND_EXIT=0, FRONTEND_EXIT=0, bundle complete, no `error TS`/`ERROR`; only the 3 pre-existing warnings (mediapipe CommonJS shown; NG8113 DatePipe, Stencil empty-glob documented). |
| `app-render-smoke-b2b.txt` + `b2b-app-render.png` | YES | YES | `PAGE_TITLE=VoiceLokal`, `CONSOLE_ERROR_COUNT=0`. PNG is a real `1280 x 720 8-bit RGB` image (`file` confirms). Correctly labelled best-effort, NOT a gate. |

- **Unit-runner used:** genuine `tsx` execution (NOT API-only, NOT static-HTML, NOT `page.setContent`, NOT source-regex-dressed-as-test). The spec imports the real pure exports (`nextMicWarningState`, `classifyMicCapture`) from `mic-energy.ts` and asserts input→output.
- **Evidence count:** 4 text captures + 1 PNG; all referenced files present, no broken links.

### AC-B1 reducer truth table (the headline) — GENUINELY asserted, not narrative

Read the spec source directly. The exhaustive 3×2×2 truth table is at **`mic-capture-health.spec.ts:228-248`** — a real nested loop over `CLASSES × [true,false] micActive × [true,false] current` that computes `expected` from the locked formula (`!micActive ? false : silent ? true : working ? false : current`) and asserts every one of the 12 combos with `assert.strictEqual` (line 240). This is a real OUTCOME assertion over all combinations, NOT a table in prose:
- **`indeterminate ⇒ current`** is genuinely exercised — line 239 (`current // indeterminate`) feeds the expected for both current=true/false, and U-22 (`:222-226`) separately asserts `(true,'indeterminate',true)→true` and `(false,'indeterminate',true)→false`.
- **`micActive=false` overrides the shown state** — U-21 (`:213-220`) loops all three classes asserting BOTH `(false,klass,false)→false` AND `(true,klass,false)→false` (the latter is the AC-B4 mute-while-shown clear). The truth-table loop re-covers all six muted combos.
- The reducer itself (`mic-energy.ts:154-163`) implements EXACTLY `if(!micActive)return false; if('silent')return true; if('working')return false; return current` — matches the asserted formula; no DOM/Angular/timer. Total over the `MicCaptureClass` union (`'silent'|'working'|'indeterminate'`, mic-energy.ts:85) — handles the literal `'indeterminate'`, not `'unknown'`.

U-24/U-25 (`:255-267`) feed real flat / energy-rose windows through `classifyMicCapture` then the reducer (silent⇒banner-shows; rose-then-paused⇒working⇒no-banner). U-26/U-27 (`:269-287`) prove auto-clear and mute-clear across a 2-poll window sequence. All executed and green.

### Structural checks — re-run, real command output (not narrative)

| Check | Claim | Independent re-run result |
|---|---|---|
| S-1 (WARN-ONLY) | watchdog poll body has ZERO device-mutation calls | YES — `awk '/pollMicSilenceWatchdog/,/^  }$/' room.page.ts \| grep -E 'replaceAudioTrack\|recoverLocalAudioTrack\|removeAudioTrack\|getUserMedia\|changeAudioDevice'` → **`<no matches>`**. Read `pollMicSilenceWatchdog` (2481-2507): it ONLY self-stops if not in-call, computes `micActive`, reads `getOutboundAudioSource()`, pushes to a window capped at `MIC_SILENCE_WATCHDOG_WINDOW=6`, classifies, sets `micSilentWarning` via `nextMicWarningState`. No auto-switch — the B2b-vs-B2a distinction holds. |
| S-2 (lifecycle) | own 1s interval started at publish (adjacent to diagnostics logger), cleared+nulled in cleanupCall, no leak | YES — `MIC_SILENCE_WATCHDOG_POLL_MS = 1_000` (own constant, room.page.ts:50), own timer field (372). `startMicSilenceWatchdog()` at **1349 immediately after `startDiagnosticsLogger()` (1348)** at publish completion. `stopMicSilenceWatchdog()` at **1947 in cleanupCall**, which `clearInterval`s + nulls the timer (2476-2477) + clears the buffer; `micSilentWarning.set(false)` at 1986. start guards `if (timer \|\| state()!=='in-call') return` (2468 — no double-arm). Poll self-stops on first stale tick (2483-2485). Not the 7.5s logger, not the one-shot gate. |
| S-3 (banner) | exact text + `Switch microphone`→`openInCallDeviceDialog` + `role="status"` non-modal | YES — read room.page.html:194-198: `@if (micSilentWarning())` → `<div class="device-notice" role="status">` with `<span>We can't detect sound from your microphone</span>` (EXACT — no trailing period, no "Open devices…" sentence) and `<button (click)="openInCallDeviceDialog()">Switch microphone</button>`. Inline in the `.device-notice` notice stack, NOT a modal/overlay. |
| S-4 (UNIFY) | old `deviceFailureNotice` silent-mic copy GONE; copy in HTML only | YES — `grep -E "deviceFailureNotice.set\(.We can.t detect sound\|Open devices to pick another" room.page.ts` → **`<no matches>`**; `grep -c "We can't detect sound from your microphone" room.page.ts` → **0**; the copy appears ONLY at room.page.html:196. B2a one-shot fallback now sets `this.micSilentWarning.set(true)` (room.page.ts:2310). |
| S-5 (single surface) | `micSilentWarning` is the one silent-mic surface, reset in cleanupCall | YES — `readonly micSilentWarning = signal(false)` (172); reset `.set(false)` in cleanupCall (1986); driven by watchdog (2494, 2506) AND the B2a one-shot fallback (2310) → one rendered banner. |
| S-6 (no new meter) | `git diff b8fa5f7..1ba17b5 -- frontend/src` adds NO `new AudioContext`/`AnalyserNode`/`createMediaStreamSource` | YES — re-ran the grep → **`<no added matches>`**. Watchdog reuses B2a's `getOutboundAudioSource()` + `classifyMicCapture()`. |

### Builds — re-confirmed green by independent re-run

- Backend: `BACKEND_EXIT=0` (tsc clean).
- Frontend: `FRONTEND_EXIT=0`, `Application bundle generation complete`, zero `error TS`/`ERROR`. Only the 3 documented pre-existing warnings.

### Coverage Check

| Scenario | Test case exists | Evidence | Result |
|---|---|---|---|
| **AC-B1 reducer truth table (3×2×2, LOCKED)** | YES spec:228-248 (+ U-20 :205-211, U-21 :213-220, U-22 :222-226) | unit run EXIT=0 (source read + executed) | **PASS** |
| U-23 auto-clear pair (shown→working) | YES spec:250-253 | unit run EXIT=0 | PASS |
| U-24 flat window ⇒ silent ⇒ banner | YES spec:255-260 | unit run EXIT=0 | PASS |
| U-25 energy-rose (DTX) ⇒ working ⇒ no banner | YES spec:262-267 | unit run EXIT=0 | PASS |
| U-26 auto-clear over window sequence | YES spec:269-278 | unit run EXIT=0 | PASS |
| U-27 mute mid-silence clears | YES spec:280-287 | unit run EXIT=0 | PASS |
| U-28 (AC-B5 WARN-only) | YES structural | S-1 re-run (no matches) + body read | PASS |
| U-29 (AC-B6 non-modal) | YES structural | S-3 re-run + template read | PASS |
| U-30/U-31 (AC-B7 lifecycle) | YES structural | S-2 re-run + source read | PASS |
| U-32 (AC-B8 unify) | YES structural | S-4/S-5 re-run (0 matches) | PASS |
| no-new-meter | YES structural | S-6 re-run (no added) | PASS |
| M-4..M-8 (live silent-mic banner) | n/a — manual | **MANUAL-PENDING (NS5)** — honestly marked, NOT claimed PASS, NOT faked | PENDING (accepted) |

### Manual items (M-4..M-8) — honesty check

Confirmed M-4..M-8 are carried as **MANUAL-PENDING** in §5 of the B2b test-report under an explicit "NOT RUN HEADLESS, NOT FAKED / No manual PASS is claimed" banner, and as PENDING (not PASS) in the §Summary table. This is the agreed NS5 strategy: the Playwright fake-media flag emits a TONE that always classifies `'working'`, so headless CANNOT force a silent *published* track to make the banner appear/clear. Per the task instruction this is ACCEPTABLE and is NOT a basis for INSUFFICIENT — the deterministic gate is the unit suite + structural checks + builds, all of which I independently re-ran green. The live-banner path is deterministically backed by U-24 (flat⇒silent⇒show), U-25 (DTX⇒working⇒no-show), U-26 (auto-clear), U-21/U-27 (mute gating).

### Verdict: VERIFIED

The unit suite is genuinely green on independent re-run (PRIMARY_EXIT=0 and REGRESSION_EXIT=0; B1/B2a not regressed). The AC-B1 `nextMicWarningState` 3×2×2 truth table is a REAL exhaustive `assert.strictEqual` loop over all 12 combinations (spec:228-248) with a computed `expected` matching the locked formula — including `indeterminate⇒current` (line 239) and `micActive=false` overriding the shown state (U-21 + the muted half of the loop) — NOT narrative. All 6 structural checks reproduce byte-for-byte: the watchdog body is WARN-ONLY (zero device-mutation calls), it runs its OWN 1s interval started at publish adjacent to the diagnostics logger and cleared+nulled in cleanupCall (no leak), the banner has the exact locked copy + `Switch microphone`→`openInCallDeviceDialog` in a non-modal `role="status"` region, the old `deviceFailureNotice` silent-mic copy is gone (0 occurrences in the .ts; lives only in HTML) onto a single `micSilentWarning` surface, and `git diff b8fa5f7..1ba17b5` adds no new AudioContext/AnalyserNode/createMediaStreamSource. Both builds re-confirmed green (BACKEND_EXIT=0, FRONTEND_EXIT=0). M-4..M-8 are honestly carried as MANUAL-PENDING per NS5 and not claimed passed. No fakery, no label/proof mismatch, no API-passed-off-as-test.

STATUS: DONE (VERIFIED)
