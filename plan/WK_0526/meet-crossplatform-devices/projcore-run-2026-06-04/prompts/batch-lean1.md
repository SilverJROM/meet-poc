Batch-LEAN1: Lean pass — TS-clean (TS1/TS2/TS3), dead code, green test baseline (TESTH1), gated safe extraction

Batch ID: batch-lean1
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (B21d committed @ fa89e1e). Do NOT commit (3-AGENT: projcore + independent 2nd validator before commit).
Read FIRST: north-star.md, findings.md (TS1 line 158, TS2/TS3 family).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY (3-AGENT). NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): MEDIUM-HIGH. Confirm/counter at PROPOSED.

## CRITICAL FRAMING — this runs RIGHT BEFORE the regression fan-out and handback
The handback gate is ZERO goal-blocking regressions. This batch is **behavior-preserving ONLY**. It must NOT change any runtime behavior. Every existing test + build must be green BEFORE and AFTER, identically. This is a cleanliness pass, not a feature/behavior pass.

## projcore already re-verified the current state (confirm, don't re-derive):
- `npx tsc --noEmit` (run from frontend/) currently reports **23 errors**: 10 PRODUCTION (room.page.ts ×9 + transcripts.page.ts ×1 — all `Type 'number' is not assignable to type 'Timeout'`, the TS1 timer-typing family) + 13 in SPEC files (media-acquisition.spec, media-screen.spec, recorder-leaks.spec, sfu-client.spec — readonly assigns, arg-count mismatches, `{}` property access, FakeTrack cast).
- The media logic is ALREADY heavily modularized (11 extracted modules: media-acquisition, sfu-roster-utils, sfu-mid-reconcile, room-decisions, room-recording, room-lifecycle, local-media-recovery, media-errors, media-toggle, ice-config-utils, recordings.service). room.page.ts is 4021 lines (Angular orchestrator), sfu-client.service.ts 1634, media.service 626.

## SCOPE (exactly these, in priority order)
1. **TS1 (production, 10 errors) — fix timer typing.** room.page.ts (lines ~2263/2695/2712/2932/2933/3275/3296/3369/3398) + transcripts.page.ts (~187): timer fields are typed as Node's `Timeout` but assigned the browser `window.setTimeout`/`setInterval` return (`number`). Fix the FIELD TYPES to the browser type (`number | null`, or `ReturnType<typeof window.setTimeout>`), and/or use `window.setTimeout`/`window.setInterval` consistently. Behavior identical — only the static types change. After: zero production tsc errors.
2. **TS2/TS3 (spec type drift, 13 errors) — make the specs type-clean.** The spec mocks (FakeTrack/FakeRecorder/fake PC) need readonly-safe construction (e.g. build via `Object.defineProperty` or proper typed fakes / `as unknown as T`), correct arg counts (match the current 5-arg reconcile + current signatures), and typed test doubles so `{}` doesn't error. Do NOT weaken the assertions — keep every spec asserting the SAME outcomes; only fix the TYPES so `tsc --noEmit` passes. The specs must still pass via `npx tsx`.
3. **Dead code — remove only genuinely-unused.** Unused imports, unused private fields/methods, unreachable branches, leftover debug. Use tsc/lint signal; when in doubt, KEEP it (do not remove anything that might be referenced via template/DI/string). List each removal in changes.md with why-safe.
4. **TESTH1 — refresh the pre-existing red backend tests to a green baseline.** backend/tests rooms.test.ts (slug-format expectation drift: app produces clean `team-sync`, the test expects `team-sync-<rand6>`), sessions-ttl.test.ts, signaling-waiting-room.test.ts. These are PRE-EXISTING failures (confirmed worse before this run; app behavior is correct). Update the TEST EXPECTATIONS to match the current correct app behavior so `npm test -w backend` (or the per-file runs) are green — do NOT change backend SOURCE to satisfy a stale test. If a failure turns out to be a real app bug (not a stale expectation), STOP and flag it as NEEDS-INFO rather than papering over it.
5. **Modular extraction — PROPOSE-ONLY, projcore-gated.** You MAY propose additional behavior-preserving extractions from the large files at PROPOSED, EACH with a risk note. projcore will approve ONLY clearly-safe, mechanical, behavior-preserving moves. DEFAULT: do NOT restructure room.page.ts's signals/effects/lifecycle. When unsure, don't.

## Required (acceptance)
1. `npx tsc --noEmit` (frontend) = ZERO errors (production + spec).
2. ALL existing frontend `npx tsx` specs still pass (unchanged assertions).
3. `npx ng build` green.
4. backend: the previously-red rooms/sessions-ttl/signaling-waiting-room tests now pass (expectations refreshed to correct app behavior); the rest stay green. `npm test -w backend` materially greener (ideally fully green; if a test is a genuinely-flaky timing test not fixable by expectation, document it).
5. NO runtime behavior change anywhere. No public API/signal/template behavior change.
6. No regression: every prior batch's behavior intact (the full spec suite proves it).

## Scope guards (MANDATORY — bypass mode)
- Behavior-preserving ONLY. Touch: room.page.ts + transcripts.page.ts (timer types), the 4 spec files (types only, assertions unchanged), dead-code sites, backend test files (expectations only — NOT backend source), plus any projcore-APPROVED extraction.
- Do NOT change: any runtime logic, signal semantics, SFU/signaling/recorder/acquisition behavior, backend SOURCE, the contracts the prior batches established.
- Do NOT remove a symbol unless proven unused (template + DI + string refs checked).

## Deterministic proof (BEFORE and AFTER — prove no behavior change)
- Capture BEFORE: run the full frontend tsx spec suite + `npx ng build` + backend vitest; note pass/fail.
- AFTER: `npx tsc --noEmit` zero errors; the SAME frontend specs all pass; `npx ng build` green; backend tests green (or documented). Deploy DEV (`pm2 restart meet-poc-fe`; restart meet-poc-be too if backend test/src config touched — but you should NOT touch backend src).
- changes.md: list every TS fix, every dead-code removal (why-safe), every backend test-expectation update (old vs new + why the app behavior is correct), and any approved extraction. Explicit statement: NO runtime behavior changed.

## Plan handshake (MANDATORY)
1. Read brief + run `npx tsc --noEmit` to see all 23 + inspect the timer fields + the 4 spec files' mock types + the 3 red backend tests (confirm each is a stale expectation vs a real bug).
2. Reply PROPOSED: the TS1 field-type fix, the spec-mock type approach, the dead-code list (each why-safe), the backend test-expectation updates (old→new), and ANY extraction candidates with risk notes. Files, risks, estimate, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → tsc clean → all specs green → build green → backend green → deploy DEV → STATUS: DONE. Do NOT commit (3-agent).

## Artifacts (under <run-dir>/validation/LEAN1/)
scenarios.md, changes.md (every change + why-safe + NO-behavior-change statement), review.md, test-report.md (before/after), independent-validation.md. decisions/ entry for any extraction.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-lean1 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
