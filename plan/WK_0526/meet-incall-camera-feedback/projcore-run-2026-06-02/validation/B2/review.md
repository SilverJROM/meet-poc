# B2 Review — Same-room feedback suppression (SUPPRESSION ONLY)

**STATUS: DONE (APPROVE)**

Reviewer: [reviewer] v2.0 · Branch `feat/incall-media-always-enableable-20260602` · Commits `85749cb` (code+tests) + `7ef5266` (artifacts) · Base `dcda820` (B1 head).

---

## Verdict
APPROVE. The 3-file surgical change matches the locked scope exactly: capture constraints left graceful (`{ideal}`, no `{exact}`), a genuinely log-only verifier at the two acquire sites, and a no-makeup-gain brick-wall limiter inserted `gain→limiter→destination`. NO detection UI / auto-mute / banner. Tests prove the requirement (real value + truth-table assertions, not theater). Build green. `sfu-client.spec.ts` failure confirmed pre-existing and unrelated.

## Diff Summary (`git diff dcda820..HEAD --stat -- frontend/src/`)
```
 feedback-limiter.spec.ts | 24 ++  (new)
 media.service.ts         | 18 ++  (B1 file — log-only)
 mic-energy.spec.ts       | 51 ++  (extended)
 mic-energy.ts            | 27 ++  (pure helper)
 remote-audio.service.ts  | 21 ++  (limiter)
```
`git diff --name-only -- frontend/src/` = exactly these 5 (3 source + 2 spec). No stray files. No `.html`/component/template touched (RF3 negative satisfied at the file level).

## Codex-Template Section Check (changes.md)
| Section | Present | Note |
|---|---|---|
| User Report (verbatim) | YES | brief quote, line 8 |
| Root Cause (mechanism) | YES | two-device acoustic coupling + unbounded mixer — mechanism-level, not symptom |
| Code Changes (per-file WHAT+WHY) | YES | named bindings, per-file |
| Verification (build PASS + target + smoke) | YES | build PASS, specs enumerated, DEV pm2 restart |
| Caveats (regression vs pre-existing) | YES | sfu-client + build warnings flagged PRE-EXISTING |
| Honest limitation | YES | explicit "reduces but cannot fully eliminate" (lines 103-115) — no "fixed"/"eliminated" claim |

## Scenario Coverage + Brief Anchoring
| Scenario | Brief field | Evidence | Verdict |
|---|---|---|---|
| RF1-S1 capture `{ideal}` no `{exact}` | mic-energy.ts UNCHANGED constraints | `audioCaptureConstraints` not in diff; spec asserts `{ideal:true}` ×3 + `'exact' in … === false` ×3, deviceId edge cases | PASS |
| RF1-S2 unappliedAudioProcessing truth table | NEW pure helper, `===false` only | helper checks strict `=== false`; spec covers all-true→[], each-false, all-absent→[], all-false ordered, **undefined→[]**, **0→[]** | PASS |
| RF1-S3 media.service log-only | ONE log-only helper, zero behavior change | diff = `verifyAudioProcessing` (console.debug + try/catch) + 2 call sites; no branch/return/mutation/state write; build green | PASS |
| RF2-S4 limiter-shaped params, no default amp | `{threshold:-3,knee:0,ratio:20,attack:.003,release:.25}`, DEFAULT_VOLUME=1 | spec asserts exact values + `ratio>=20`, `threshold<=0`, `knee===0`, `attack>0`, `release>0`, no `makeupGain` | PASS |
| RF2-S5 graph insertion + reset | `gain→limiter→destination`, reset disconnects+nulls | diff: limiter created, params from constants, `gain.connect(limiter)`+`limiter.connect(destination)` replace `gain.connect(destination)`; reset `limiter?.disconnect()`+`=null` | PASS |
| RF2-S6 / RF2-S7 normal speech / runaway reduced | live two-device | JROM hardware-only; flagged in changes.md Caveats — not a code defect | DEFERRED (live) |
| RF3-S8 NO UI/auto-mute/banner | locked constraint | diff grep `banner|setContent|detect|auto.?mute|template` = 0; no `setMutedAll(true)` heuristic; no `.html`/component | PASS |
| RF4-S9 mute-all gain=0 ⇒ silence | no makeup gain, gain stays mute node | setMutedAll→`gain.gain.value` (l.61), no makeup-gain field (asserted); limiter downstream, 0-in⇒0-out | PASS |
| RF4-S10 no playout/volume/device regression | re-run existing specs | `remote-audio-playability.spec.ts` + `mic-energy.spec.ts` GREEN; setVolume→gain (l.68), addSource→gain (l.264) unchanged | PASS |
| RF5-S11 honest doc note | reduces-not-eliminates | changes.md lines 103-115; both facts recorded | PASS |

## Test Execution (run by reviewer)
`for f in src/app/services/*.spec.ts; do npx tsx "$f"; done` from `frontend/`:
- ALL service specs `all assertions passed` / exit 0, INCLUDING `mic-energy.spec.ts`, `feedback-limiter.spec.ts`, `remote-audio-playability.spec.ts` (B1 guard).
- ONLY `sfu-client.spec.ts` fails: `TypeError: trackKindMap.get is not a function` at `sfu-mid-reconcile.ts:33` — a spec-harness Map-construction issue in a file B2 did NOT touch. `git diff dcda820..HEAD -- frontend/src/app/services/sfu-client.spec.ts` is EMPTY (and sfu-mid-reconcile.ts likewise untouched). Confirmed PRE-EXISTING, browser-only/harness, NOT a B2 regression.

Tests are substantive, not theater: real exported-value assertions (`FEEDBACK_LIMITER_PARAMS`), full input→output truth table on the pure helper, and the `{ideal}`/no-`{exact}` contract — no `page.setContent` static HTML, no source-regex-as-test.

## Build
`npx ng build` from `frontend/` → emitted `dist/meet-poc-frontend`, exit 0. Only PRE-EXISTING warnings (stencil `empty-glob`, `@mediapipe/selfie_segmentation` non-ESM). PASS.

## Code Quality
- media.service.ts is genuinely log-only: `verifyAudioProcessing` is `console.debug`-only inside `try/catch`; both insertions sit AFTER the track is obtained and BEFORE attach, touching no return value, no control flow, no signal/state. B1 acquire flow intact. **B1 regression guard held.**
- remote-audio graph correct: sources still `connect(this.gain)`; `setVolume`/`setMutedAll` still mutate `gain` (NOT limiter); limiter is pure downstream peak control; no makeup-gain field ⇒ mute-all (gain=0) stays silent. `DEFAULT_VOLUME=1`, `MAX_VOLUME=1.3` unchanged.
- reset() disconnects + nulls the limiter (optional-chained, leak-safe; rebuilt fresh on re-entry). Context teardown intact.
- Params named via `FEEDBACK_LIMITER_PARAMS` (no inline magic numbers); `decisions/limiter-node.md` justifies each value (threshold/knee/ratio/attack/release) and the no-makeup-gain silence invariant — thorough and accurate.

## Concerns
- None blocking. RF2-S6 (normal speech not squashed) and RF2-S7 (runaway reduced) are inherently live two-device tests on JROM hardware — correctly deferred and flagged in changes.md, not reviewable in CI. The pure params + graph-wiring + mute-all-silence proofs are the maximal in-CI coverage and are present and green.

STATUS: DONE
