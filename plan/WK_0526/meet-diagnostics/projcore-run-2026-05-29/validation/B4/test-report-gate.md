# B4a-gate Test Report — Diagnostics Admittance Gate Reconnect-Survival Fix

**Date:** 2026-05-30
**Branch:** feat/meet-diagnostics-audio-20260529 @ c3ad403
**Cut-from:** 92d52fc ([batch-4a] per-participant diagnostics attribution)
**QA Mode:** Mode 2 (backend-only, vitest evidence)

---

## Verdict

**STATUS: DONE (PASS — suite green + both builds exit 0 + scope confirmed)**

All 25 tests pass. Backend and frontend builds exit 0. Scope is confirmed to exactly the three expected files.

---

## Vitest Results Summary

| Suite | Tests | Result |
|-------|-------|--------|
| `tests/session-diagnostics.test.ts` | 13 | PASS (13/13) |
| `tests/signaling-reconnect.test.ts` | 12 | PASS (12/12) |
| **Total** | **25** | **PASS (25/25)** |

Duration: 14.02 s

---

## Scenario Coverage Table (G-1..G-7)

| Scenario | Description | Concrete Test / Assertion | Result |
|----------|-------------|--------------------------|--------|
| **G-1** | Reproduce-first: expired guest with stale clientId rejected before fix, accepted after (red→green) | `session-diagnostics.test.ts:498` — "G-1 accepts a durable admitted guest re-posting with a STALE clientId after reconnect grace expiry". Fake-timer grace expiry (`advanceTimersByTimeAsync(120_001)`), POST with `guestAdmitted.clientId` → `.expect(200)` + `body.entry` non-null; GET → `entries[0].payload.clientName === 'Guest'` | PASS |
| **G-2** | No regression: absent clientId still returns 200 on expired peer | `session-diagnostics.test.ts:550` — "G-2 still accepts a durable admitted guest re-posting with clientId OMITTED after grace expiry". Same expired state, POST with `clientId: undefined` → `.expect(200)` | PASS |
| **G-3** | Security: never-admitted clientKey rejected even with plausible clientId | `session-diagnostics.test.ts:592` — "G-3 rejects a never-admitted clientKey even with a plausible clientId (security preserved)". POST with `clientKey: 'never-admitted-key-g3'` + real admitted guest's `clientId` → `.expect(403)` | PASS |
| **G-4** | Security: revoked identity (explicit leave) is rejected | Covered by existing `signaling-reconnect.test.ts` — "requires re-admit after an explicit leave message, then clears the revoke on owner admit" (PASS). The revoke path (`revokeClientIdentity`, which sets `revoked: true`) is untouched; diagnostics consequence follows directly. A dedicated G-4 black-box diagnostics test was not added (the revoke behavior test in signaling-reconnect.test.ts constitutes the mechanism proof; the `identity.revoked !== true` guard at `signaling/index.ts:514` is structurally unchanged per the diff). | PASS (mechanism proof via existing test + code inspection) |
| **G-5** | No regression: live admitted in-call path unaffected | Covered by existing `DR-41` — "DR-41 accepts diagnostics from admitted guests and rejects never-admitted clients" (`session-diagnostics.test.ts:~188-191`, PASS). Dev notes this explicitly in changes-gate.md ("G-5 coverage relied on existing DR-41"). | PASS (DR-41 reference) |
| **G-6** | Collision safety: stale clientId owned by different live peer rejected | **Reviewer-reasoning only per scenarios-gate.md** — not a black-box test (server-assigned UUIDs never naturally collide; no test hook for forced collision). Reviewer-verifiable by inspection: `signaling/index.ts:527` — `if (!live.admitted.has(poster.clientId)) return true;` — a stale clientId owned by ANY live admitted peer causes this guard to NOT return true, deferring entirely to path-1 (which enforces `userEmail`). Changes-gate.md confirms the reasoning and notes the stronger guard vs. the original brief's literal replacement (which regressed DR-28; see deviation note). | PASS (code-reasoning; reviewer-verified by inspection) |
| **G-7** | Build/regression: tsc + full existing suites green | Backend `npm run build` (tsc -p tsconfig.json) → exit 0. Frontend `npm run build` → exit 0 (pre-existing `@mediapipe/selfie_segmentation` not-ESM warning, unrelated). Full vitest suites — 25/25 PASS (no regression in DR-28, DR-41, P-1..P-8, signaling-reconnect x12). | PASS |

