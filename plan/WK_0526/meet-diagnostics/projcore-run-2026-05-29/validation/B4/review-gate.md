# review-gate.md — B4a-gate: diagnostics admittance-gate reconnect-survival fix

**Reviewer:** [reviewer]
**Date:** 2026-05-30
**Commit reviewed:** `c3ad403` (diff `92d52fc..c3ad403`)
**Branch:** feat/meet-diagnostics-audio-20260529
**Verdict:** **APPROVE**

---

## What I reviewed

- `git diff 92d52fc..c3ad403` (the truth — not the summary).
- Final `isAdmittedDiagnosticPoster` (`backend/src/modules/signaling/index.ts:501-526`) and `peerMatchesDiagnosticPoster` (:489-499) at `c3ad403`.
- `ClientIdentity` type (:61-66), `rememberClientIdentity` / `revokeClientIdentity` (:407-426).
- DR-28 test body (unchanged) + new G-1/G-2/G-3 tests.
- scenarios-gate.md (G-1..G-7), changes-gate.md.

Files changed (3): `signaling/index.ts` (+15/-4), `session-diagnostics.test.ts` (+136), `changes-gate.md` (new). No frontend change. Scope is tight.

---

## The deviation — adjudicated SOUND and FAITHFUL

The brief's literal `ownedByDifferentPeer` predicate (accept durable when the live owner of `poster.clientId` *matches* clientKey+participantId) is unsafe **because `ClientIdentity` carries no `userEmail` field** (confirmed at signaling/index.ts:61-66 — only `participantId`, `name`, `wasAdmitted`, `revoked`). The durable branch therefore cannot enforce `userEmail`. Under the literal predicate, an authenticated different user posting with a live owner's clientKey+participantId+clientId would be accepted by the durable branch, overriding path-1's `userEmail` rejection — an owner-impersonation hole that would regress DR-28.

Dev's implemented guard is strictly stronger: the durable path returns true ONLY when `!poster.clientId` OR `!live.admitted.has(poster.clientId)`. For ANY clientId currently owned by a live admitted peer, the durable branch does not short-circuit; control falls through to the function-final `return false`, and path-1 (which already ran first and enforces `userEmail`) is the sole authority. This is behaviorally inert for legitimate flows (see point 4) and removes the spoofable durable-accept. **Faithful to JROM's intent** ("unless a different live peer owns the clientId") and safer.

---

## The 7 confirmations (adversarial)

### 1. Durable path still rejects never-admitted / revoked / unknown-clientKey — CONFIRMED
The durable block is gated by `identity?.wasAdmitted === true && identity.revoked !== true && identity.participantId === poster.participantId` (:512-516). This pre-condition is UNCHANGED by the diff (the diff only touched the inner clientId sub-condition).
- Unknown clientKey → `clientIdentities.get(poster.clientKey)` is `undefined` → `identity?.wasAdmitted` is falsy → block skipped → `return false` → 403. (G-3, asserted at test, `.expect(403)`.)
- Never-admitted/revoked → blocked by `wasAdmitted===true` / `revoked!==true`. `revokeClientIdentity` (:418-426) sets `wasAdmitted:false, revoked:true` on explicit leave → durable path rejects. (G-4 — covered by code + existing revoke path; see Caveats.)

### 2. Relaxation changes ONLY the clientId sub-condition — CONFIRMED
Diff replaced `&& !poster.clientId` (inside the `if`) with two lines inside the block: `if (!poster.clientId) return true; if (!live.admitted.has(poster.clientId)) return true;`.
- `poster.clientId` absent → `return true` (unchanged accept). (G-2.)
- `poster.clientId` present AND not in `live.admitted` (genuinely expired peer) → newly `return true` (closes G-1).
- `poster.clientId` present AND IS a live admitted peer → neither `return true` fires → falls through → `return false` at function end; path-1 already governed it (enforcing clientKey+participantId+clientId+userEmail). ✓

### 3. IMPERSONATION CHECK (the DR-28 hole) — CONFIRMED BLOCKED
Trace for `otherCookie` user (userEmail=other@) posting owner's live clientId+participantId+`clientKey:'owner-key'`:
- **Path-1** (runs first): owner peer matches clientKey+participantId+clientId, but `poster.userEmail (other@) !== peer.userEmail (jrom@)` → `peerMatchesDiagnosticPoster` returns false (:496). Path-1 rejects.
- **Durable block**: `identity('owner-key')` wasAdmitted+participantId match. `!poster.clientId` = false. `live.admitted.has(poster.clientId)` = true (owner is LIVE) → `!true` = false → neither return fires.
- Falls through → `return false` → **403**. ✓
- DR-28 test (`session-diagnostics.test.ts`) **was NOT modified** by the diff — its `.set('Cookie', otherCookie)...expect(403)` assertion (test body lines ~118-123 at c3ad403) stands. The test-file diff shows only the `vitest` import line changed plus net-new G-1/G-2/G-3 blocks; no `-` line touches DR-28's body or its 403 assertions. changes-gate.md documents DR-28 staying green (G-7).

