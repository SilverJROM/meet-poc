# Conn-Reliability Run — Progress

## 2026-05-20 — Run started (post Run-C real-device testing)

- Trigger: JROM real-desktop test (Chrome/macOS) — remote peers "failed/frozen" on same WiFi; macOS screen-share permission confusion.
- Root cause: full-mesh P2P + STUN-only (no TURN) → WiFi client-isolation breaks P2P.
- JROM directive: apply the 80/20 fix — TURN relay (#1) + ICE-restart (#2).
- Codex session: `lkcdx-meet-v5` (v2.0 bypass mode).
- 2-batch split (codex-proposed, projcore-approved): Batch A = reliability core (DR-4+DR-5); Batch B = UX/observability (DR-1/2/3).

## Batch log

diag1 dispatched_at: 2026-05-20T04:30:00Z estimate_min: 75 bucket: LONG

### Batch A (diag1) — DR-4 ICE-restart + DR-5 TURN plumbing — IN_PROGRESS

- v2.0 handshake: PROPOSED (2m14s, sharp — caught new-clientId-on-reconnect + glare) → APPROVED-PLAN with 2 amendments.
- Awaiting STATUS: DONE callback.

## ⛔ DEPLOY FREEZE — 2026-05-20 19:55 MNL (11:55 UTC) until JROM lifts
- Reason: JROM live test call at 8pm MNL.
- Live app frozen on the DIAGH-deployed build (DR-1..DR-23 + env-leak fix) — verified, clean.
- During freeze: NO pm2 restart/delete/migrations on live; NO e2e against live services (creates rooms + load). Codex commits code + backend unit tests + builds only; live deploy DEFERRED.
- DIAGI (DR-25) building: code+commit+backend-tests only; live e2e + deploy deferred to post-freeze.
- Z (DR-24 audit) analysis can proceed (read-only); any refactors + deploy deferred.
- Projcore validates batches via backend tests + code review during freeze; live e2e + deploy after JROM lifts.