---

## G-1 Reconnect-Survival Test: Confirmed Present + Passing

Test name appearing in vitest output:
```
✓ tests/session-diagnostics.test.ts (13 tests) 10139ms
  [stdout] G-1 accepts a durable admitted guest re-posting with a STALE clientId after reconnect grace expiry
```
Full test at `backend/tests/session-diagnostics.test.ts:498`.

---

## Build Results

| Build | Command | Exit Code |
|-------|---------|-----------|
| Backend | `cd backend && npm run build` (tsc -p tsconfig.json) | **0** |
| Frontend | `cd frontend && npm run build` (ng build) | **0** (3 pre-existing warnings, no new errors) |

---

## Scope Confirmation (git diff 92d52fc..c3ad403 --stat)

Files touched — exactly 3, all expected:
```
backend/src/modules/signaling/index.ts              |  15 ++-
backend/tests/session-diagnostics.test.ts           | 136 ++++++++++++++++++++-
plan/.../validation/B4/changes-gate.md              | 128 +++++++++++++++++++
3 files changed, 275 insertions(+), 4 deletions(-)
```

No frontend files, no migration files, no other backend files.

---

## Structural Confirmation: signaling/index.ts Diff

The diff is **confined to the durable-identity block of `isAdmittedDiagnosticPoster`** (lines 512-528 in the final file). Specifically:

**Removed:**
```ts
identity.participantId === poster.participantId &&
!poster.clientId
) {
  return true;
```

**Added:**
```ts
identity.participantId === poster.participantId
) {
  if (!poster.clientId) return true;
  if (!live.admitted.has(poster.clientId)) return true;
```

`peerMatchesDiagnosticPoster` (lines 489-499) — **untouched**.
POST gate ordering — **untouched** (paths 1, 2, 3 in original order preserved).

---

## Durable Pre-condition Verification

The durable identity acceptance still requires ALL of:
1. `identity?.wasAdmitted === true` — written only by `rememberClientIdentity` at the moment of owner admit
2. `identity.revoked !== true` — set to `true` by `revokeClientIdentity` on explicit leave
3. `identity.participantId === poster.participantId` — participantId cross-check

Plus the new guard:
4. Either `!poster.clientId` (pre-existing no-clientId case) OR `!live.admitted.has(poster.clientId)` (stale / expired clientId not owned by any live peer)

---

## G-6 Collision Safety: Code Inspection

`signaling/index.ts:526-527`:
```ts
if (!poster.clientId) return true;
if (!live.admitted.has(poster.clientId)) return true;
```

If `poster.clientId` is present AND a live admitted peer holds that exact clientId → neither guard fires → the function falls through to `return false`. The live-admitted loop (path-1, via `peerMatchesDiagnosticPoster` which also enforces `userEmail`) is the sole authority for live clientIds. Owner impersonation hole closed.

Note from changes-gate.md: the brief's alternative predicate (`ownedByDifferentPeer` that still accepted when the live owner matched on clientKey+participantId) regressed DR-28 — the corrected `!live.admitted.has(poster.clientId)` guard is strictly stronger/safer and satisfies both G-6 and G-7.

---

## Evidence Files

| File | Purpose |
|------|---------|
| `screenshots/vitest-gate-b4a.txt` | Full vitest output — 25/25 PASS |
| `screenshots/build-backend-gate-b4a.txt` | Backend tsc build — exit 0 |
| `screenshots/build-frontend-gate-b4a.txt` | Frontend ng build — exit 0 |
| `screenshots/structural-gate-b4a.txt` | git diff --stat + signaling/index.ts diff + grep confirmation |
