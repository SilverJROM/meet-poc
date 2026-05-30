# validation/batch-4a-gate — projcore SECURITY gate (R6 reconnect-survival)
**Verdict: PASS** · HEAD c3ad403. R6 COMPLETE (attribution 92d52fc + reconnect-survival c3ad403).

## Security review (this is an access-control predicate — reviewed carefully)
Change: isAdmittedDiagnosticPoster durable branch (path-3) — was gated `!poster.clientId`; now also accepts when `!live.admitted.has(poster.clientId)` (stale clientId not owned by a live peer).
- **Ordering verified**: path-1 (live.admitted loop, peerMatchesDiagnosticPoster — enforces clientKey+participantId+clientId+userEmail) and path-2 (reconnecting) run BEFORE the durable block. Live clientIds are governed solely by path-1.
- **Impersonation provably blocked**: durable branch NEVER returns true while poster.clientId is owned by a live peer (`live.admitted.has` → fall through → false). An authenticated other-user posting a live peer's clientKey+participantId+clientId is rejected by path-1's userEmail check (poster.userEmail is server-derived from the session cookie, not forgeable) and cannot be rescued by path-3.
- **/lead deviation (surfaced for wide view, NS2)**: the literal scope I/JROM worded ("compare colliding liveOwner clientKey/participantId") would have REGRESSED DR-28 (ClientIdentity has no userEmail → clientKey+participantId-only accept overrides path-1). The implemented guard (defer ALL live-owned clientIds to path-1) is STRICTLY SAFER and faithful to "keep the safety check." Within JROM's approved envelope (more conservative, not broader). ACCEPTED.
- Durable accept requires the SECRET clientKey (self-identification) — JROM's premise holds.

## Gate
- Build ✓ backend green (FE unchanged — backend-only diff). Tests ✓ re-ran session-diagnostics 13/13: G-1 stale-clientId→accept, G-2 omitted→accept, G-3 never-admitted→reject, **DR-28 impersonation UNCHANGED + passing**.
- Scope ✓ only the durable block + 3 G-tests changed; peerMatchesDiagnosticPoster + path-1/2 + POST gate ordering untouched.
- R6 → VERIFIED (live cross-reconnect upload = manual; deterministic churn covered by G-1 fake-timer expiry).
