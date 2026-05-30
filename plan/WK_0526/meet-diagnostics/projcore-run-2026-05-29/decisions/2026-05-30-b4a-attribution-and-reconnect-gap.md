# B4a — attribution design + reconnect-drop gap (pending JROM security decision)

date: 2026-05-30
batch: B4a (R6, attribution + queryability half)
commit: 92d52fc (on feat/meet-diagnostics-audio-20260529, atop 2c36c86)
source: lead (projcore-supervised run)

## Decision 1 — attribution columns (JROM-approved at APPROVED-PLAN)
Added three nullable TEXT columns to `meeting_session_diagnostics` (migration `0013_diagnostics_participant_attribution.sql`):
- `participant_id`   ← payload.participantId  (the stable per-participant grouping key)
- `participant_name` ← payload.clientName     (human-readable display label)
- `participant_client_key` ← payload.clientKey (durable per-browser anchor; STORED, not exposed via API)
+ index `idx_meeting_session_diagnostics_session_participant (session_id, participant_id)`.

Rationale: rows are stored `owner_email = host_email` ALWAYS (store.ts:259) — every participant's samples were already retrievable per session but only by digging `payload_json`. Promoting the 3 identity fields to indexed columns makes "review every side of a call, grouped/filtered by participant" a first-class query. Populate on insert via null-safe `coerceIdentity()` (missing/non-string/empty → NULL, never throws — "missing data is a state, not an error"). Query surface: `getDiagnosticsForSession(..., participantId?)` optional filter + new `getSessionParticipants(ownerEmail, sessionId)` (DISTINCT participant_id/name + sampleCount, owner-gated, NULL rows excluded) + GET endpoint additive `participants[]` and `?participantId`. Existing rows stay NULL (noted).

Plain `ALTER ADD COLUMN` per the 0010 precedent; the migration runner's `_migrations` once-only tracking (db.ts:50) is the idempotency guard.

## Decision 2 — reconnect-drop gap: FOUND, left UNCHANGED pending JROM (carve-out)
**Mechanism (file:line):** `isAdmittedDiagnosticPoster` (backend/src/modules/signaling/index.ts:501-522) has a durable across-reconnect survivor path (signaling/index.ts:511-519): an identity remembered by `clientKey` with `wasAdmitted===true && !revoked` is accepted — BUT only when **`!poster.clientId`** (the guard at :516). The live client ALWAYS sends `clientId` (frontend room.page.ts:2780 = `this.myId()`). So once a peer expires from BOTH `live.admitted` AND `live.reconnecting` (a longer socket churn) and re-posts a sample / `call-end` beacon before being re-admitted (no fresh welcome yet → stale clientId), the durable path is bypassed and path-1/path-2 don't match the stale clientId ⇒ **403 ⇒ diagnostics dropped across longer reconnects.**

**Why the guard is security-neutral:** `clientKey` is the unforgeable 128-char persisted anchor remembered server-side only after admission (sanitizeClientKey :400-405, rememberClientIdentity :407-416). An attacker who wanted to abuse path-3 would simply OMIT `clientId` to satisfy `!poster.clientId` today — so the guard adds **zero** protection while costing real reliability.

**Proposed fix (deferred — implement only after JROM signs off):** accept the durable identity when `clientKey + participantId + wasAdmitted && !revoked` match, even if a (stale) `clientId` is present, UNLESS a *different live admitted peer* currently owns that exact clientId. Prove with a backend vitest reproducing the churn (admitted→expired-from-both-maps, durable identity present, poster carries stale clientId): asserts **403 today → 200 after fix**.

**Status (B4a):** isAdmittedDiagnosticPoster left UNCHANGED in B4a (verified: `git diff 2c36c86..92d52fc -- backend/src/modules/signaling/index.ts` is empty). This is an admittance/security boundary → trust-defaults requires JROM sign-off. projcore escalated to JROM. The repro test + the one-line guard relaxation ship TOGETHER once JROM rules. Documented in B4a changes.md Caveats as a PRE-EXISTING, JROM-flagged deferral (legal post-live conditional deferral, not a silent punt).

## Decision 2 — UPDATE 2026-05-30: JROM APPROVED the relaxation; landed @ c3ad403 (B4a-gate) — with a security-improving deviation
JROM ruled: approve relaxing the gate. Implemented as the B4a-gate slice (commit c3ad403, atop 92d52fc, full lead pipeline incl. fresh adversarial independent validation).

**Security-improving deviation from the literal proposal (lead-accepted, dev-caught):** my proposed predicate compared the colliding `liveOwner.clientKey/participantId` to the poster (`ownedByDifferentPeer`). That would have REGRESSED the existing DR-28 owner-impersonation guard into a hole — because `ClientIdentity` (signaling/index.ts:61-66) carries **no userEmail**, so a durable-path accept based on clientKey+participantId only would override path-1's `userEmail` rejection. An authenticated different user supplying a live peer's clientId+participantId+clientKey would have gotten 200.

**Final guard (strictly safer, faithful to JROM's "keep the safety check" intent):** inside the unchanged identity-validity predicate (`wasAdmitted===true && !revoked && participantId match`):
```
if (!poster.clientId) return true;                       // absent clientId — pre-existing behavior
if (!live.admitted.has(poster.clientId)) return true;    // genuinely-expired peer — the reconnect fix
// else: a LIVE peer owns this clientId → fall through to path-1 (which enforces userEmail). No durable short-circuit.
```
Why faithful + safe: path-1 (peerMatchesDiagnosticPoster) runs BEFORE the durable block and already accepts a legitimately-rejoined live poster, so deferring to it for ANY live-owned clientId never harms a legit poster — it only removes a spoofable durable-accept. `poster.userEmail` is server-derived from the session cookie (optionalUserEmail), not forgeable. The durable branch provably can NEVER return true while a live peer owns poster.clientId.

**Proven:** G-1 reproduce-first RED (403 on unfixed) → GREEN (200 after); DR-28 impersonation still 403 (unchanged); never-admitted/revoked/unknown-clientKey still 403; full suite 25/25; BE+FE builds exit 0. Independent fresh-Opus validator ran all four adversarial probes (never-admitted / revoked / impersonation / genuine-reconnect) → no 200 path for any wrong poster. R6 reliability-across-reconnect half is now CLOSED. R6 COMPLETE (attribution @ 92d52fc + reconnect-survival @ c3ad403).
