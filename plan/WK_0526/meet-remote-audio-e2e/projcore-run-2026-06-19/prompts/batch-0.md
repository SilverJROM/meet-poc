<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-0: DEV up + local 2-client audio rig + measurement module

Batch ID: batch-0
Plan: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-remote-audio-e2e/projcore-run-2026-06-19/implementation-plan.md
Branch: feat/remote-audio-e2e-20260619
Requirements assigned: R1 (foundation for R2-R6)
North-star anchors: Goal, Topology, Measurement standard, Guardrails, Effort Policy
Lifecycle: pre-live — Deferral policy: OFF. Read `~/.claude/JROM/style/deferral-policy.md`. Under OFF: no TODO/FIXME, no "follow-up PR," no dead-code shims, no @deprecated markers without a queue.md row in THIS run. Uncertainty = STATUS: NEEDS-INFO, not a defer.

Estimated duration: MEDIUM — 45min

Effort tier (PROJCORE-PROPOSED — confirm or counter-propose at PROPOSED): medium
  Mode chord: /fast ON · effort medium · thinking marker none
  Validator topology: 3-agent (validator=codex55)
  Why: default medium — rig/harness build, real-time/WebRTC domain but B0 is local-only foundation.

Context (from context-handoff.md):
Fresh run. meet-poc DEV is currently DOWN (no `meet-poc-be`/`meet-poc-fe` PM2 procs, :4720/health fails). Repo already has a Playwright + fake-media WebRTC harness under `e2e/`. Single seeded user `jrom@silverjrom.app`; password in repo-root `INITIAL_PASSWORD.txt` (read at runtime; NEVER print it). Signaling uses knock/admit + participant sidebar. This batch builds the LOCAL rig + measurement module that every later batch (remote join, audio both ways, 3-way) reuses.

Requirements section (verbatim from og-requirements.md):
"R1 — DEV is up and hostable. meet-poc DEV (https://voice.silverjrom.app, local PM2 meet-poc-be+meet-poc-fe) is running; host can create/open a throwaway room reachable by a remote long-haul participant. Acceptance: /health 200 + host browser at /room/:id shows the in-call view; room id captured."
Measurement standard (applies to the rig you build): "measurably received" = BOTH (a) WebAudio AnalyserNode RMS/energy above a calibrated silence floor for >=3s, AND (b) RTCPeerConnection.getStats() inbound-rtp audio bytesReceived strictly increasing. Each party emits a DISTINCT known signal.

Observed (current state):
- `pm2 jlist` has no meet-poc procs; `curl :4720/health` fails. DEV down.
- `e2e/playwright.config.ts` (baseURL ~localhost:4710/4700), fake-media flags already used for WebRTC tests. `e2e/fixtures/rooms.ts` has room helpers. Persistent room TEST_ROOM01 (`testroom01001`) must NOT be touched.
- Deploy per project_specs.md §8: `pm2 start ecosystem.config.js`; migrate `cd backend && npm run migrate && npm run seed`; consolidated proxy :4700, backend :4720, FE :4710.

Expected (acceptance criteria — all observable/assertable):
1. DEV brought up: `pm2 start ecosystem.config.js` (or restart) → `meet-poc-be`+`meet-poc-fe` online; `curl -fsS http://localhost:4720/health` returns 200; `curl -fsSI http://localhost:4700/login` 200.
2. A reusable harness entrypoint (e.g. `e2e/remote-audio/` or `scripts/audio-rig/`) that: logs in as the seeded user (reads `INITIAL_PASSWORD.txt`), creates a DEDICATED THROWAWAY room (distinct title like `RA-E2E-<rand>`, NEVER TEST_ROOM01), opens host at `/room/:id` to the in-call view, and captures the room id.
3. A **measurement module** (shared TS util) usable from page context: given an inbound MediaStreamTrack + the RTCPeerConnection, returns {energyRmsPeak, energyAboveFloorMs, inboundBytesDelta, audioLevel} sampled over a window; PASS predicate = energyAboveFloorMs>=3000 AND inboundBytesDelta>0. Distinct-signal helper: each client uses a different fake-audio file or tone freq.
4. Two LOCAL Chromium clients (host + 1 guest) both join the throwaway room with fake-audio (`--use-fake-device-for-media-stream` + `--use-file-for-fake-audio-capture=<distinct wav per client>`), guest completes knock→admit. Prove MUTUAL audio: host measures guest's signal PASS AND guest measures host's signal PASS, on the rendered app, with a screenshot of the 2-tile in-call view + a JSON metrics artifact.
5. Document the exact join path used (selectors for knock/admit, how a 2nd participant is admitted) in changes.md — later batches depend on it.

