# Review — B4b (R7: surface per-remote inbound AUDIO health + flag silent remote)

Reviewer: [reviewer] v2.0 (Mode 1, diff + evidence). Commit reviewed: `6a96b9e` (parent `c3ad403`). Branch `feat/meet-diagnostics-audio-20260529`.

## Verdict

**STATUS: DONE (APPROVE)**

The diff implements the LOCKED design exactly, with no drift. Pure framework-free classifier, ratio-only verdict, named constants, div0/null/floor guards, D1 (display-only bytes/packets), D2 hardener-no-flip, single-source badge string, badge-only-for-silent, one additive neutral scss class. Both JROM verify-at-gate invariants (RAH-5 below-floor⇒unknown, RAH-12 badge-only-silent) are present and binding. Unit spec passes; build clean; scope = exactly 5 frontend files.

## Diff Summary (`git show 6a96b9e --stat`)

```
 .../diagnostics/diagnostics.page.html | 29 ++++-
 .../diagnostics/diagnostics.page.scss | 33 ++++-
 .../diagnostics/diagnostics.page.ts   | 88 +++++++++++++
 .../services/remote-audio-health.spec.ts | 140 +++++++++++++
 .../services/remote-audio-health.ts      |  70 +++++++++
 5 files changed, 358 insertions(+), 2 deletions(-)
```

Exactly the 5 locked frontend paths. NO backend / migration / signaling / mic-energy.ts / room.page / B3 / B6 / SFU touched. Scope honored.

## Codex-Template Section Check (changes-b4b.md)

| Section | Present | Note |
|---|---|---|
| User Report (verbatim) | YES | R7 quoted verbatim from og-requirements. |
| Root Cause (mechanism) | YES | Mechanism-level: `sfuInboundSummary` (`diagnostics.page.ts:293-301`, `.html:138-143`) rendered frames/pkts/lost/jb but NOT `bytesReceived` and NO silence verdict ⇒ silent remote invisible outside raw JSON. Names the fix mechanism (pure ratio classifier + view wiring). Not symptom-level. |
| Code Changes (per-file WHAT+WHY) | YES | All 5 files, named fns/bindings, WHY stated. |
| Verification (build + smoke) | YES | Unit spec command + result, `npm run build` exit 0, RAH-10 grep anti-assertion, scope check. Honestly flags RAH-14/15 as NOT-run (NS5/MANUAL-PENDING). |
| Caveats | YES | RAH-14/15 manual-pending, latest-entry-only render, publisherName depends on B4a attribution. |

All template sections present and accurate.

## Scenario Coverage + Brief Anchoring

