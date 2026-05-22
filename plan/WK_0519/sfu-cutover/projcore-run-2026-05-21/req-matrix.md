# Requirements coverage — SFU cutover

| Req# | Requirement (first 80 chars) | Batch | Evidence | Status |
|------|------------------------------|-------|----------|--------|
| SR-0 | Raise/remove participant cap (early, behind feature branch) | B0 | validation/B0-projcore.md (0dacde5) | VERIFIED |
| SR-1 | Backend Cloudflare Realtime proxy module (App Secret server-side, /api/sfu/*, tracks/update, ownership authz) | B1 | validation/B1-projcore.md (59c0122) | VERIFIED |
| SR-2 | Publish local media (single PC, pre-negotiated video) + operation queue | B2 | validation/B2-projcore.md (97900bd) | VERIFIED |
| SR-3 | Signaling presence: CF sessionId + trackNames + roster revision | B3 | validation/B3-projcore.md (66ab520) | VERIFIED |
| SR-4 | Subscribe to remote tracks + render tiles (CF renegotiation) | B4a, B4b | B4a a9ab284 + B4b afb0441 (validation/B4b-projcore.md) | VERIFIED |
| SR-5 | Media toggles (B5a) + screenshare as separate track (B5b) | B5a, B5b | B5a 884755c + B5b b61db11 (validation/B5b-projcore.md) | VERIFIED |
| SR-6 | Simulcast publisher (B6a) + subscriber layer pref via tracks/update (B6b) | B6a, B6b | B6a 5524097 + B6b 40b1782 (validation/B6b-projcore.md) | VERIFIED |
| SR-7 | Reconnect / leave / teardown over the SFU (mid-close, 30s GC, no ghost) | B7 | validation/B7-projcore.md (aabe71c) | VERIFIED |
| SR-8 | Retire mesh path; KEEP/ADAPT DR-40 single-PC recovery + op queue + identity dedup | B8 | — | UNASSIGNED |
| SR-9 | Diagnostics for the SFU topology (BEFORE teardown) | B9 | validation/B9-projcore.md (920ce49) | VERIFIED |
| SR-10 | Full cutover validation (e2e + field + cost note) | B10 | — | UNASSIGNED |

Statuses: UNASSIGNED → ASSIGNED → IN-PROGRESS → CLAIMED → VERIFIED (or FAIL). No final acceptance until all VERIFIED.
Build order: B0 → B1 → B2 → B3 → B4a → B4b → B5a → B5b → B6a → B6b → B7 → B9 → B8 → B10.
Build gated on JROM field-test of F1/F2/F3 + go. Plan REVISED per codex review (plan-review-codex.md) 2026-05-21.