Scope:
- Implement only the R1 foundation + the reusable rig/measurement module. ONE atomic vertical slice provable by the local 2-client mutual-audio check.
- Do NOT touch production call logic except minimal, justified fixes needed to make the local 2-client audio path work (if a real bug blocks it, that's in scope — note it as a finding; bigger fixes belong to later batches B1-B4).
- Do NOT touch TEST_ROOM01 / `testroom01001`. Clean up any room you create at end of batch, OR leave the one throwaway room and record its id for reuse by B1.
- DEV only. Never QA/PROD. No prod deploy beyond local PM2.
- Robust polled assertions, not one-shot checks. Assert the OUTCOME (measured audio), never just that join fired.
- Secrets: read `INITIAL_PASSWORD.txt` and `.env` at runtime; NEVER echo their contents into logs, artifacts, or the pane.
- Escape valve: if the ideal proof is infeasible, fall back to the simpler proof and note it.

Plan handshake protocol (MANDATORY before implementation):
1. Read this brief in full. Read referenced files (ecosystem.config.js, e2e/playwright.config.ts, e2e/fixtures/rooms.ts, the room/in-call frontend components, project_specs.md §§3,5.1,6,8).
2. Reply with PROPOSED: mechanism-level plan + the join path you'll use + planned files + risks + estimate confirmation.
3. Confirm or counter-propose the effort tier (one-line "why"). Higher wins on conflict.
4. End reply with: STATUS: PROPOSED — <one-line approach> · complexity: <confirmed-or-counter> · why: <one line>.
5. Wait for projcore APPROVED-PLAN before writing code.
6. If REVISE-PLAN returned, address gaps, re-emit STATUS: PROPOSED.

After APPROVED-PLAN:
7. Implement at the agreed mode chord. Default-cap at medium; auto-escalate to high on the 2nd send-back on this task (log in changes.md).
8. Reply with STATUS: DONE — <one-line summary> when build + the local 2-client mutual-audio check are green.

Required artifacts (under the run dir `batch-artifacts/batch-0/`):
- batch-0/scenarios.md
- batch-0/changes.md (what DEV-up steps ran + Root Cause of any bug fixed + Code Changes per-file WHY + the documented join path)
- batch-0/review.md
- batch-0/test-report.md
- batch-0/screenshots/ (the 2-tile in-call view + any failures)
- batch-0/metrics/ (the JSON metrics artifact from the measurement module)
- batch-0/independent-validation.md
- decisions/<YYYY-MM-DD>-<slug>.md per §1.15 for any non-trivial autonomous call (if none: "Autonomous decisions: none").

---

## Streaming-order mandate

**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). Not the first sentence — the first TOOL CALL, BEFORE any prose tokens stream. This is a buffer-flush guarantee: if your session is interrupted between prose-streaming and the tool call, the callback never lands and projcore stalls. Append first, prose after.**

## Callback emission — the ONLY sanctioned form

```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0526/meet-remote-audio-e2e/projcore-run-2026-06-19/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-0 <STATE> "<note>"
```

The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)

```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO

NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```

Use WORKING only for non-terminal progress (first reply if no routeable state yet, or any reply >2min since last callback). Emit terminal/handshake state directly when you have it.

## ACK stop-rule

Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-0[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo (human-readable mirror only)

End your reply with `STATUS: <STATE> — <same short note>` for readability. Callback wins if they differ.

---
(end of brief)
