# Scenarios — Batch B4b (R7: surface per-remote inbound AUDIO health + flag silent remote)

Branch: `feat/meet-diagnostics-audio-20260529` (continue @ c3ad403)
Plan: `plan/WK_0526/meet-diagnostics/projcore-run-2026-05-29/implementation-plan.md`
Reference (R7, verbatim): "The existing per-publisher inbound stats (bytesReceived, packetsReceived, concealedSamples) are surfaced in the diagnostics UI so a silent remote is visible at a glance (a peer with near-zero audio bytes + high concealment is flagged), not buried in JSON."

## Scope (locked)
- B4b ONLY = R7 view layer. Frontend-only.
- OUT OF SCOPE — do NOT test here: backend, migrations, B2 audio paths, B3 toggle, B4a attribution/participants[], B6, SFU/transport internals, the in-call UI.
- New unit under test: `frontend/src/app/services/remote-audio-health.ts` exporting `classifyRemoteAudioHealth(track: SfuInboundTrackStats, sourceMicSilent?: boolean | null): 'ok' | 'silent' | 'unknown'` plus named constants `SILENT_REMOTE_CONCEALMENT_RATIO` (= 0.5) and `SILENT_REMOTE_MIN_EMITTED_SAMPLES` (= 48000).
- View under test: `frontend/src/app/pages/diagnostics/diagnostics.page.ts` / `.html` / `.scss`.

## Proof-type legend (per NS5)
- **UNIT** — deterministic assertion in `frontend/src/app/services/remote-audio-health.spec.ts`, run via `cd frontend && npx tsx src/app/services/remote-audio-health.spec.ts` (same harness as `mic-energy.spec.ts` / `diagnostics-prefs.spec.ts`: ESM `import` of the `.js` extension, `node:assert/strict`, IIFE blocks, final `console.log('remote-audio-health: all assertions passed')`). This is the PRIMARY proof.
- **STRUCTURAL** — grep/Read assertion that the markup + classifier wiring exists in the committed source (the rendered silent-remote cannot be forced headless; structure is verifiable, behavior is not).
- **RENDER-SMOKE** — Playwright: diagnostics page loads, 0 console errors. Not a behavior proof; a regression guard that the new render path does not crash.
- **MANUAL-PENDING** — requires a real silent remote publisher; cannot be forced with fake-media headless. Recorded for JROM to confirm at the USER seat on `http://localhost:4700`.

## Verified code facts (Read, not assumed)
- `SfuInboundTrackStats` fields incl. `kind`, `bytesReceived`, `packetsReceived`, `jitterBufferEmittedCount`, `concealedSamples`, `publisherClientId` — `meeting-sessions.service.ts:267-280`.
- `DiagnosticsPayload.micSilent`, `.clientId`, `.clientName`, `.participantId` — `meeting-sessions.service.ts:331-351`. The micSilent example pattern: `micLivenessClass()` at `diagnostics.page.ts:193-197`.
- `sfuDiag(entry)` accessor at `diagnostics.page.ts:272`; existing inbound render `diagnostics.page.html:138-143` (`sfuInboundSummary()` at `:293-301`).
- Badge classes `audio-recv-ok` / `audio-recv-bad` styled at `diagnostics.page.scss:206-214`; neutral precedent `mic-live-neutral` at `:227-230`. New 'unknown' variant must reuse this neutral styling pattern.
- `detail()?.entries` scan precedent at `diagnostics.page.ts:98`.

---

## PART A — Classifier unit assertions (PRIMARY proof)

All Part-A scenarios live in `remote-audio-health.spec.ts`. Every test name MUST start with its scenario ID. `concealmentRatio = concealedSamples / (concealedSamples + jitterBufferEmittedCount)`; `emitted+concealed` = the denominator total = the floor-check quantity.