| Scenario | Proof | Verified in diff | Anchor |
|---|---|---|---|
| RAH-1 silent (ratio 0.7) | UNIT | PASS — spec asserts `'silent'` + `concealmentRatio===0.7` | R7 / classifier |
| RAH-2 ok (ratio 0.02) | UNIT | PASS — asserts `'ok'` | classifier |
| RAH-3 null operand ⇒ unknown, no throw | UNIT | PASS — 3 fixtures, `doesNotThrow` + `strictEqual('unknown')`; classifier short-circuits on `=== null` BEFORE division | classifier |
| RAH-4 div0 guard (0+0) ⇒ unknown | UNIT | PASS — `'unknown'`, `notStrictEqual('silent')`, `concealmentRatio===null`; floor (`emittedTotal 0 < 48000`) catches it, ratio fn also guards denominator==0 | JROM div0 invariant |
| **RAH-5 below-floor ⇒ unknown NOT silent** | UNIT | **PASS — JROM invariant.** ratio 0.9 / total 10000 ⇒ `'unknown'` + explicit `notStrictEqual('silent')`; low-ratio-below-floor ⇒ `'unknown'` (not ok). Classifier line: `if (emittedTotal < SILENT_REMOTE_MIN_EMITTED_SAMPLES) return 'unknown'` runs before ratio compare | JROM verify-at-gate |
| RAH-6 kind=video ⇒ unknown | UNIT | PASS — silent-grade numbers on video ⇒ `'unknown'`; `kind !== 'audio'` guard is first line | classifier |
| RAH-7 hardener silent+micSilent ⇒ silent + "silent at source" | UNIT | PASS — verdict stays `'silent'`; label `=== 'SILENT REMOTE · silent at source'` + substring assert | D2 |
| RAH-8 hardener no-flip ok+micSilent stays ok | UNIT | PASS — `'ok'` + `notStrictEqual('silent')` + label `''` | D2 invariant |
| RAH-9 boundary 0.5 inclusive + constants | UNIT | PASS — 0.5 exact ⇒ `'silent'` (`>=`), 0.49998 ⇒ `'ok'`; `SILENT_REMOTE_CONCEALMENT_RATIO===0.5`, `SILENT_REMOTE_MIN_EMITTED_SAMPLES===48000` | constants |
| RAH-10 view calls classifier, no duplicated verdict math (D1) | STRUCTURAL | PASS — `.ts` imports `classifyRemoteAudioHealth`; `grep "concealedSamples /" diagnostics.page.ts` → no match (exit 1). Component verdict comes only from shared fn | D1 |
| RAH-11 row shows bytes+packets+concealment%+badge by name | STRUCTURAL | PASS — `remoteAudioRows()` emits name/bytes/packets/concealment/health/class/badge; HTML renders all; `publisherName()` scans `detail().entries` for `payload.clientId`→`clientName`, falls back to `id.slice(0,8)` (no blank label) | R7 |
| **RAH-12 badge ONLY for silent** | STRUCTURAL+UNIT | **PASS — JROM invariant.** `remoteAudioBadgeLabel` returns `''` for ok/unknown; HTML gates badge text on `@if (row.badge)` / `@if (remoteAudioBadge(track))`; `'SILENT REMOTE'` literal exists ONLY in the .ts label helper (single source), never hardcoded in HTML. Unit asserts `remoteAudioBadgeLabel('ok'/'unknown')===''` incl. with micSilent=true | JROM verify-at-gate |
| RAH-13 one new neutral scss variant, ok/bad reused | STRUCTURAL | PASS — `.audio-recv-neutral` added to shared shape group (scss:218) + one new rule (scss:231-234) mirroring `.mic-live-neutral`; `.audio-recv-ok`/`.audio-recv-bad` rules unchanged | locked View bullet |
| RAH-14 render-smoke 0 console errors | RENDER-SMOKE | MANUAL-PENDING (NS5) — not blocking; build exit 0 is partial regression cover | NS5 |
| RAH-15 real silent remote at-a-glance | MANUAL-PENDING | Correctly deferred to JROM USER seat (NS5) — not blocking | R7 e2e |

Every in-scope diff change traces to a brief field; no out-of-scope additions.

## Code Quality

- `remote-audio-health.ts` is genuinely framework-free: no Angular import; minimal `RemoteAudioInboundStats` structural interface. Confirmed `SfuInboundTrackStats` (`meeting-sessions.service.ts:267-280`) is structurally assignable (kind/bytesReceived/packetsReceived/jitterBufferEmittedCount/concealedSamples all present, same nullability) — and the component compiles passing `SfuInboundTrackStats` into the fns.
- `concealmentRatio` guards both null operands AND zero denominator before dividing — no NaN path. `classifyRemoteAudioHealth` ordering is correct: kind guard → null guard → floor guard → ratio compare. The floor check provably subsumes the 0+0 case (`emittedTotal === 0 < 48000`).
- D2 honored at the type level: `_sourceMicSilent` is underscore-prefixed, commented HARDENER-ONLY, and never read in `classifyRemoteAudioHealth` — it is consumed only by `remoteAudioBadgeLabel`. So the verdict literal is provably independent of source-mic state.
- D1 honored: bytes/packets are string-formatted display only; `concealmentPctLabel` reuses the same `concealmentRatio` (display corroboration), not a parallel verdict. The component has no `concealedSamples /` math (verified).
- View mappers (`remoteAudioHealthClass`, `remoteAudioBadge`, `remoteAudioRows`) parallel the existing `entryAudioRecvClass`/`micLivenessClass` precedents at `diagnostics.page.ts:199,258`. Class union types are tightly typed.

Minor (non-blocking) note: `publisherNameMap()`/`publisherMicSilentMap()` rebuild the Map on every call and `remoteAudioRows()` calls `remoteAudioHealthFor` → `sourceMicSilentFor` per track, each rebuilding the map; an entry list is small and this is the diagnostics view (not a hot path), so acceptable. No fix required.

## Convention Conformance

- Spec harness matches `mic-energy.spec.ts` / `diagnostics-prefs.spec.ts`: `import assert from 'node:assert/strict'`, `.js` ESM import extension, IIFE `{}` blocks, trailing `console.log('remote-audio-health: all assertions passed')`. Test blocks prefixed with scenario IDs (RAH-1..RAH-9, RAH-12).
- SCSS reuses the shared badge-shape group and the `mic-live-neutral` neutral precedent; responsive 980px collapse extended to `.remote-audio-row`. Additive only.
- Angular control-flow (`@if`/`@for`, `[class]` binding) consistent with the existing template.

