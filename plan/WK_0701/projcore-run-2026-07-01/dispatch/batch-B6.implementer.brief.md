<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B6: Local multi-participant capstone — 2-person + 5-person recovery (R6, local part)

Batch ID: batch-B6
Plan: plan/WK_0701/projcore-run-2026-07-01/implementation-plan.md
Branch: fix/sfu-selfheal-20260701 (commit on this branch)
Requirements assigned: R6 (local capstone part; B7/B8/B9 are the remote + human-audible parts)
North-star anchors: #1 (never connected-but-cannot-hear)
Lifecycle: pre-live — Deferral OFF. No TODO/dead-code/shims. Uncertainty = STATUS: NEEDS-INFO.

Estimated duration: TEST-HEAVY — multi-participant Playwright e2e. Target the two scenarios; do not run the full suite.

Effort tier (PROJCORE-PROPOSED): high
  Mode chord: /fast OFF · Claude marker "think hard"
  Validator topology: 3-agent (validator=codex55) + [REDTEAM:standard] back-gate
  Why: multi-context WebRTC e2e orchestration + fault injection; must prove real recovery, not a green shell.

Context (R1-R5 shipped + validated: 6643a02 e33a98d 5f4a6bf fc05c58 8b6825d f59a38f):
The full self-heal ladder is in and unit/service-validated. B6 proves it holds END-TO-END for multi-party calls
under fault injection — the LOCAL capstone before Peer2 (B7) and the human-audible test (B9).

Requirements section (verbatim, R6 local part):
"Local tests cover 2-person AND 5-person subscription graphs." + north-star: the app must not leave users
"connected but cannot hear each other."

Infra to USE:
- Fault injection (B1): `SFU_FAULT_INJECT=1` env + rules to force `/api/sfu/tracks` 406 for a selected
  participant, without live Cloudflare. (backend/src/modules/realtime-sfu/sfu-fault-inject.ts.)
- Chromium fake-media flags (project_specs §7/§14) for headless WebRTC.
- Diagnostics (B5): layerDiagnostics + advertised-not-subscribed + lastRecoveryEvent + window.__meetDebug —
  use these to ASSERT recovery (subscribed + healthy inbound), not just "page loaded".
- Isolated e2e ports (§14): MEET_DB_PATH, MEET_RECORDINGS_DIR, E2E_BACKEND_PORT, E2E_FRONTEND_PORT,
  E2E_PROXY_PORT, E2E_BASE_URL, E2E_WS_ORIGIN — set together to avoid clobbering live PM2 state.
- Existing e2e patterns: e2e/tests/sfu-b7-reconnect/, sfu-b2b-rejoin-ui/, e2e/fixtures/ (auth, rooms).

Expected (acceptance criteria — assertable, REAL recovery not green shell):
1. **R6a — 2-person recovery:** 2 browser contexts join one room + both publish audio. Inject a 406 (or
   stall) on one direction. ASSERT via diagnostics that the affected side RECOVERS to subscribed + healthy
   inbound (advertised-not-subscribed clears; inbound RTP bytes/energy advance) within a bounded time — i.e.
   they can hear each other again after the injected failure. Poll the real diagnostics, not a static check.
2. **R6b — 5-person recovery + coalescing:** 5 contexts join. Inject failures across several publishers.
   ASSERT recovery for the affected subscriptions AND that N simultaneous advertised-not-subscribed publishers
   cause ONE coalesced full rejoin, not N (assert via lastRecoveryEvent 'sfu-rejoin' count / no rejoin storm).
3. **R6c — evidence:** the test captures diagnostics rows/artifacts proving remote-audio subscriptions +
   recovery (screenshots or dumped __meetDebug/layerDiagnostics), not just a PASS string.

Scope:
- Implement the 2 multi-participant e2e scenarios + any small test-harness helpers needed. Do NOT change
  recovery/diagnostics production logic (R2-R5 are validated) — if a scenario reveals a real product bug,
  STATUS: NEEDS-INFO with the evidence (do not silently patch).
- Real-timer Playwright waits are fine here (e2e). Use expect.poll/waitFor with sane timeouts; make tests
  deterministic + terminating (no infinite hangs). Run with --workers=1 on isolated ports.
- No page.setContent static-HTML smell (§2.10). Assert OUTCOMES (recovered audio), never attempt-only.

Plan handshake protocol (MANDATORY):
1. Read this brief + project_specs §7/§14 + the existing e2e tests + the fault-injection + diagnostics infra.
2. Reply PROPOSED: how you spin N contexts, inject faults, and ASSERT recovery via diagnostics + files + risks + estimate. Confirm/counter tier.
3. End: STATUS: PROPOSED — <approach> · complexity: <x> · why: <one line>.
4. Wait for APPROVED-PLAN. If REVISE-PLAN, address + re-emit.

After APPROVED-PLAN:
5. Implement at high effort. STATUS: DONE when the 2 scenarios pass deterministically (report exact commands + timings).

Required artifacts: batch-B6/{scenarios,changes,review,test-report,independent-validation}.md + screenshots/ (diagnostics proof); decisions/<date>-<slug>.md (or "none").

---

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B6 <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Use WORKING only for non-terminal progress. Emit terminal/handshake state directly when you have it.

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B6[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: PROPOSED