### 4. Stricter guard is behaviorally inert for legitimate flows — CONFIRMED
The "same-identity live peer owns the clientId" case (a guest who rejoined and is live) is handled by **path-1 returning true earlier** — path-1 runs BEFORE the durable block (function order at :503-517: `live.admitted` loop, then `live.reconnecting` loop, then durable). So a legitimate live poster is already accepted by path-1 and never reaches the durable guard. Dev's stricter durable guard therefore never harms a legitimate poster; it only removes a durable-accept that could be spoofed. Reasoning verified against code order.

### 5. Repro-first RED→GREEN — CONFIRMED
changes-gate.md § Verification shows RED (`expected 200, got 403` on unfixed code, G-1) → GREEN (`Tests 1 passed | 12 skipped`) and full-suite `25 passed (25)`. G-1's `.expect(200)` + persisted-row GET assertions are present in the test diff. The scenarios doc's reproduce-first 403 assertion matches the documented RED.

### 6. Scope — CONFIRMED
Only the durable-identity block in `signaling/index.ts` changed (+ the test file + new changes-gate.md). `peerMatchesDiagnosticPoster`, path-1, path-2, `cleanupReconnectState`, `revokeClientIdentity`, `rememberClientIdentity`, and POST gate ordering are UNCHANGED (verified by diff — the only `signaling/index.ts` hunk is the durable block). No frontend change. No TODO / dead code. The added block comment is a security-boundary rationale anchor (allowed), not a deferral.

### 7. changes.md Codex sections — CONFIRMED
changes-gate.md contains: User Report (verbatim R6 + JROM ruling), Root Cause (mechanism-level, cites the `!poster.clientId` gate + `cleanupReconnectState` not clearing identities), Code Changes (with the documented in-scope deviation rationale), Verification (RED→GREEN + full suites + builds), Caveats (G-6 honesty note), Standing Rules. All present.

---

## Caveats noted (not blocking)

- **G-4 (revoked identity) has no dedicated new test.** It is covered by code reasoning (the unchanged `revoked !== true` guard + `revokeClientIdentity` write path) and the existing explicit-leave coverage. scenarios-gate.md G-4 listed a vitest; dev did not add it. Acceptable: the revoke guard is unchanged by this diff (pre-existing, already covered), and the security property is preserved by inspection. Not a regression introduced here.
- **G-6 (collision safety) is code-reasoning only**, by design (scenarios-gate.md G-6 explicitly says it is not black-box-testable without refactoring production code for a forced UUID collision). The `if (!live.admitted.has(poster.clientId)) return true;` line is the verifiable guard; confirmed present (:524). Honest caveat in changes-gate.md.
- Smoke held ("localhost only — deploy held per NS6") — consistent with no deploy in scope.

None of these open a path where a non-admitted or wrong-user poster gets 200.

---

## Conclusion

The deviation is sound, faithful to JROM's intent, and strictly safer than the literal brief. The impersonation path is provably blocked (path-1 userEmail rejection + durable guard never short-circuits a live-owned clientId). The reconnect gap (G-1) is genuinely closed with repro-first RED→GREEN evidence. Scope is tight; changes.md is complete. No path found where a non-admitted or wrong-user poster could obtain 200.

**STATUS: DONE (APPROVE)**

---

## Test Report Verification (B4a-gate)

**Reviewer:** [reviewer] — Mode 2 (Test Report Verification)
**Date:** 2026-05-30
**Inputs verified:** test-report-gate.md, scenarios-gate.md (G-1..G-7), evidence `screenshots/{vitest,build-backend,build-frontend,structural}-gate-b4a.txt`, the actual `backend/tests/session-diagnostics.test.ts` @ `c3ad403`, and `git diff 92d52fc..c3ad403`.

### Evidence is REAL, not theater — CONFIRMED

**vitest-gate-b4a.txt is a genuine run (not fabricated text).**
- Real Vitest banner: `RUN  v2.1.9 /home/agjrom/websites/meet-poc/backend`.
- Real interleaved per-test stdout with non-deterministic room IDs + 16-hex clientIds (e.g. `[room 88c675d69bff] ADMITTED Guest (1aa48584456ed3e6)`), distinct per test — consistent with live WS servers, not hand-typed.
- Real per-test timings: `tests/session-diagnostics.test.ts (13 tests) 10139ms`, with line-item durations `319ms / 7224ms / 306ms`; `signaling-reconnect.test.ts (12 tests) 3294ms`.
- Footer: `Test Files 2 passed (2)`, `Tests 25 passed (25)`, `Duration 14.02s` with the transform/collect/tests breakdown. Matches the report's "25 passed / 14.02 s".

