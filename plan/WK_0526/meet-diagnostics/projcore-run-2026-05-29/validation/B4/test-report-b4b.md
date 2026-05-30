# Test Report — Batch B4b (R7: per-publisher remote audio health + SILENT REMOTE flag)

## Tested Against (URL)
- Local consolidated proxy: `http://localhost:4700` (PM2 `meet-poc-fe` serving freshly-built static `dist/` in NODE_ENV=production + `meet-poc-be`). Render-smoke navigated to `/app/diagnostics`.

## Branch
- `feat/meet-diagnostics-audio-20260529` @ `6a96b9e` (parent `c3ad403`).
- Commit `git show 6a96b9e --stat` touches FRONTEND ONLY (5 files: diagnostics.page.{html,scss,ts}, remote-audio-health.{ts,spec.ts}). NO backend files — BE unaffected, confirmed.

## Proof order executed
1. UNIT (binding) → 2. BUILD → 3. STRUCTURAL → 4. RENDER-SMOKE. RAH-15 = MANUAL-PENDING (NS5).

---

## 1. Unit Tests (PRIMARY / binding) — `npx tsx src/app/services/remote-audio-health.spec.ts`
Exit 0. Final line: `remote-audio-health: all assertions passed`. Output: `screenshots/unit-remote-audio-health-b4b.txt`.

The spec runs as IIFE assertion blocks (same harness as mic-energy.spec.ts) — any failed `assert` throws and aborts before the final log, so the single success line proves ALL blocks below passed. Fixture → block map (verified by Read of the spec):

| # | Scenario | Action (fixture) | Expected | Actual | Result |
|---|----------|------------------|----------|--------|--------|
| RAH-1 | high ratio ⇒ silent | concealed 70000 / emitted 30000 (ratio 0.7, total 100k) | `'silent'` + concealmentRatio===0.7 | strictEqual passed | PASS |
| RAH-2 | low ratio ⇒ ok | concealed 2000 / emitted 98000 (0.02) | `'ok'` | strictEqual passed | PASS |
| RAH-3 | null operand ⇒ unknown, no throw | 3 null combos | all `'unknown'` + doesNotThrow | passed | PASS |
| RAH-4 | div0 guard ⇒ unknown | concealed 0 / emitted 0 | `'unknown'`, notStrictEqual silent, ratio null, doesNotThrow | passed | PASS |
| RAH-5 | below-floor ⇒ unknown NOT silent (JROM invariant) | (9000/1000 ratio 0.9 total 10k) AND (100/1000 total 1100) | both `'unknown'` + notStrictEqual('silent') | passed | PASS |
| RAH-6 | kind!=audio ⇒ unknown | kind video, silent-grade 70000/30000 | `'unknown'` + notStrictEqual silent | passed | PASS |
| RAH-7 | silent + sourceMicSilent ⇒ silent + "silent at source" (D2) | silent fixture, sourceMicSilent=true | verdict `'silent'`; label === `SILENT REMOTE · silent at source` | passed | PASS |
| RAH-8 | ok + sourceMicSilent stays ok (D2 no-flip) | ok fixture, sourceMicSilent=true | `'ok'` + notStrictEqual silent + label `''` | passed | PASS |
| RAH-9 | 0.5 boundary inclusive + constants | (50000/50000 ratio 0.5) + (49999/50001) + constants | `'silent'` / `'ok'`; RATIO===0.5, FLOOR===48000 | passed | PASS |
| RAH-12 | label-mapper: badge only for silent | remoteAudioBadgeLabel(silent/ok/unknown ±micSilent) | `'SILENT REMOTE'` only for silent; `''` otherwise | passed | PASS |

Both JROM verify-at-gate invariants present and passing: RAH-5 (below-floor ⇒ unknown, explicit `notStrictEqual(..., 'silent')`) and RAH-12 (label empty for ok/unknown ⇒ badge gated off).

## 2. Build — `npm run build`
Exit 0. Output: `screenshots/build-frontend-b4b.txt`. `Application bundle generation complete.` Only the 3 known pre-existing warnings (NG8113 DatePipe unused in RoomsPage; `@stencil/core` empty-glob; `@mediapipe/selfie_segmentation` non-ESM). No new warnings/errors from B4b files.

## 3. Structural Assertions (STRUCTURAL) — `screenshots/structural-b4b.txt`

