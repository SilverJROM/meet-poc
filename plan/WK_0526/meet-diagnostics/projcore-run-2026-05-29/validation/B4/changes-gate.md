# changes-gate.md — B4a-gate: Reconnect-survival fix for the diagnostics admittance gate (R6 reliability half)

## Branch
- `feat/meet-diagnostics-audio-20260529` — committed ON TOP of `92d52fc` (no new branch, no merge).
- Cut-from sha for this change: `92d52fc` ([batch-4a] per-participant diagnostics attribution).

## User Report (verbatim)
og-requirements R6:
> "R6 — Guest/all-sides reliability + per-participant attribution. Guest participants' diagnostics upload reliably for the whole call (incl. across reconnect) ..."

JROM ruling (verbatim intent):
> "JROM has now RULED on the escalated admittance gate - APPROVED the relaxation. ... in isAdmittedDiagnosticPoster (signaling/index.ts:511-519) relax the !poster.clientId guard so a durable identity (clientKey+participantId+wasAdmitted) is accepted even with a STALE clientId, UNLESS a different LIVE admitted peer currently owns that clientId (KEEP that safety check). Add the repro vitest (the churn scenario: 403 before -> 200 after)."

## Root Cause (mechanism-level)
The durable across-reconnect survivor branch in `isAdmittedDiagnosticPoster`
(`backend/src/modules/signaling/index.ts:511-519`) was gated behind `!poster.clientId`.

The live client always sends `clientId` (frontend `room.page.ts:2780` = `this.myId()`).
After a peer expires from BOTH `live.admitted` and `live.reconnecting`
(`expireReconnectingPeer` :524-535 → `cleanupReconnectState` :329-337, which does NOT
clear `live.clientIdentities` — so the durable identity survives with `wasAdmitted=true`),
a re-posted diagnostics sample carrying the STALE `clientId` reached the durable branch,
which was bypassed because `poster.clientId` was truthy → returned `false` → HTTP 403.
Result: guest diagnostics dropped silently across longer reconnects (past the 120 s
`DISCONNECT_GRACE_MS` window). Path-1 (live admitted loop) and path-2 (reconnecting loop)
both miss because the peer is gone from both maps; only the durable identity remains.

## Code Changes

### `backend/src/modules/signaling/index.ts` — `isAdmittedDiagnosticPoster` durable-identity block (only)
**WHAT:** Removed the `!poster.clientId` guard from the durable-identity acceptance
condition and replaced it with an explicit two-line stale-clientId safety check inside
the block.

**Final guard semantics:** a durable admitted identity (`wasAdmitted===true`,
`revoked!==true`, `participantId` matches) is accepted when:
- `!poster.clientId` (pre-existing behavior, unchanged), OR
- `poster.clientId` is present AND **no live admitted peer currently owns that clientId**
  (`!live.admitted.has(poster.clientId)`) — i.e. the expired/reconnected case.

**WHY:** `clientKey` is the unforgeable, post-admission-only anchor (written only by
`rememberClientIdentity` on owner admit, line 407-416). Accepting a stale clientId on the
durable path closes the R6 reconnect gap. The live-ownership check is the collision/safety
boundary: if the supplied clientId is still owned by ANY live admitted peer, the durable
branch does NOT short-circuit — the live-admitted loop above (path-1, via
`peerMatchesDiagnosticPoster`, which additionally enforces `userEmail`) remains the sole
authority for live clientIds.

**REVISED vs the brief's literal replacement (in-scope deviation — documented):**
The brief's exact replacement used an `ownedByDifferentPeer` predicate that still accepts
when the live owner of `poster.clientId` *matches* `clientKey`+`participantId`. That exact
code REGRESSED the existing DR-28 test (`session-diagnostics.test.ts:115-119`): an
authenticated non-owner (`otherCookie`) POSTing with the owner's live `clientId` +
`participantId` + `clientKey:'owner-key'` started returning 200 instead of 403. Cause: the
durable branch does not (and cannot — `ClientIdentity` stores no `userEmail`, type at
:61-66) check `userEmail`, so when the live owner matched on clientKey+participantId the
durable branch overrode path-1's `userEmail` rejection, opening an owner-impersonation hole.
The corrected guard (`!live.admitted.has(poster.clientId)`) is strictly **stronger/safer**:
it never short-circuits for a clientId that any live peer owns, deferring entirely to
path-1 (which enforces `userEmail`). This satisfies G-7 (DR-28 stays green) AND G-6's
reviewer-verifiable requirement (a different live peer owning the stale clientId → reject).
The relaxation intent (stale clientId of an EXPIRED peer accepted) is fully preserved.

