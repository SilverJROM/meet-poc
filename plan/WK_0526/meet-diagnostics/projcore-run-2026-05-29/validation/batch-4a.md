# validation/batch-4a — projcore gate (R6 attribution half)
**Verdict: PASS** · HEAD 92d52fc.
- Migration 0013: 3 nullable cols (participant_id/name/client_key) + index(session_id,participant_id); idempotent via runner once-only guard. ✓
- appendDiagnosticsEntry populates via null-safe coerceIdentity; getDiagnosticsForSession optional participantId filter (existing caller unaffected); getSessionParticipants DISTINCT owner-gated excludes NULL; GET additive participants[] + ?participantId; non-owner 404 + POST gate ordering preserved.
- **Carve-out honored**: git diff signaling/index.ts = 0 lines (gate UNTOUCHED). Reconnect gap documented pending JROM. ✓
- Build ✓ BE+FE green. Tests ✓ re-ran vitest session-diagnostics 10/10 (P-1..P-8 + pre-existing DR-28/DR-41).
- R6 attribution/queryability = VERIFIED. R6 reconnect-reliability = PENDING the JROM-approved gate fix (next).