## Verification (reviewer-run, independent)

- `npx tsx src/app/services/remote-audio-health.spec.ts` → `remote-audio-health: all assertions passed`, exit 0. PRIMARY proof PASSES.
- `npm run build` → `Application bundle generation complete`, exit 0. Only the 3 pre-existing unrelated warnings (RoomsPage DatePipe, Stencil empty-glob, MediaPipe non-ESM) — none reference B4b files. Type-check of `SfuInboundTrackStats`→`RemoteAudioInboundStats` assignability implicitly confirmed.
- `grep "concealedSamples /" diagnostics.page.ts` → no match (D1 anti-assertion holds).
- `git show 6a96b9e --name-only` → exactly the 5 locked paths.
- `git grep "SILENT REMOTE"` → literal only in `remote-audio-health.ts` (label helper) + spec; NOT in HTML — badge string is single-sourced, structurally cannot leak onto ok/unknown branches.

## Required Changes

None.

## Concerns

- RAH-14 (render-smoke) and RAH-15 (real silent remote) remain MANUAL-PENDING per NS5 — correctly NOT required for this gate; the binding proof is the unit classifier + structural wiring, both confirmed. JROM to confirm the live rendered badge at the USER seat on `http://localhost:4700`.
- `publisherName` resolution depends on B4a/R6 attribution populating `payload.clientId/clientName`; out of B4b scope and handled with a non-blank fallback. Noted, not a defect.

STATUS: DONE

---

## Test Report Verification

Reviewer: [reviewer] v2.0 — **Mode 2 (Test Report Verification)**. Verifying `test-report-b4b.md` against real evidence. Adversarial: this is a pure-logic + view batch, so the unit spec is the binding proof. Every claim was independently re-run / re-greped, not trusted.

### Evidence Check
- **Screenshots/output files exist (5):** `unit-remote-audio-health-b4b.txt`, `build-frontend-b4b.txt`, `structural-b4b.txt`, `render-smoke-b4b.txt`, `diagnostics-render-b4b.png` — all present under `validation/B4/screenshots/`.
- **Tested-against URL:** `http://localhost:4700` (consolidated FE+BE proxy), navigated to `/app/diagnostics`. Confirmed in the render-smoke spec (`BASE` default + `page.goto(${BASE}/app/diagnostics)`).
- **Playwright used?** YES — `e2e/tests/rah14-render-smoke-b4b.spec.ts` is a real `@playwright/test` spec: UI login via `loginAsJrom` fixture → `page.goto(..., { waitUntil: 'networkidle' })` → real `page.on('console')`/`page.on('pageerror')` listeners → `.audio-recv-*` DOM locator `.count()` → `expect(...).toHaveLength(0)` on both error arrays. NO `page.setContent`, NO static-HTML theater.
- **Screenshot is a real app render:** `diagnostics-render-b4b.png` = PNG 1280x2520 RGB, 324 KB. Visually confirmed: the live "Call diagnostics" page — session list, inbound audio summary, concealment, TURN/RTT/jitter data. Not static text, not a `setContent` artifact.

### Independent re-runs (I did NOT trust the .txt files)
- **Unit (binding):** re-ran `npx tsx src/app/services/remote-audio-health.spec.ts` myself → `remote-audio-health: all assertions passed`, **EXIT=0**. Real tsx run with `node:assert/strict` IIFE blocks — any failed `assert` throws before the final log, so the success line proves all blocks green. Cross-checked the spec file (commit `6a96b9e`): all required fixtures present — RAH-1 silent (70000/30000=0.7), RAH-2 ok (2000/98000=0.02), RAH-3 null⇒unknown (3 combos + doesNotThrow), RAH-4 0+0 div0 guard (notStrictEqual silent + ratio===null), RAH-5 below-floor with explicit `notStrictEqual(high,'silent')`, RAH-6 kind=video⇒unknown, RAH-7 silent+source ⇒ exact `'SILENT REMOTE · silent at source'`, RAH-8 ok+source stays ok no-flip, RAH-9 boundary 0.5 inclusive + constants (0.5 / 48000), RAH-12 mapper (badge only for silent, '' for ok/unknown ±micSilent).
- **Build:** `build-frontend-b4b.txt` shows real `ng build` → `Application bundle generation complete.` with only the 3 known pre-existing warnings (NG8113 DatePipe, @stencil empty-glob, @mediapipe non-ESM). No new B4b warnings. `git show 6a96b9e --stat` re-run → frontend-only, exactly **5 files** (diagnostics.page.{html,scss,ts} + remote-audio-health.{ts,spec.ts}), no backend.
- **Structural:** re-greped committed source independently — all reproduce: `concealedSamples /` absent in diagnostics.page.ts (D1 no shadow math); `SILENT REMOTE` literal ONLY in remote-audio-health.ts:69, absent in .page.ts AND .html; `.audio-recv-neutral` = 2 textual occurrences (scss:218 selector group + scss:231 the single new style rule) = exactly ONE new class; badge gated via `remoteAudioBadgeLabel` returning `''` for ok/unknown so `@if (row.badge)` / `@if (remoteAudioBadge(track))` only fire for silent. Verified `remoteAudioHealthClass` in page.ts:354 maps silent→bad / ok→ok / unknown→neutral.
- **Render-smoke:** `render-smoke-b4b.txt` shows `1 passed (4.3s)`, console.error=0, pageerror=0, 2 audio-health elements in DOM.