| # | Assertion | Result |
|---|-----------|--------|
| RAH-10/D1 | `grep "concealedSamples /" diagnostics.page.ts` returns NOTHING (no shadow verdict math) | PASS (no match) |
| RAH-10 AC-1/2 | page imports `classifyRemoteAudioHealth`/`concealmentRatio`/`remoteAudioBadgeLabel` from `'../../services/remote-audio-health'` (ts:19-23) and calls `classifyRemoteAudioHealth(...)` at ts:351 | PASS |
| literal scope | `'SILENT REMOTE'` lives ONLY in `remote-audio-health.ts` (svc:69). Absent in diagnostics.page.ts AND .html (label flows through `remoteAudioBadgeLabel`) | PASS |
| RAH-11 | html surfaces bytesReceived (html:104, html:164), packetsReceived (html:105), concealment% (html:106 + concealmentPctLabel ts:368), per-track audio badge, AND an at-a-glance "Remote audio health" block (`<div class="remote-audio-health">` html:99) | PASS |
| RAH-11 AC-4 | publisher labeled by participant NAME via `publisherNameMap()` scanning `detail().entries` for clientId→clientName (ts:319-327); fallback `publisherClientId.slice(0,8)` — no blank label | PASS |
| RAH-12 | badge gated on truthy label string: `@if (row.badge)` (html:107) + inline `@if (remoteAudioBadge(track))` (html:164); ok→"audio ok", unknown→"audio health unknown" (neutral, no flag). class-mapper silent→audio-recv-bad / ok→audio-recv-ok / unknown→audio-recv-neutral (ts:354) | PASS |
| RAH-13 | exactly ONE new `.audio-recv-neutral` class: scss:218 in the shared display-rule selector group (badge shape) + scss:231 the single new muted style rule (mirrors mic-live-neutral). audio-recv-ok/bad unchanged. (2 textual occurrences = 1 new class identifier, by the established neutral-variant pattern) | PASS |

## 4. Render-Smoke (RENDER-SMOKE / Playwright) — RAH-14 — `screenshots/render-smoke-b4b.txt`
Test: `e2e/tests/rah14-render-smoke-b4b.spec.ts` (login via shared `loginAsJrom` fixture → navigate `/app/diagnostics`). Run via root Playwright 1.60.0, chromium, against `http://localhost:4700`.

| # | Scenario | Action | Expected | Actual | Screenshot | Result |
|---|----------|--------|----------|--------|------------|--------|
| RAH-14 | diagnostics render-smoke | login → load `/app/diagnostics`, open session detail, settle | page `<section>` visible; 0 console.error; 0 pageerror | section rendered; console.error=0; pageerror=0; 2 audio-health elements in DOM (real session w/ inbound audio) | `diagnostics-render-b4b.png` | PASS |

`1 passed (4.3s)`. AC-3 satisfied: 2 elements carrying `.audio-recv-*` classes present in the live DOM (verdict value NOT asserted per NS5). Screenshot shows the "Remote audio health" rows (bytes + concealment% + badges) and the per-track inbound audio line with the new health classes.

## 5. MANUAL-PENDING (NS5) — RAH-15
A REAL silent remote cannot be forced headless (fake-media emits tones on every input, so concealment never sustains ≥0.5 past the 48000-sample floor). RAH-15 (live "SILENT REMOTE" flag at a glance, incl. D2 "silent at source" corroboration) is **MANUAL-PENDING** — JROM confirms at the USER seat on `http://localhost:4700` with two real participants, one genuinely silent. NOT fabricated. Per the scenarios' gate-binding summary, RAH-15 does NOT block the gate; the classifier unit + structural wiring + render-smoke are the binding proof.

---

## Summary
- UNIT: PASS — spec exit 0, all RAH-1..RAH-9 + RAH-12 mapper assertions green; both JROM invariants (RAH-5, RAH-12) present.
- BUILD: PASS — exit 0, only 3 pre-existing warnings; frontend-only commit, BE unaffected.
- STRUCTURAL: PASS — RAH-10..RAH-13 all hold (no shadow verdict math; classifier wired; SILENT REMOTE literal scoped to the service; bytes+concealment%+badge+at-a-glance block + name scan; one new neutral scss class; badge gated to silent only).
- RENDER-SMOKE: PASS — RAH-14 0 console errors, 0 page errors, page renders, 2 health elements in DOM, screenshot saved.
- Console errors observed: 0. Page errors: 0.
- Screenshots/output saved: `unit-remote-audio-health-b4b.txt`, `build-frontend-b4b.txt`, `structural-b4b.txt`, `render-smoke-b4b.txt`, `diagnostics-render-b4b.png` (all under `validation/B4/screenshots/`).
- Test pollution: failed-run `test-results/rah14-render-smoke-b4b-*` dirs removed. No test rooms created.

## Verdict: PASS
RAH-15 remains MANUAL-PENDING (NS5 — cannot be forced headless), which by the scenarios' own gate-binding rule does not block the B4b gate.
