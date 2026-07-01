# Decision — B2b implementation choices (unannounced-by-brief, made mid-implementation)

**Date:** 2026-07-01
**Batch:** B2b
**Status:** Autonomous (within APPROVED-PLAN scope; logging per trust-defaults for the choices the
handshake didn't spell out)

## Decision 1 — `subscribeAllAdvertisedRemotes()` does not special-case `LiveMidConflictError`

Unlike `subscribeIfNeeded`'s catch (which routes `LiveMidConflictError` into a dedicated
`scheduleLiveMidConflictRenegotiationRetry` retry), the rejoin's resubscribe loop treats ANY failure —
including a mid conflict — as a generic subscribe failure and falls back into
`scheduleRecoveryEscalation()`.

**Why:** the resubscribe loop is sequential (one publisher fully awaited before the next starts) on a
freshly-rotated PC, so the conditions that produce a live mid conflict in steady state (concurrent
subscribes racing for the same transceiver) shouldn't arise here. Adding the full specialized-retry
branch would duplicate ~20 lines of existing logic for a case that should be practically unreachable in
this specific call path, and the generic ladder still recovers the publisher (never silent) if it ever
does fire.

**How to apply:** if a future validator/redteam pass finds a concrete way to trigger a live mid conflict
inside `subscribeAllAdvertisedRemotes()`, wire in the specialized retry then — don't preemptively add it
for a currently-unreachable case.

## Decision 2 — worked around a pre-existing `e2e/fixtures/auth.ts` bug locally, did not fix it globally

`loginAsJrom()`'s `getByRole('button', { name: 'Sign in' })` has been ambiguous since `1fbc273`
(WK_0623 passwordless-Telegram-login added a second "Sign in with Telegram" button) — it throws a
strict-mode violation, blocking ALL e2e specs that use it, not just this batch's.

**Why:** it's a real, pre-existing, unrelated regression, but fixing shared test infra is outside this
batch's "surgical, no unrelated refactors" mandate and outside R2's requirements. A local
`loginAsJromExact()` helper (scoped to the new spec file only) unblocks THIS batch's screenshot proof
without touching shared fixtures other batches/specs depend on.

**How to apply:** flag to JROM/projcore for a one-line follow-up fix to the shared fixture
(`{ name: 'Sign in', exact: true }`) — every other e2e spec using `loginAsJrom` is currently broken by
this, independent of B2b.

## Decision 3 — ran the new e2e spec against isolated E2E ports, not the default config

The default e2e ports (4720/4711/4710) collided with a live PM2/tsx-watch backend already bound to
`:4720` in this shared environment (pre-existing, not started by this batch). Used
`project_specs.md`'s own documented escape hatch (`E2E_BACKEND_PORT`/`E2E_FRONTEND_PORT`/
`E2E_PROXY_PORT`/`E2E_BASE_URL`/`E2E_WS_ORIGIN` + isolated `MEET_DB_PATH`/`MEET_RECORDINGS_DIR`) rather
than touching the live backend process.

**Why:** avoids any risk of disrupting whatever the live PM2 backend is currently serving (per the
"onmachine collaborator"/"never guess, verify first" caution around processes not started by this
session), while still getting a real rendered-DOM proof.

**How to apply:** future batches needing e2e in this same shared environment should check
`lsof -i :4720` (or equivalent) before assuming the default ports are free, and use the same isolated-port
escape hatch if occupied.
