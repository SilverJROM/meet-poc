# Test Report — Batch B2: Same-room feedback suppression (SUPPRESSION ONLY)

**Tested against:** localhost build (`npx ng build`) + tsx pure-logic specs (`npx tsx`), run from `frontend/`
**Branch:** `feat/incall-media-always-enableable-20260602`
**Commits under test:** `85749cb` (limiter + capture verifier log) + `7ef5266` (validation artifacts)
**Date:** 2026-06-02
**QA persona:** [qa] Mode 2 (Testing). Pure-logic / Web-Audio-graph batch ⇒ tsx node:assert specs + build output are the evidence (NOT ng test). No new rendered UI ⇒ no screenshots (RF3-S8 forbids new UI; B2 diff is audio-graph + pure helper + one log line).

---

## 1. Spec results — `for f in src/app/services/*.spec.ts; do npx tsx "$f"; done` (actual output)

| Spec | Actual output | exit | Verdict |
|---|---|---|---|
| device-selection.spec.ts | `device-selection: all assertions passed` | 0 | PASS |
| diagnostics-global-flag.spec.ts | `diagnostics-global-flag: all assertions passed` | 0 | PASS |
| diagnostics-prefs.spec.ts | `diagnostics-prefs: all assertions passed` | 0 | PASS |
| **feedback-limiter.spec.ts** (NEW B2) | `feedback-limiter: all assertions passed` | 0 | **PASS** |
| media-toggle.spec.ts | `media-toggle: all assertions passed` | 0 | PASS |
| mic-capture-health.spec.ts | `mic-capture-health: all assertions passed` | 0 | PASS |
| **mic-energy.spec.ts** (EXTENDED B2) | `mic-energy: all assertions passed` | 0 | **PASS** |
| mic-selftest.spec.ts | `mic-selftest: all assertions passed` | 0 | PASS |
| mic-sweep.spec.ts | `mic-sweep: all assertions passed` | 0 | PASS |
| remote-audio-health.spec.ts | `remote-audio-health: all assertions passed` | 0 | PASS |
| **remote-audio-playability.spec.ts** (REGRESSION GUARD) | `remote-audio-playability: all assertions passed` | 0 | **PASS** |
| sfu-client.spec.ts | `TypeError: trackKindMap.get is not a function` (sfu-mid-reconcile.ts:33) | 1 | **PRE-EXISTING FAIL — not B2** |

**Pass count: 11/11 in-scope specs PASS.** 1 pre-existing failure (sfu-client) excluded — see note below.

### sfu-client.spec.ts — pre-existing, NOT a B2 failure
- Fails with a browser-only import shape (`trackKindMap.get is not a function` in `sfu-mid-reconcile.ts`), independent of any audio/feedback change.
- `git diff dcda820 HEAD -- src/` (B1-head → B2-head) lists exactly 5 files: `feedback-limiter.spec.ts`, `media.service.ts`, `mic-energy.spec.ts`, `mic-energy.ts`, `remote-audio.service.ts`. **Neither `sfu-client.ts` nor `sfu-mid-reconcile.ts` is touched by B2.** Failure is environmental/pre-existing.

### Substantive verification of the NEW / EXTENDED specs

**feedback-limiter.spec.ts** (RF2-S4) — asserts `FEEDBACK_LIMITER_PARAMS` from `remote-audio.service`:
- exact: `threshold===-3`, `knee===0`, `ratio===20`, `attack===0.003`, `release===0.25`
- predicates: `ratio>=20`, `threshold<=0`, `knee===0`, `attack>0`, `release>0`
- `'makeupGain' in FEEDBACK_LIMITER_PARAMS === false` (0-in ⇒ 0-out guard for mute-all)
- Source-verified the constant: `export const FEEDBACK_LIMITER_PARAMS = { threshold: -3, knee: 0, ratio: 20, attack: 0.003, release: 0.25 } as const;`

**mic-energy.spec.ts** (RF1-S1 + RF1-S2) — asserts:
- `audioCaptureConstraints(true)` ⇒ EC/NS/AGC all deep-equal `{ideal:true}`; `'exact' in` each === false (graceful, no hard-fail).
- `audioCaptureConstraints(true,'dev-123')` ⇒ `deviceId:{exact:'dev-123'}` and the three fields remain `{ideal:true}`.
- `audioCaptureConstraints(false) === false`; `(true, undefined)` and `(true, '')` ⇒ no `deviceId` key.
- `unappliedAudioProcessing` truth table — all six rows incl. `{}`⇒`[]`, all-false⇒`['echoCancellation','noiseSuppression','autoGainControl']` (deterministic order); plus edges: `{echoCancellation:undefined}`⇒`[]` (undefined NOT flagged), `{echoCancellation:0 as any}`⇒`[]` (strict `=== false`, not falsiness).

**remote-audio-playability.spec.ts** (RF4-S10 regression guard) — `all assertions passed`, exit 0: B1 playout decision (suspended-context, per-peer fallback, mixer-disabled) unregressed by the limiter insertion.

---

## 2. Build — `npx ng build` from `frontend/`

```
Application bundle generation complete. [2.846 seconds]
Output location: .../dist/meet-poc-frontend
BUILD_EXIT=0
```

**Verdict: PASS (exit 0).** Only pre-existing warnings (NG8113 unused DatePipe in RoomsPage; @stencil empty-glob; @mediapipe non-ESM) — none introduced by B2, none touch the audio path. Typecheck clean: `getSettings()` shape feeds `unappliedAudioProcessing` via `AudioProcessingSettings` cast with no `any`-leak error.

---