**G-1 actually expires the peer BEFORE posting — CONFIRMED (not a stubbed assertion).**
`session-diagnostics.test.ts:498-548`. Drives owner join → guest join → `knock` → owner `admit` → guest `admitted`. Then the real expiry sequence: `vi.useFakeTimers()` → await `peer-reconnecting` → `guest.terminate()` → `vi.advanceTimersByTimeAsync(120_001)` → `vi.useRealTimers()`. The vitest stdout for G-1 shows `RECONNECTING Guest (1aa48584456ed3e6)` THEN `EXPIRED Guest (1aa48584456ed3e6)` — proof the grace timer actually fired and the peer left `live.admitted`+`live.reconnecting` before the POST. Only then does it POST with the STALE `guestAdmitted.clientId` + `participantId` + `clientKey:'durable-gate-key-g1'`, asserting `.expect(200)` + `res.body.entry` not null, and a follow-up owner-authed GET asserting `entries.length >= 1`, `payload.clientName === 'Guest'`, `payload.clientKey === 'durable-gate-key-g1'`. Substantive, multi-assertion, label matches behavior.

**G-2 — CONFIRMED.** Same full expiry sequence (stdout shows `EXPIRED Guest (9a9e28a766a00507)`), then POST with `clientId: undefined` + correct durable key → `.expect(200)` + non-null entry. Exercises the unchanged `!poster.clientId` branch.

**G-3 — CONFIRMED.** Real admit flow, then POST with `clientKey:'never-admitted-key-g3'` carrying the real admitted guest's `clientId` + `participantId` → `.expect(403)`. Label ("never-admitted clientKey ... plausible clientId") matches the assertion. Stdout shows the admit lifecycle but no EXPIRED line (expiry not needed for this security path).

### DR-28 owner-impersonation test UNCHANGED — CONFIRMED

The full `git diff 92d52fc..c3ad403` on the test file has exactly ONE removed line: `-import { describe, expect, it } from 'vitest';` (replaced by the expanded `afterEach, describe, expect, it, vi` import). Everything else is purely additive (an `afterEach(() => vi.useRealTimers())` block + the net-new G-1/G-2/G-3 `it` blocks). DR-28's body is byte-for-byte intact, including the owner-impersonation assertion at `:119-123` (`otherCookie → .expect(403)`) and the never-admitted `.expect(403)` at `:124-127`. The DR-28 diff was NOT weakened.

### Builds + structural scope — CONFIRMED

- `build-backend-gate-b4a.txt`: `tsc -p tsconfig.json`, no error output → exit 0 (matches report).
- `build-frontend-gate-b4a.txt`: `ng build` → `Application bundle generation complete` + `Output location: .../dist/meet-poc-frontend`; only 3 pre-existing warnings (DatePipe unused, stencil empty-glob, mediapipe not-ESM) — no new errors → exit 0.
- `structural-gate-b4a.txt` + my own read of `signaling/index.ts:489-531`: the only source hunk is inside the durable-identity block of `isAdmittedDiagnosticPoster` — `&& !poster.clientId` removed from the `if`, replaced by `if (!poster.clientId) return true; if (!live.admitted.has(poster.clientId)) return true;`. `peerMatchesDiagnosticPoster` (:489-499) and the POST-gate path ordering (path-1 admitted loop → path-2 reconnecting loop → durable) are untouched. `git diff --stat` confirms exactly 3 files (signaling/index.ts, the test, changes-gate.md), no frontend/migration files.

### Theater check — NONE FOUND

No assert-nothing tests (every G-test ends in `.expect(200|403)` plus body assertions). G-1 genuinely expires the peer (EXPIRED stdout line) before posting — not a fake expiry. No label/assertion mismatch. Caveats are honestly disclosed: G-4 is code-reasoning + existing revoke-path coverage (no new dedicated test — acceptable, the `revoked !== true` guard is unchanged by this diff), G-6 is code-reasoning-by-design (forced UUID collision not black-box-testable). Neither caveat opens a 200 path for a non-admitted/wrong-user poster.

### Verdict

Evidence is real (genuine Vitest run, real timings, 25/25), the three new tests carry substantive assertions, G-1 actually expires the peer before posting the stale clientId, both builds are clean, scope is confined to the durable block, and the DR-28 impersonation guard is unmodified and still asserts 403. Test report is faithful to the artifacts.

**STATUS: DONE (VERIFIED)**