### RAH-1 — silent: high concealment ratio classifies 'silent'
- Type: feature. Proof: **UNIT**.
- Reference: R7 "a peer with ... high concealment is flagged". Plan PRIMARY discriminator.
- Acceptance Criteria (assertable):
  - AC-1: `classifyRemoteAudioHealth({ kind: 'audio', concealedSamples: 70000, jitterBufferEmittedCount: 30000, ...rest })` returns exactly `'silent'`.
  - AC-2: ratio = 70000 / (70000 + 30000) = 0.7 ≥ `SILENT_REMOTE_CONCEALMENT_RATIO` (0.5).
  - AC-3: total emitted+concealed = 100000 ≥ `SILENT_REMOTE_MIN_EMITTED_SAMPLES` (48000), so floor does NOT short-circuit to 'unknown'.
- Steps:
  - Action: call with the exact fixture above (other `SfuInboundTrackStats` fields may be null) → Expected: `assert.strictEqual(result, 'silent')`.
- Edge: confirm a value just over the floor still classifies (covered by RAH-9 boundary).
- Verification: reviewer reads spec; assert the returned literal is the string `'silent'`, not truthy.

### RAH-2 — ok: low concealment ratio classifies 'ok'
- Type: feature. Proof: **UNIT**.
- Reference: Plan — ratio < 0.5 ⇒ 'ok'.
- Acceptance Criteria:
  - AC-1: `classifyRemoteAudioHealth({ kind: 'audio', concealedSamples: 2000, jitterBufferEmittedCount: 98000 })` returns exactly `'ok'`.
  - AC-2: ratio = 2000 / 100000 = 0.02 < 0.5.
  - AC-3: total 100000 ≥ 48000 floor (so NOT 'unknown' for floor reasons).
- Steps: Action: call with fixture → Expected: `assert.strictEqual(result, 'ok')`.
- Verification: returned literal is `'ok'`.

### RAH-3 — unknown (null operand): either input null ⇒ 'unknown'
- Type: feature. Proof: **UNIT**.
- Reference: Plan — "either operand is null ⇒ 'unknown'".
- Acceptance Criteria:
  - AC-1: `concealedSamples: null, jitterBufferEmittedCount: 30000, kind: 'audio'` ⇒ `'unknown'`.
  - AC-2: `concealedSamples: 70000, jitterBufferEmittedCount: null, kind: 'audio'` ⇒ `'unknown'`.
  - AC-3: both null ⇒ `'unknown'`.
  - AC-4: NO throw on any null combination (`assert.doesNotThrow`).
- Steps: Action: call each null combination → Expected: all return `'unknown'`; none throw.
- Edge: null must short-circuit BEFORE the division (no `null + 30000` numeric coercion verdict).
- Verification: three separate `assert.strictEqual(..., 'unknown')` + one `assert.doesNotThrow`.

### RAH-4 — unknown (div-by-zero guard): both operands 0 ⇒ 'unknown', no NaN, no throw
- Type: feature (JROM invariant — div0 guard). Proof: **UNIT**.
- Reference: Plan — "NO divide-by-zero; NO false-flag".
- Acceptance Criteria:
  - AC-1: `concealedSamples: 0, jitterBufferEmittedCount: 0, kind: 'audio'` ⇒ exactly `'unknown'` (NOT 'silent', NOT 'ok', NOT a thrown error).
  - AC-2: result is never the string `'NaN'` and the function does not return a NaN-derived verdict (`assert.notStrictEqual(result, 'silent')` AND `assert.strictEqual(result, 'unknown')`).
  - AC-3: `assert.doesNotThrow`.
- Steps: Action: call with both-zero fixture → Expected: `'unknown'`, no throw.
- Verification: 0/(0+0) must NOT be allowed to yield NaN≥0.5 → 'silent'; the floor check (total 0 < 48000) catches this. Assert the literal.