## 3. Scenario → evidence map (S1–S11)

| Scenario | Flag | Evidence | Result |
|---|---|---|---|
| **RF1-S1** capture EC+NS+AGC graceful `{ideal}`, no `{exact}` | [tsx-unit] | mic-energy.spec.ts PASS (RF1-S1 block) | **PASS** |
| **RF1-S2** `unappliedAudioProcessing` truth table (undefined not flagged; all-false⇒3 names; strict `=== false`) | [tsx-unit] | mic-energy.spec.ts PASS (RF1-S2 block incl. edges) | **PASS** |
| **RF1-S3** media.service verifier call is log-only (zero behavior change) | [build] + [manual-localhost] | Build exit 0. Diff: single inserted statement = `if (unapplied.length) console.debug('[media] audio processing not applied by device', unapplied)` — no branch beyond the log guard, no track/constraint/state mutation. | **PASS** (build/diff); manual-localhost console-line check **DEFERRED-MANUAL** |
| **RF2-S4** `FEEDBACK_LIMITER_PARAMS` limiter-shaped + no makeup / DEFAULT_VOLUME===1 | [tsx-unit] | feedback-limiter.spec.ts PASS; source confirms `DEFAULT_VOLUME = 1` (remote-audio.service.ts:24) | **PASS** |
| **RF2-S5** limiter node in graph (source→gain→limiter→destination); reset() disconnects+nulls | [build] + [manual-localhost] | Build exit 0. Diff confirms `createDynamicsCompressor()`, params set from constants, `this.gain.connect(this.limiter)` + `this.limiter.connect(this.destination)`, and `reset()`: `this.limiter?.disconnect(); this.limiter = null;` | **PASS** (build/diff); localhost playout check **DEFERRED-MANUAL** |
| **RF2-S6** normal speech not audibly squashed | [live-two-device] + [manual-localhost] | Perceptual; threshold -3dB/ratio 20:1 only clamps peaks (params verified S4) | **DEFERRED-LIVE** (JROM hardware-only) |
| **RF2-S7** same-room feedback runaway reduced (headline) | [live-two-device] | Two-device same-room A/B | **DEFERRED-LIVE** (JROM hardware-only) |
| **RF3-S8** NO detection UI / auto-mute / banner | [tsx-unit-grep] + [build] | `git diff dcda820 HEAD -- src/` = exactly 5 files (3 approved sources + 2 specs); no `.html`/template change, no new `setMutedAll(true)` call site, no feedback-detection signal. Build exit 0. | **PASS** |
| **RF4-S9** mute-all gain=0 ⇒ silence through limiter (param proof) | [tsx-unit] + [manual-localhost] | feedback-limiter.spec.ts: no `makeupGain`, DEFAULT_VOLUME===1 ⇒ compressor w/o makeup gain cannot turn 0→non-0. Chain gain→limiter→destination (S5 diff). | **PASS** (param proof); live mute-all silence **DEFERRED-MANUAL** |
| **RF4-S10** no regression to playout/volume/device — re-run specs | [tsx-unit] + [manual-localhost] | remote-audio-playability.spec.ts PASS; mic-energy.spec.ts PASS; feedback-limiter.spec.ts PASS | **PASS** (specs); localhost playout/slider/sink **DEFERRED-MANUAL** |
| **RF5-S11** honest doc note in changes.md (reduce-not-eliminate) | [manual-localhost doc-check] | changes.md §HONEST LIMITATION: "REDUCES but cannot fully eliminate… Headphones — or muting one of the two co-located devices — remains the ONLY [total fix]"; records (1) EC/NS/AGC best-effort `{ideal}`, surfaced not enforced, (2) limiter caps peak = suppression NOT detection/auto-mute. No "fixed"/"eliminated" claim. | **PASS** |

---

## 4. Summary

- **Specs: 11/11 in-scope PASS** (all `all assertions passed`, exit 0), including the new `feedback-limiter.spec.ts`, the extended `mic-energy.spec.ts` (RF1-S1 + RF1-S2), and the `remote-audio-playability.spec.ts` regression guard.
- **1 pre-existing failure** (`sfu-client.spec.ts`, browser-only import) — confirmed untouched by B2 via `git diff dcda820 HEAD`; NOT a B2 regression.
- **Build: PASS** (`npx ng build` exit 0; only pre-existing warnings).
- **Diff scope: clean** — exactly the 3 approved source files (`mic-energy.ts`, `media.service.ts`, `remote-audio.service.ts`) + 2 specs. No UI / banner / auto-mute (RF3-S8 satisfied).
- **Graph wiring verified by diff:** source→gain→limiter→destination, limiter params from named constants, `reset()` disconnects+nulls; media.service insertion is a single log-only `console.debug`.
- **Honest doc note (RF5-S11): present and accurate** — reduce-not-eliminate, headphones/mute-one = only total fix.
- **Deferred:** S6, S7 are JROM two-device same-room hardware tests ⇒ **DEFERRED-LIVE** (not executable in CI, not a fail). The [manual-localhost] live-graph observations in S3/S5/S9/S10 are **DEFERRED-MANUAL** (single-machine browser check); their automatable halves (build + diff + param proofs + re-run specs) all PASS here.

## Verdict: **PASS**

All automatable acceptance criteria (tsx-unit specs, build/typecheck, diff-grep negative assertions, param/no-makeup proofs, honest-doc check) pass. Remaining items are JROM-hardware-only live A/B (S6, S7) and single-machine manual confirmations, correctly flagged DEFERRED-LIVE / DEFERRED-MANUAL.

STATUS: DONE
