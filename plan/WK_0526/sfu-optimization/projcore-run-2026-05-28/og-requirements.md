# og-requirements — SFU speed + reliability (faster, fewer disconnects/lag)

Source: JROM 2026-05-28 — "make our app faster and reliable (no disconnects, lag, etc)". Plan in `plan/WK_0526/list/2026-05-28-sfu-routing-optimization-plan.md` (+ codex findings). SFU = Cloudflare Calls (anycast). No mesh/P2P bypass (infeasible on Cloudflare Calls) — optimize within the SFU.

Contract. Acceptance = observable in the running app on voice.silverjrom.app.

| Req# | Requirement |
|------|-------------|
| SR1 | The ICE config exposes a **TURN over TLS/TCP on 443** relay path (`turns:…:443?transport=tcp`), so users behind restrictive/corporate/mobile firewalls always have a working media path to the SFU. `/api/ice-config` returns such an entry; relay remains a fallback, not forced. |
| SR2 | The client **never forces TURN relay** — `iceTransportPolicy` is `'all'` (host→srflx→relay preference), so the direct edge path is used when available and relay is only a fallback. |
| SR3 | A **per-participant connection-route detector**: from `getStats()` classify each user's path as **direct (host/srflx)** vs **relay (TURN)** plus RTT/loss/jitter; surface a connection-quality indicator in-call, and **log/alert when a user is stuck on relay or sustained-degraded** (so reliability/lag issues are visible, not silent). |
| SR4 | **Adaptive simulcast**: subscriber video layer selection (we already publish h/m/l) responds to the SR3 quality signal — a subscriber on a poor/degraded link is dropped to a lower layer (m/l) to reduce lag; recovers when the link improves. |

## Out of scope
- Hybrid mesh / same-LAN P2P bypass (not feasible on Cloudflare Calls; per plan).
- Manual edge/region selection (Cloudflare anycast handles it).
- True 1:1 P2P fast-path (deferred unless 1:1 latency becomes a goal).