### RAH-5 — unknown (below floor): early/short sample ⇒ 'unknown', NOT 'silent' [JROM verify-at-gate invariant]
- Type: feature (EXPLICIT JROM gate invariant). Proof: **UNIT**.
- Reference: Plan — `SILENT_REMOTE_MIN_EMITTED_SAMPLES = 48000`; "An early/short sample (emitted below floor) classifies 'unknown', NOT 'silent'."
- Acceptance Criteria:
  - AC-1: a fixture whose ratio is ≥ 0.5 BUT total < 48000 ⇒ `'unknown'` (the floor MUST override the would-be 'silent'). Example: `concealedSamples: 9000, jitterBufferEmittedCount: 1000` (ratio 0.9, total 10000 < 48000) ⇒ `'unknown'`.
  - AC-2: explicit anti-assertion: `assert.notStrictEqual(result, 'silent', 'short high-concealment sample must NOT false-flag silent')`.
  - AC-3: a low-ratio-but-below-floor fixture (`concealedSamples: 100, jitterBufferEmittedCount: 1000`, total 1100 < 48000) ALSO ⇒ `'unknown'` (not 'ok'), since we cannot yet trust the verdict.
- Steps: Action: call both sub-fixtures → Expected: both `'unknown'`.
- Edge: this is the core "no false-flag during call ramp-up" guard.
- Verification: reviewer confirms BOTH the strictEqual('unknown') and the notStrictEqual('silent') assertions are present.

### RAH-6 — unknown (kind): non-audio track ⇒ 'unknown'
- Type: feature. Proof: **UNIT**.
- Reference: Plan — "kind !== 'audio' ⇒ 'unknown'".
- Acceptance Criteria:
  - AC-1: `{ kind: 'video', concealedSamples: 70000, jitterBufferEmittedCount: 30000 }` (otherwise a 'silent'-grade ratio) ⇒ `'unknown'`.
  - AC-2: kind guard takes precedence over a silent-grade ratio (proves the kind short-circuit runs before ratio math).
- Steps: Action: call with video fixture → Expected: `'unknown'`.
- Verification: assert literal `'unknown'`; confirm the silent-grade numbers did NOT leak through.

### RAH-7 — hardener: silent + sourceMicSilent===true ⇒ 'silent' AND a "silent at source" flag [D2]
- Type: feature (JROM D2). Proof: **UNIT**.
- Reference: Plan D2 — "when verdict=='silent' AND sourceMicSilent===true the badge label reads 'SILENT REMOTE · silent at source'".
- Acceptance Criteria:
  - AC-1: `classifyRemoteAudioHealth(silentFixture, true)` STILL returns `'silent'` (hardener does not change the verdict literal).
  - AC-2: There MUST exist a label/flag path proving the "silent at source" corroboration. Two acceptable designs — the spec must assert whichever the implementer chose:
    - (a) classifier returns the verdict only AND a separate exported pure label helper (e.g. `remoteAudioBadgeLabel(verdict, sourceMicSilent)`) returns `'SILENT REMOTE · silent at source'` when verdict==='silent' && sourceMicSilent===true; OR
    - (b) classifier verdict 'silent', and the label helper returns plain `'SILENT REMOTE'` when sourceMicSilent !== true.
  - AC-3: assert the exact corroborated string contains the substring `'silent at source'`.
- Steps: Action: call classifier with sourceMicSilent=true on the RAH-1 silent fixture → Expected verdict `'silent'`; Action: call the label helper → Expected string includes `silent at source`.
- Edge: hardener applies ONLY when verdict is already 'silent'.
- Verification: reviewer confirms verdict literal unchanged AND the source-corroborated label substring asserted.

### RAH-8 — hardener no-flip: ok + sourceMicSilent===true STAYS 'ok' [D2 invariant]
- Type: feature (JROM D2 — hardener never flips ok→silent). Proof: **UNIT**.
- Reference: Plan D2 — "it NEVER flips 'ok'→'silent'".
- Acceptance Criteria:
  - AC-1: `classifyRemoteAudioHealth(okFixture /* RAH-2 */, true)` returns exactly `'ok'`.
  - AC-2: explicit anti-assertion `assert.notStrictEqual(result, 'silent', 'sourceMicSilent must NOT manufacture a silent verdict')`.
  - AC-3: the label helper for an 'ok' verdict does NOT contain `silent at source`.
- Steps: Action: call classifier ok fixture with sourceMicSilent=true → Expected `'ok'`.
- Verification: both the strictEqual('ok') and the notStrictEqual('silent') present.

