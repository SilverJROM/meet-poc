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
