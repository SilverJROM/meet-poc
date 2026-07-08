# Requirements Coverage Matrix

| Req# | Requirement (first 80 chars) | Batch | Evidence | Status |
|------|-------------------------------|-------|----------|--------|
| R1 | "Persistent mic-silence self-heal (not one-shot), 5-10s active / 20-30s idle" | B1 | batch-1/independent-validation.md (PASS, commit d2cbce9) | VERIFIED |
| R2 | "Audio codec/bitrate hardening — Opus floor + RED/FEC" | B2 | — | ASSIGNED |
| R3 | "Reconnect resilience (mobile/cellular) — shorter audio gap on resume" | B3 | — | ASSIGNED |
| R4 | "Host-facing silent/reconnecting participant indicator" | B4 | — | ASSIGNED |
| R5 | "Per-voice volume balancer/normalizer toward ~85-90% of loudest" | B5 | — | ASSIGNED |
| R6 | "Room password + admission policy (per-room setting)" | B6 | — | ASSIGNED |
| R7 | "Fix pre-existing production-build Ionicons dynamic-icon-name error" | B7 | — | ASSIGNED |

Statuses: UNASSIGNED -> ASSIGNED -> IN-PROGRESS -> CLAIMED -> VERIFIED (or FAIL).
No requirement may remain non-VERIFIED at run completion.