### RAH-9 — boundary: ratio exactly at the 0.5 threshold ⇒ 'silent' (>= inclusive)
- Type: feature (constant boundary). Proof: **UNIT**.
- Reference: Plan — "ratio >= 0.5 ⇒ 'silent', else 'ok'".
- Acceptance Criteria:
  - AC-1: `concealedSamples: 50000, jitterBufferEmittedCount: 50000` (ratio exactly 0.500, total 100000 ≥ floor) ⇒ `'silent'` (inclusive `>=`).
  - AC-2: a ratio just under (`concealedSamples: 49999, jitterBufferEmittedCount: 50001`, ratio < 0.5) ⇒ `'ok'`.
  - AC-3 (constant sanity, mirrors `mic-energy.spec.ts` line 91-94): `assert.strictEqual(SILENT_REMOTE_CONCEALMENT_RATIO, 0.5)` AND `assert.strictEqual(SILENT_REMOTE_MIN_EMITTED_SAMPLES, 48000)`.
- Steps: Action: call both boundary fixtures + assert constants → Expected as above.
- Verification: confirms the comparator is `>=` not `>`, and constants are the single source of truth (not magic numbers re-typed in the view).

---

## PART B — View structural assertions (STRUCTURAL proof)

These verify the committed view source wires the classifier and renders the required markup. No behavior is claimed — structure only (NS5).

### RAH-10 — view imports & calls the classifier (no inlined ratio math in the page) [D1: ratio is sole verdict driver]
- Type: feature. Proof: **STRUCTURAL**.
- Reference: Plan — view uses `classifyRemoteAudioHealth`; D1: concealmentRatio is the sole programmatic verdict driver.
- Acceptance Criteria (assertable via grep/Read of `diagnostics.page.ts`):
  - AC-1: `diagnostics.page.ts` imports `classifyRemoteAudioHealth` from `'../../services/remote-audio-health'` (path resolvable; grep finds the import line).
  - AC-2: the page calls `classifyRemoteAudioHealth(` (the verdict comes from the shared pure unit, NOT a duplicated `concealedSamples / (...)` expression living in the component).
  - AC-3: anti-assertion — `diagnostics.page.ts` does NOT contain a hand-rolled `concealedSamples /` division that produces a verdict (grep for `concealedSamples /` returns no verdict-deciding occurrence; a display-only concealment% computed from the same fields is allowed but must not be the verdict source).
- Verification: reviewer greps the committed file for the import + call site; confirms no parallel verdict logic.

### RAH-11 — per-remote-publisher row shows bytesReceived + packetsReceived + concealment% + badge, grouped by participant
- Type: feature. Proof: **STRUCTURAL**.
- Reference: R7 ("bytesReceived, packetsReceived ... surfaced ... visible at a glance"); Plan View bullet.
- Acceptance Criteria (assertable on `diagnostics.page.html` + its summary helper in `.page.ts`):
  - AC-1: the inbound-audio render path surfaces `bytesReceived` (currently `sfuInboundSummary` shows pkts/frames/lost but NOT bytes — bytes MUST now be present for audio tracks).
  - AC-2: `packetsReceived` is surfaced (already in `sfuInboundSummary` as `pkts`; must remain for the audio health row).
  - AC-3: a human-readable concealment percentage is surfaced (e.g. `concealment NN%` or `concealment n/a` when unknown) — D1 corroboration display.
  - AC-4: the publisher is labeled by participant NAME, resolved by scanning `detail().entries` for `payload.clientId === publisherClientId` (per Plan); a fallback label (e.g. truncated `publisherClientId`) is shown when no name match (no blank/undefined label in markup).
  - AC-5: a `SILENT REMOTE` badge element is bound with `[class]` to a class-selector method (parallel to `audioRecvClass` at `diagnostics.page.ts:244`).
- Verification: reviewer Reads `.html` + the new summary/badge-class helper; confirms all four data points + the participant-name scan + the badge binding exist.