### Coverage Check
| Scenario | Test Case Exists | Evidence | Result |
|----------|------------------|----------|--------|
| RAH-1 silent (0.7) | UNIT spec block (re-run) | unit txt + re-run EXIT=0 | PASS |
| RAH-2 ok (0.02) | UNIT | unit txt | PASS |
| RAH-3 null⇒unknown +doesNotThrow | UNIT (3 combos) | unit txt | PASS |
| RAH-4 0+0 div0 guard | UNIT (notStrictEqual silent, ratio null) | unit txt | PASS |
| RAH-5 below-floor⇒unknown NOT silent (JROM inv) | UNIT (explicit `notStrictEqual('silent')`) | unit txt | PASS |
| RAH-6 kind=video⇒unknown | UNIT | unit txt | PASS |
| RAH-7 silent+source ⇒ "silent at source" (D2) | UNIT (exact-string assert) | unit txt | PASS |
| RAH-8 ok+source stays ok (no-flip) | UNIT (notStrictEqual silent) | unit txt | PASS |
| RAH-9 boundary 0.5 + constants | UNIT | unit txt | PASS |
| RAH-10 view calls classifier, no shadow math (D1) | STRUCTURAL (grep, re-run) | structural txt | PASS |
| RAH-11 row bytes+packets+concealment%+name | STRUCTURAL (Read/grep) | structural txt | PASS |
| RAH-12 badge ONLY for silent (JROM inv) | UNIT mapper + STRUCTURAL gate | unit + structural txt | PASS |
| RAH-13 one new neutral scss class | STRUCTURAL (grep count, re-run) | structural txt | PASS |
| RAH-14 render-smoke 0 console errors | RENDER-SMOKE (real Playwright) | render-smoke txt + PNG | PASS |
| RAH-15 live silent remote at a glance | MANUAL-PENDING (NS5) | n/a — fake-media cannot force | ACCEPTABLE (non-blocking) |

### JROM verify-at-gate invariants
- **RAH-5** (below-floor ⇒ 'unknown' NOT 'silent'): real anti-assertion `assert.notStrictEqual(high, 'silent', ...)` present at spec:75, plus the low-ratio-below-floor case. Classifier source confirms `if (emittedTotal < SILENT_REMOTE_MIN_EMITTED_SAMPLES) return 'unknown'` ordered before the ratio comparison. PASS.
- **RAH-12** (badge only for 'silent'): unit-asserted in the mapper (`remoteAudioBadgeLabel` returns `''` for ok/unknown ±micSilent) AND structurally enforced by the `@if(label)` gates + `remoteAudioHealthClass` mapper. PASS.

### Notes / non-defects
- RAH-15 (live silent remote) is correctly MANUAL-PENDING per NS5 — fake-media headless emits tones on every input so sustained ≥0.5 concealment past the 48000 floor cannot be forced. Per the scenarios' own gate-binding rule this does NOT block the gate; the classifier unit + structural wiring + render-smoke are the binding proof. Not a coverage gap.
- No API-only theater, no static-HTML PASS screenshots, no source-regex dressed as a test. The unit run is a genuine assertion harness; the render-smoke is a genuine browser navigation; the structural greps reproduce against committed source.

### Verdict: VERIFIED
Unit run real (re-run EXIT=0) + build real (frontend-only 5 files) + structural real (greps reproduce) + render-smoke real (genuine Playwright, real PNG, 0/0 errors). Both JROM invariants present and binding. RAH-15 MANUAL-PENDING is acceptable.

STATUS: DONE (VERIFIED)
