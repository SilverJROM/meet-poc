Batch-FIX4: International robustness — re-fetch relay on transport recovery + verify high-latency margins

Batch ID: batch-fix4
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (FIX3 @ 716af7e latest). Do NOT commit (3-AGENT: projcore + independent 2nd validator — touches B11 transport recovery + ice-config).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep.
Effort tier: LOW-MEDIUM. Confirm/counter at PROPOSED.

## Context — JROM asked to harden the one internationally-relevant ant + verify latency margins
For PH↔US (high-latency ~150-250ms, flakier links, more likely to need TURN relay). The media path is already global (Cloudflare Realtime SFU + Cloudflare TURN anycast). Two targeted improvements:

## FIX 1 (PRIMARY) — relay re-fetch on transport recovery (close the relay-no-refetch ant)
Today: if a client joins when /api/ice-config relay was momentarily unavailable, it falls back to STUN-only (relayUnavailable signal true). Transport recovery (B11: recoverTransport → doRestartIceRenegotiate / full republish) REUSES the join-time iceServers — so if the link later degrades and now NEEDS TURN relay, it never re-fetches the (now-available) relay config → can't recover on a restrictive/international link.
Fix: in the transport-recovery path (sfu-client.service.ts recoverTransport / before doPublish's ice-config fetch on the republish branch), when recovery runs AND the last resolved iceServers were STUN-only / relayUnavailable was true (or simply: always re-resolve ice-config on a FULL-REPUBLISH recovery), call iceConfigService.forceRefresh() to pick up a now-available relay before rebuilding the PC. Use the freshly-resolved relay-capable iceServers for the recovery PC. If the refetch still yields STUN-only, proceed as today (no hard block). Keep it bounded (don't add a new retry loop — one forceRefresh per recovery attempt, reusing existing cache TTL semantics). Do NOT change the recovery state machine's flags/guards/grace/cap — only the iceServers SOURCE on republish.

## FIX 2 (verify, adjust only if needed) — high-latency margins
Current: SFU_HTTP_TIMEOUT_MS=6000, SFU_TRANSPORT_DISCONNECTED_GRACE_MS=8000, SUBSCRIBE_STUCK_THRESHOLD_MS=10000, retry backoff 250→4000. These are generous and SUIT high latency (favor patience). REVIEW each against a 250ms+ RTT international worst-case:
- Confirm none is so tight it would prematurely fail a slow PH↔US path (the 6s HTTP timeout covers ~1 RTT + CF processing with wide margin — likely fine).
- Only adjust if you find a genuinely tight one; if all are adequate, state so in changes.md and change nothing (do NOT loosen working values gratuitously). If you do bump one, justify the value.

## Required (acceptance)
1. A client that joined STUN-only (relay was down) re-fetches ice-config on transport recovery and uses a now-available relay → can recover audio on a degraded/restrictive international link. If relay still unavailable, behaves as today (STUN, no hard block).
2. Margins confirmed adequate for 250ms+ RTT (or a justified bump); no working value loosened without cause.
3. No regression: B11 transport recovery state machine (flags/grace/cap/guards unchanged), B16 ice-config retry + warn+Retry+JoinAnyway, FIX2/FIX3 subscribe, normal-network calls. The refetch must NOT delay/block the common (relay-was-fine) recovery path noticeably — if the join already had relay, a forceRefresh hits the cache (fast) or you skip it; prefer: only force-refresh when the prior resolution was STUN-only/relayUnavailable.

## Scope guards (MANDATORY)
- FIX4 ONLY. Touch: sfu-client.service.ts (the transport-recovery iceServers source + the refetch call), ice-config.service.ts ONLY if a small accessor is needed (e.g. expose whether the last resolution was relay-capable). Plus tests + a margin note.
- Do NOT change the transport-recovery state machine logic, the subscribe paths (FIX2/FIX3), reconcile, media/recorder/signaling.
- Surgical. Robust assertions — assert the OUTCOME.

## Deterministic proof
- Unit specs (npx tsx, extend sfu-client.spec.ts): transport recovery when prior iceServers were STUN-only → forceRefresh called → recovery PC uses the relay-capable set; when prior had relay → no redundant refetch (or cache hit, no behavior change); refetch-still-STUN → proceeds without hard block.
- Re-run sfu-client + ice-config specs. tsc app/spec 0. ng build green. Deploy DEV (pm2 restart meet-poc-fe).
- BE HONEST: real PH↔US restrictive-link recovery is JROM's seat; unit proves the refetch wiring.

## Plan handshake (MANDATORY)
1. Read brief + recoverTransport/doRestartIceRenegotiate/the republish path + how doPublish gets iceServers + ice-config.service forceRefresh/relayUnavailable + the 4 margin constants.
2. Reply PROPOSED: the refetch trigger condition (only-when-prior-STUN-only vs always-on-republish) + where it's called + the margin verdict (adequate / which to bump + why), test plan, files, risks, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → tsc 0 → specs → build → deploy DEV → STATUS: DONE. Do NOT commit (3-agent).

## Artifacts (under <run-dir>/validation/FIX4/)
scenarios.md, changes.md (Root Cause + refetch design + margin verdict + per-file WHY + no-B11-state-machine-change statement), review.md, test-report.md, independent-validation.md.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-fix4 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