### RAH-12 — badge appears ONLY for 'silent', NOT for 'unknown' (and not for 'ok') [JROM verify-at-gate invariant]
- Type: feature (EXPLICIT JROM gate invariant). Proof: **STRUCTURAL** + **UNIT** (class-mapping helper).
- Reference: Plan — "Badge appears ONLY for 'silent' — NOT for 'unknown'."
- Acceptance Criteria:
  - AC-1 (UNIT, in the spec): the view's class-mapper (a pure method/helper, e.g. `remoteAudioHealthClass(verdict)`) MUST map `'silent'` → the bad/flag class (reusing `audio-recv-bad`), `'ok'` → `audio-recv-ok`, `'unknown'` → the NEW neutral variant (e.g. `audio-recv-neutral`). If this mapper is a pure function it is unit-asserted; if it is a private component method, it is STRUCTURALLY asserted by Read.
  - AC-2 (STRUCTURAL): the template shows the visible "SILENT REMOTE" flag text/badge ONLY under a condition equivalent to `verdict === 'silent'` (an `@if` or class gate). For `'unknown'` the row renders neutral styling and a non-alarming label (e.g. `audio health unknown`) — NO "SILENT REMOTE" flag text.
  - AC-3 (STRUCTURAL): for `'ok'` no "SILENT REMOTE" flag text is rendered.
  - AC-4 anti-assertion: grep confirms the literal flag string (e.g. `SILENT REMOTE`) is NOT emitted on the unknown/ok branches.
- Verification: reviewer confirms the conditional gates the flag on `'silent'` exclusively; the 'unknown' path is visibly neutral.

### RAH-13 — new 'unknown' neutral badge variant added to scss, reusing existing pattern
- Type: feature. Proof: **STRUCTURAL**.
- Reference: Plan View bullet — "Badge REUSES existing audio-recv-bad / audio-recv-ok styling; add ONE neutral variant for 'unknown'."
- Acceptance Criteria (assertable on `diagnostics.page.scss`):
  - AC-1: exactly ONE new neutral class is added for the 'unknown' verdict (e.g. `audio-recv-neutral`), styled consistently with the `mic-live-neutral` precedent (`scss:227-230`): muted background/color, same `border-radius`/`padding`/`font-weight` group.
  - AC-2: the new class is added to the shared display-rule selector group (the `:192-204` block) so it inherits the inline-block badge shape.
  - AC-3: existing `audio-recv-ok` / `audio-recv-bad` rules are unchanged (reused, not redefined) — diff touches only the additive neutral rule + selector-group line.
- Verification: reviewer diffs the scss; confirms one additive neutral class, no edits to the ok/bad rules.

---

## PART C — Render smoke + manual (regression guard + live confirmation)

### RAH-14 — diagnostics page render-smoke: loads with 0 console errors after the new render path
- Type: regression. Proof: **RENDER-SMOKE** (Playwright).
- Reference: NS5 — rendered silent-remote not forceable headless; smoke guards the new path doesn't crash.
- Preconditions: frontend served (`http://localhost:4700`), an existing diagnostics session detail reachable (any historical entry, silent or not). If no session exists, the empty/loaded page still counts.
- Acceptance Criteria (assertable in Playwright):
  - AC-1: navigate to the diagnostics page; `page` reaches `networkidle` / the page's root section renders (the existing `<section>` at `diagnostics.page.html`).
  - AC-2: collect `page.on('console')` + `page.on('pageerror')`; assert ZERO `console.error` and ZERO uncaught page errors during load + open of one session detail.
  - AC-3: if at least one SFU inbound audio track is present in the detail, assert at least one element carrying the new health class (`audio-recv-ok|audio-recv-bad|audio-recv-neutral`) is in the DOM (structural-in-browser; verdict value NOT asserted — see NS5).
  - AC-4: a screenshot is saved to `validation/B4/screenshots/` as evidence.
