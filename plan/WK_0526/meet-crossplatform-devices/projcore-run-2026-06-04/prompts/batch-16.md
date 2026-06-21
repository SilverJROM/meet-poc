Batch-16: Work on restrictive/corporate networks — relay/ICE robustness (B1/N2/B7/B6)

Batch ID: batch-16
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (B15 committed @ b38d2b3). Commit B16 on top.
Read FIRST: north-star.md (universal goal + gates), findings.md (B1 line 66 + refinement line 81, N2 line 223, B7 line 73, B6 line 72 + R2.5 line 78-80).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): MEDIUM. Confirm/counter at PROPOSED.

## North-star tie-in
Universal app = works on ANY device AND ANY network (home, cellular, corporate/restrictive). TURN relay IS live in prod (verified: /api/ice-config returns Cloudflare turn/turns:443). The gaps are robustness: if the relay config FETCH fails, or a hardcoded STUN-only list is used, a restrictive-network user (UDP-blocked / symmetric NAT / corporate firewall) silently gets ZERO media and never connects. This batch makes relay acquisition robust + honest.

## THE FINDINGS (confirmed by 6-model fan-out; confirm, don't re-derive)
- **B1 (HIGH, primary)** — `frontend/src/app/services/ice-config.service.ts:~123`: a failed `/api/ice-config` fetch silently degrades to a STUN-only fallback. On a restrictive network STUN-only = no candidates = never connects, with NO signal to the user. TURN works in prod, but a transient fetch failure/timeout strands the user. Fix: bounded retry of the fetch (small backoff) before falling back; if it still can't be obtained, do NOT silently proceed STUN-only — surface a clear "relay unavailable — you may not connect on restrictive networks" state and allow a retry. Keep the retry/fallback DECISION in a pure, unit-testable function.
- **N2 (MED)** — `frontend/src/app/services/sfu-client.service.ts:~945` (doPublish): the publish RTCPeerConnection is built with a HARDCODED `stun:stun.cloudflare.com:3478` list, OUTSIDE the ice-config fallback. On UDP-blocked + TURN-fetch-fail this PC has zero relay candidates even when the main PC has TURN. Fix: build doPublish's PC with the SAME iceServers resolved from ice-config (which include `turns:443?transport=tcp`), not a hardcoded STUN-only list. If ice-config isn't available, at minimum include a turns:443?transport=tcp entry. The publish PC and the subscribe/main PC must use a consistent relay-capable iceServers set.
- **B7 (LOW)** — `frontend/src/app/pages/room/room.page.ts:~3031`: diagnostics hardcode `forceRelay:false` with no way to force relay. Add a force-relay (iceTransportPolicy:'relay') diagnostic mode to validate relay actually works end-to-end, and record the ACTUAL ice transport policy / selected-candidate-pair type in the diagnostics output. Diagnostics-only, must not change normal-call behavior.
- **B6 (LOW, backend robustness)** — `backend/src/modules/ice-config/index.ts:~58`: reads `TURN_API_Key` only (works in prod — verified). Also accept the conventional `TURN_API_KEY` (either spelling), and report TURN presence (configured: true/false) in the health/admin response so a missing TURN is observable instead of silently STUN-only. Do NOT remove the working `TURN_API_Key` read.

## Required fix (acceptance)
1. B1: ice-config fetch is retried (bounded, justified attempts/backoff constants); on total failure the app surfaces a relay-unavailable signal + retry, never silently STUN-only. Pure decision fn unit-tested.
2. N2: doPublish PC uses the resolved relay-capable iceServers (consistent with the main PC); no hardcoded STUN-only path remains for publish.
3. B7: diagnostics gain a force-relay mode + record actual policy/candidate-pair type. Normal call path unchanged.
4. B6: backend accepts either env spelling + reports TURN configured state in health. No behavior change when TURN_API_Key is set (prod).
5. No regression: normal-network join/publish/subscribe, the main-PC iceServers path, B2/B11 transport recovery (it must keep using relay-capable servers), reconnect republish, diagnostics snapshot schema consumers.

## Scope guards (MANDATORY — bypass mode)
- B16 ONLY (B1/N2/B7/B6). Touch: ice-config.service.ts (retry + fail-loud decision), sfu-client.service.ts (doPublish iceServers — REUSE the resolved ice-config servers; do NOT touch subscribe/transport-recovery state machine logic beyond the iceServers source), room.page.ts (diagnostics force-relay + relay-unavailable surfacing wire-up), backend/src/modules/ice-config/index.ts (env spelling + health). Plus tests + a small UI string for relay-unavailable if needed.
- Do NOT touch: B06 register flow, B08 subscribe-retry, B11 transport-recovery STATE MACHINE (only the iceServers it consumes), B15 signaling, media acquisition (B01-B04), recorder.
- Prefer PURE testable fns: e.g. `decideIceConfigOutcome({fetchOk, attempts, maxAttempts}) -> 'use'|'retry'|'relay-unavailable'` and a helper that maps an ice-config payload → the iceServers array used by BOTH PCs.
- Robust polled assertions — assert the OUTCOME.

## Deterministic proof
- Unit spec (npx tsx) over: (a) the ice-config retry/fail-loud decision (success / transient-then-success / exhausted→relay-unavailable); (b) the payload→iceServers mapper returns the SAME relay-capable set for main + publish PCs and always includes a turns:443?transport=tcp entry when TURN present. Backend: a small test that either env spelling yields TURN servers + health reports configured:true/false.
- Re-run existing specs (sfu-roster-utils, remote-audio-*, media-acquisition, transport-recovery if present). `npx ng build` green; backend `npx vitest run` green for touched modules. Deploy DEV (`pm2 restart meet-poc-fe meet-poc-be`).
- BE HONEST: real restrictive-network (corporate firewall / UDP-blocked cellular) connect is JROM's seat — fake-media + open-network e2e cannot reproduce a UDP-blocked NAT. State this in changes.md; do NOT claim restrictive-network proven by e2e. The force-relay diagnostic mode (B7) is the closest in-app proof and should be exercised.

## Plan handshake (MANDATORY)
1. Read brief + findings + ice-config.service.ts + sfu-client.service.ts doPublish (iceServers construction) + how the main PC gets its iceServers + room.page diagnostics (~3031) + backend ice-config/index.ts.
2. Reply PROPOSED: the retry/fail-loud design + constants, the shared payload→iceServers mapper + how doPublish reuses it, the diagnostics force-relay + policy recording, the backend env+health change, test plan, files, risks, estimate, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green → tests → deploy DEV → STATUS: DONE.

## Artifacts (under <run-dir>/validation/B16/)
scenarios.md, changes.md (Root Cause per finding + per-file WHY + the HONEST real-restrictive-network=JROM-seat note), review.md, test-report.md, independent-validation.md. decisions/ entry for the retry constants + the shared-iceServers strategy.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-16 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
