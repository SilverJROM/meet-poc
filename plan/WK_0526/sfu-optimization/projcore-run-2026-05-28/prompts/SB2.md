Batch SB2 — Connection-route detector + relay/degraded alert (SR3)

You are the IMPLEMENTER (codex gpt-5.5). Claude /projcore supervises from session `lkvc`. Context was /clear'd — start fresh from this brief + the files.

Context (from SB1, accepted): SB1 fixed backend ICE so the TLS/TCP TURN relay path is preserved. SB2 builds the observability layer.

Requirement (verbatim):
- SR3: a per-participant connection-route detector — from `getStats()` classify each user's path as **direct (host/srflx)** vs **relay (TURN)** plus RTT/loss/jitter; surface a connection-quality indicator in-call; and **log/alert when a user is stuck on relay or sustained-degraded** so reliability/lag issues are visible, not silent.

What already exists (reuse, don't duplicate):
- `frontend/src/app/services/sfu-client.service.ts` already has a getStats path (~lines 165-230) that reads the active candidate-pair: local/remote candidate type (host/srflx/relay), protocol, RTT, and a relayUsed flag.
- The diagnostics pipeline already writes `relay_used` / `candidate_types` / `peer_count` to `meeting_session_diagnostics` (backend) from periodic samples.

Scope (atomic, surgical):
1. Add a small **connection-quality signal** for the LOCAL user, computed on a timer (e.g. every 3-5s) from getStats: classify `direct | relayed` (candidate-pair relay?) and a quality band `good | fair | poor` from RTT + packet loss + jitter (pick sensible thresholds; document them).
2. Surface a compact **in-call indicator** (a small chip/badge near the existing call controls or self-tile) showing e.g. "Good" / "Relayed" / "Poor connection" with a tooltip (RTT/ms, relay yes/no). Keep it density-light (JROM style: functional first).
3. **Alert/log when stuck on relay OR sustained-degraded** (e.g. relayed for >N samples, or poor band sustained): emit a one-time console.warn + a non-intrusive in-call notice (reuse the existing actionNotice/toast mechanism in room.page if present), and ensure the diagnostics sample already captures it (extend only if missing).
   Do NOT spam: throttle the notice (once per sustained episode, not per sample).

Hard guards:
- Surgical. Do NOT change publish/subscribe negotiation, screen-share, recording, or reconnect logic. READ stats only.
- No new heavy deps. No forced relay. Reuse existing getStats + diagnostics plumbing.
- Density-light UI; do not clutter the call.

Plan handshake (MANDATORY before code):
1. Read this brief + sfu-client.service.ts (getStats area) + room.page.ts (controls/notice signals) + how diagnostics samples are emitted.
2. Reply PROPOSED: exact mechanism (where the timer lives, what stats fields, thresholds), files to change, where the indicator renders, how the alert throttles, and how SR3 is observable (e.g. force relay via the diagnostic toggle or a TURN-only network → chip shows "Relayed" + a single warn).
3. End: `STATUS: PROPOSED — <one-line>`. Wait for APPROVED-PLAN.

After APPROVED-PLAN: implement, build frontend (`cd frontend && npm run build`), write SB2-changes.md + callback FIRST to callbacks.md, then `STATUS: DONE — <one-line>`.