Touched ONLY the durable-identity block. No change to path-1, path-2,
`peerMatchesDiagnosticPoster`, `cleanupReconnectState`, `revokeClientIdentity`, the POST
gate ordering, or the frontend.

### `backend/tests/session-diagnostics.test.ts` — repro + regression tests
- Added `vi` and `afterEach` to the vitest import; added `afterEach(() => vi.useRealTimers())`
  to the describe block (fake timers used by G-1/G-2).
- **G-1** (reproduce-first red→green): owner + guest (clientKey `durable-gate-key-g1`,
  `supportsReconnect:true`) join; owner admits; capture `guestAdmitted.clientId` (stale) +
  `participantId`. Fake-timer expiry (`guest.terminate()` → await `peer-reconnecting` →
  `advanceTimersByTimeAsync(120_001)`). POST with the STALE `clientId` → expect 200 +
  `body.entry` present; GET (owner-authed) → `entries[0].payload.clientName==='Guest'` &
  `clientKey==='durable-gate-key-g1'`.
- **G-2** (no-regression): same expired state, POST with `clientId: undefined` → expect 200.
- **G-3** (security): same admit flow with `clientKey:'never-admitted-key-g3'` + a plausible
  clientId → expect 403.
- G-5 coverage relied on existing DR-41 (live admitted in-call path, `session-diagnostics.test.ts:188-191`).

## Commits
- (single commit on top of 92d52fc — see git log for hash)

## Standing Rules
- The durable diagnostics-gate branch must never short-circuit-accept a `clientId` that is
  owned by a live admitted peer; the live-admitted loop (path-1, which enforces `userEmail`)
  is the authority for live clientIds. Durable acceptance is for the EXPIRED case only.

## Verification

### Reproduce-first (red → green)
- **RED (unfixed code, G-1 against the original `!poster.clientId`-gated block):**
  ```
  FAIL  tests/session-diagnostics.test.ts > ... > G-1 accepts a durable admitted guest re-posting with a STALE clientId after reconnect grace expiry
  Error: expected 200 "OK", got 403 "Forbidden"
   ❯ tests/session-diagnostics.test.ts:535:8   .expect(200);
  ```
- **GREEN (after fix):**
  ```
  ✓ tests/session-diagnostics.test.ts (13 tests | 12 skipped)
    ✓ ... > G-1 accepts a durable admitted guest re-posting with a STALE clientId after reconnect grace expiry
  Tests  1 passed | 12 skipped (13)
  ```

### Full suites
- `npx vitest run tests/session-diagnostics.test.ts tests/signaling-reconnect.test.ts`
  → **PASS** — `Tests  25 passed (25)` (13 session-diagnostics incl. G-1/G-2/G-3 + DR-28
  no-regression; 12 signaling-reconnect, no regression).
- `npm run build` (backend tsc -p tsconfig.json) → **PASS**, exit 0.
- `cd frontend && npm run build` → **PASS**, exit 0 (pre-existing unrelated `@mediapipe/selfie_segmentation`
  not-ESM warning only; no frontend changes made).

### Smoke
- Held — "localhost only — deploy held per NS6." Not deployed.

## Caveats
- **G-6 collision-safety branch is defensively coded but not black-box-testable**
  (PRE-EXISTING-style honest note, not a deferral): server-assigned `clientId` values are
  random UUIDs generated at join time; two independent WS connections never naturally
  produce the same clientId, and no test hook injects a known UUID into the assignment
  function. Forcing a collision would require refactoring production code solely for
  testability, which is not warranted. The branch is reviewer-verifiable by inspection:
  the `if (!live.admitted.has(poster.clientId)) return true;` line at the durable block
  guarantees a stale clientId owned by ANY live peer (the only way a collision manifests)
  is NOT accepted via the durable path.
- No new dead code / TODOs. The block comment is a security-boundary rationale anchor, not a
  deferral.
