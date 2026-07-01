<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B1: Local reproduction harness for SFU non-healing (fault injection)

Batch ID: batch-B1
Plan: plan/WK_0701/projcore-run-2026-07-01/implementation-plan.md
Branch: fix/sfu-selfheal-20260701 (work directly on this branch; commit per convention)
Requirements assigned: R1
North-star anchors: #1 (escalate, never silent give-up), reproduce-first (§1.4h)
Lifecycle: pre-live — Deferral policy: OFF. Read ~/.claude/JROM/style/deferral-policy.md. Under OFF: no TODO/FIXME, no "follow-up PR," no dead-code shims, no @deprecated markers without a queue.md row in THIS run. Uncertainty = STATUS: NEEDS-INFO, not a defer.

Estimated duration: SHORT (atomic) — target <30min per sub-slice; the harness may be 2 slices (fault-injection hook + failing tests). If it sprawls, propose a split.

Effort tier (PROJCORE-PROPOSED — confirm or counter-propose at PROPOSED): high
  Mode chord: /fast OFF · grok reasoning-effort high · (Claude marker n/a)
  Validator topology: 3-agent (validator=codex55)
  Why: real-time/WebRTC + heisenbug-shaped reproduction (effort-tiering "high" trigger: concurrency/real-time + ambiguous observability).

Context (from B0 consensus):
The self-heal ladder ALREADY exists but GIVES UP: sfu-client.service.ts ~line 258 permanently stops
subscribe retry ("guard stays set until cfSessionId changes"); the stalled-audio watchdog caps into
`mark-stalled`. Two real calls failed "connected but can't hear each other" with /api/sfu/tracks 406.
The agreed fix (B2) is a 4-rung escalation ladder (retry→renegotiate→fresh-cfSessionId rejoin→visible
UI) — but FIRST (this batch) we must REPRODUCE the current give-up deterministically.

Requirements section (verbatim from og-requirements.md R1):
"A local/dev test path can reproduce SFU subscription failure without waiting for Cloudflare to fail
live. Acceptance: (a) a test can force /api/sfu/tracks to return 406 for a selected participant/request;
(b) a test can simulate a remote track advertised-but-never-subscribed; (c) a test can simulate a
subscribed inbound audio track with no usable audio progress; (d) the current non-healing / give-up
behavior is reproduced (fails) BEFORE any fix lands."

Observed (current state):
- backend/src/modules/realtime-sfu/index.ts — /sfu/tracks is a thin CF passthrough (~line 134 passes
  CF status straight through); no test hook to force a 406 without hitting real Cloudflare.
- frontend/src/app/services/sfu-client.service.ts — planSubscribeRetry cap → permanent stop (~258).
- frontend/src/app/services/remote-audio.service.ts — VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW, stall decision.
- frontend/src/app/pages/room/room-decisions.ts — decideRemoteVoiceWatchdogAction (caps → mark-stalled).
- Existing tests: frontend sfu-client.spec.ts; e2e under e2e/tests/ (Playwright, Chromium fake-media).

Expected (acceptance criteria — each must be an ASSERTABLE failing test that reproduces current give-up):
1. A fault-injection mechanism (env-gated backend middleware or equivalent test hook) can force
   /api/sfu/tracks to return 406 for a selected participantId/request — WITHOUT calling real Cloudflare.
2. A test drives a remote track that is advertised but never becomes subscribed, and ASSERTS the client
   ends in `advertised-not-subscribed` and STOPS retrying (current give-up) — this test FAILS against
   the desired behavior (i.e., documents the bug).
3. A test drives a subscribed inbound audio track whose bytes/energy/emitted-samples never advance, and
   ASSERTS the current watchdog caps into `mark-stalled` and gives up (documents the bug).
4. A test for the stale-in-flight case: an old subscribe response arriving AFTER a (future) rejoin must
   not bind to a new PC — express the guard the fix will need (may be a focused unit/reducer test).
5. On 406, capture exact evidence fields (CF errorCode/description/status/endpoint, local+remote
   cfSessionId, track names, pc.signalingState, publish-vs-subscribe) — assert they are recorded and
   NOT mislabeled as lastGumError (sets up R5).

Scope:
- Implement only the REPRODUCTION HARNESS + failing tests for R1. Do NOT implement the fix (that is B2).
- This is a harness slice: tight, provable by focused tests. If PROPOSED is bigger, propose a split.
- Do not change the recovery logic itself (sfu-client retry/rejoin) — only add test hooks + tests.
- Fault injection must be strictly test/dev-gated (env flag), never reachable in production paths.
- Robust polled assertions, not one-shot checks. Assert the OUTCOME (the give-up state), not just that a call fired.
- Escape valve: if a full Playwright repro is infeasible for a case, fall back to a focused service/reducer test and note it.

Plan handshake protocol (MANDATORY before implementation):
1. Read this brief in full. Read referenced files.
2. Reply with PROPOSED: mechanism-level diagnosis + planned files + risks + estimate confirmation.
3. Confirm or counter-propose the effort tier (one-line "why"). Higher wins on conflict.
4. End reply with: STATUS: PROPOSED — <one-line approach> · complexity: <confirmed-or-counter> · why: <one line>.
5. Wait for projcore APPROVED-PLAN before writing code.
6. If REVISE-PLAN returned, address gaps, re-emit STATUS: PROPOSED.

After APPROVED-PLAN:
7. Implement at the agreed mode chord (grok reasoning-effort high).
8. Reply with STATUS: DONE — <one-line summary> when build + targeted tests are green (tests FAIL by design where they document the bug — that is the expected "green" for a repro harness; make the assertion intent explicit).

Required artifacts:
- batch-B1/scenarios.md
- batch-B1/changes.md (User Report verbatim + Root Cause mechanism + Code Changes per-file WHY)
- batch-B1/review.md
- batch-B1/test-report.md
- batch-B1/screenshots/ (if any UI-observable repro)
- batch-B1/independent-validation.md
- decisions/<YYYY-MM-DD>-<slug>.md per §1.15 — MANDATORY for any non-trivial autonomous call (if none, state explicitly: "Autonomous decisions: none").

---

## Streaming-order mandate

**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). Not the first sentence — the first tool call BEFORE any prose tokens stream. This is a buffer-flush guarantee: if your session is interrupted between prose-streaming and the tool call, the callback never lands and projcore stalls. Append first, prose after.**

## Callback emission — the ONLY sanctioned form

```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B1 <STATE> "<note>"
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
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B1[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo

End your reply with `STATUS: <STATE> — <same short note>` for human readability. Callback file wins if they differ.

STATUS: PROPOSED