- Edge: a detail with NO sfuDiagnostics still loads without error (the new `@if (sfu.inboundTracks.length)` block simply doesn't render the audio-health section).
- Verification: reviewer confirms the console-error count assertion is `=== 0` (not just "looks fine") and the screenshot exists.

### RAH-15 — MANUAL-PENDING: a real silent remote is flagged "SILENT REMOTE" at a glance
- Type: feature. Proof: **MANUAL-PENDING** (USER seat, `http://localhost:4700`).
- Reference: R7 end-to-end intent. NS5: fake-media headless cannot force a real silent remote with sustained high concealment, so this is JROM-confirmed manually.
- Preconditions: two real participants in a room; one publisher's audio is genuinely silent/concealed (e.g. muted-at-source or dead mic) long enough to clear the 48000-sample floor.
- Acceptance Criteria (manual observation):
  - AC-1: in the diagnostics view, the silent publisher's row shows a visible `SILENT REMOTE` badge in the bad/flag color.
  - AC-2: that row also shows near-zero `bytesReceived` and a high `concealment%` as human corroboration (D1).
  - AC-3: a healthy publisher in the same session shows `audio-recv-ok` (no flag).
  - AC-4: if the silent publisher's source `micSilent===true`, the badge label reads `SILENT REMOTE · silent at source` (D2 hardener).
  - AC-5: the publisher rows are labeled by participant NAME, not raw clientId.
- Verification: JROM confirms at the USER seat; screenshot attached to `validation/B4/screenshots/` when run. Until then this scenario stays MANUAL-PENDING (does NOT block the unit/structural gate, which is the binding proof for B4b).

---

## Scenario → proof-type → test-name map

| ID | What it proves | Proof type | Test name prefix |
|----|----------------|------------|------------------|
| RAH-1 | high ratio ⇒ silent | UNIT | `RAH-1 ...` |
| RAH-2 | low ratio ⇒ ok | UNIT | `RAH-2 ...` |
| RAH-3 | null operand ⇒ unknown, no throw | UNIT | `RAH-3 ...` |
| RAH-4 | both-zero div0 guard ⇒ unknown | UNIT | `RAH-4 ...` |
| RAH-5 | below-floor ⇒ unknown NOT silent (JROM invariant) | UNIT | `RAH-5 ...` |
| RAH-6 | kind!=audio ⇒ unknown | UNIT | `RAH-6 ...` |
| RAH-7 | silent + sourceMicSilent ⇒ silent + "silent at source" (D2) | UNIT | `RAH-7 ...` |
| RAH-8 | ok + sourceMicSilent stays ok (D2 no-flip) | UNIT | `RAH-8 ...` |
| RAH-9 | 0.5 boundary inclusive + constant sanity | UNIT | `RAH-9 ...` |
| RAH-10 | view calls classifier, no duplicated verdict math (D1) | STRUCTURAL | n/a (grep/Read) |
| RAH-11 | row shows bytes+packets+concealment%+badge, by participant name | STRUCTURAL | n/a (Read) |
| RAH-12 | badge ONLY for silent, not unknown/ok (JROM invariant) | STRUCTURAL + UNIT (class-mapper) | `RAH-12 ...` (if mapper pure) |
| RAH-13 | one new neutral scss variant, ok/bad reused | STRUCTURAL | n/a (diff) |
| RAH-14 | page render-smoke, 0 console errors | RENDER-SMOKE | Playwright `RAH-14` |
| RAH-15 | real silent remote flagged at a glance | MANUAL-PENDING | n/a |

## Gate-binding summary
- BINDING proof for B4b = Part A unit assertions (RAH-1..RAH-9, + RAH-12 mapper if pure) ALL passing via `npx tsx src/app/services/remote-audio-health.spec.ts`, PLUS Part B structural assertions (RAH-10..RAH-13) confirmed by Read/grep of committed source, PLUS RAH-14 render-smoke (0 console errors).
- RAH-15 is MANUAL-PENDING and does NOT block the gate (NS5 — cannot be forced headless).
- The two JROM explicit verify-at-gate invariants are RAH-5 (early/short ⇒ unknown not silent) and RAH-12 (badge only for silent). Both MUST be present and passing.

STATUS: DONE
