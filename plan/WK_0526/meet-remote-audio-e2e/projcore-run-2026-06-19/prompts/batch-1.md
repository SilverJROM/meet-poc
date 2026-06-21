<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-1: Peer2's faraway machine (creepy-mini) actually JOINS our call

Batch ID: batch-1
Plan: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-remote-audio-e2e/projcore-run-2026-06-19/implementation-plan.md
Branch: feat/remote-audio-e2e-20260619 (continue)
Requirements assigned: R2
North-star anchors: Goal, Topology, Relay facts, creepy-mini capability, Guardrails, Effort Policy
Lifecycle: pre-live — Deferral policy: OFF. Read `~/.claude/JROM/style/deferral-policy.md`. No TODO/FIXME/shims without a queue.md row THIS run. Uncertainty = STATUS: NEEDS-INFO, not a defer.

Estimated duration: TEST-HEAVY — 60min (cross-machine long-haul; diagnosis-heavy)

Effort tier (PROJCORE-PROPOSED — confirm/counter at PROPOSED): high
  Mode chord: /fast OFF · thinking marker "think hard"
  Validator topology: 3-agent (validator=codex55)
  Why: real-time cross-machine WebRTC over long-haul TURN+SFU — the hard ICE/relay path; diagnosis-grade reasoning needed.

Context (from context-handoff.md — B0 PASS):
DEV is up. Reusable rig at `e2e/fixtures/audio-rig.ts` + shared measurement module + tone WAVs. Local 2-client mutual audio is VERIFIED. Join path on the app = knock-toast + Admit (exact selectors documented in `batch-artifacts/batch-0/changes.md` — READ IT). Now extend to the REAL case: a browser on Peer2's machine `creepy-mini` (across the world) joins our DEV call over the public CF-tunnel URL. This is the long-haul TURN+SFU path.

Requirements section (verbatim from og-requirements.md):
"R2 — Remote participant joins. creepy-mini (Peer2-codex, headed/headless Chrome via relay) opens the room link, completes the join path (knock→host admit, or guest path), and reaches a connected+publishing state. Acceptance: On host screen the remote participant tile appears + is admitted (participant sidebar count increments). On remote: getStats shows an active outbound audio track + ICE connected/completed."

Observed (current state):
- creepy-mini probed (READ-ONLY, north-star): Ubuntu x86_64, node v22, google-chrome 149, Playwright browsers cached (`~/.cache/ms-playwright`), DISPLAY=:0, no pulseaudio. It CAN run Chrome+Playwright to join.
- Public URL Peer2 hits: https://voice.silverjrom.app/room/<id> (CF tunnel → localhost:4700). Host side is local.
- KEY UNKNOWN to resolve early: does a GUEST join need login, or is it pure knock-via-link (no creds)? B0's knock-toast path suggests guests knock without login. If guest needs login, creds must NOT leave our box — resolve a credential-free guest path or flag NEEDS-INFO. (We will NOT ship INITIAL_PASSWORD.txt to creepy-mini.)

Expected (acceptance criteria — R2, observable on BOTH ends):
1. Host harness: our automated host client (logged-in seeded user) creates a DEDICATED THROWAWAY room, opens `/room/:id` in-call, captures the PUBLIC url, and is live + auto-admits an incoming knock. (Reuse audio-rig.ts host pieces.)
2. Peer2-join: a STANDALONE Playwright script (param ROOM_URL) that runs on creepy-mini: opens the public room URL, completes guest-join → knock, publishes a fake audio track (tone, distinct from host), reaches ICE connected/completed with an active OUTBOUND audio track, captures getStats (ICE state, selected candidate-pair type — relay/srflx/host, RTT) + console, writes a metrics JSON, and stays in-call ~20s so the host can admit + observe.
3. Cross-machine orchestration via the RELAY (see playbook below): deliver the join script to creepy-mini and have Peer2-codex run it against the live ROOM_URL while the host harness is admit-ready.
4. PASS (R2): on HOST — the remote participant tile appears AND is admitted (sidebar count increments) [screenshot]. On REMOTE — getStats shows ICE connected/completed + active outbound audio track [Peer2-side getStats JSON]. Audio CONTENT both-ways is B2/B3 — NOT required to pass B1; reaching connected+publishing is the bar.
5. On ANY failure: capture from BOTH ends — ICE candidate types, whether TURN relay was used, candidate-pair RTT, SFU/transport state, console errors. Consult Peer2-codex via the relay for its local getStats/ICE/console. This evidence drives the diagnose→red-team→fix→retest loop. Note long-haul traps (RTT>=150ms, WARP/relay) — see [[project_meet_intl_call_verification]].

RELAY PLAYBOOK (how to drive Peer2-codex on creepy-mini):
- GraphQL: https://johnnyone.peer2-353.workers.dev/graphql ; header `Authorization: Bearer $PEER2_MACHINE` (source from /home/agjrom/websites/meet-poc/.env at runtime — NEVER echo the key).
- Live Peer2-codex session: 872d483d-d986-4a3d-9486-eb59a600a55d (provider codex, cwd /home/creepy/Documents/Workspace). Reuse it or createAiSession(provider:"codex", workingDirectory) for a fresh one.
- Send work: mutation sendRelayChatMessage(input:{sessionId, content:"<instructions/script>", provider:"codex"}). Poll: query listAiMessages(sessionId){role content createdAt}. Liveness: query listDesktopNodes — trust FRESH lastHeartbeatAt (node `creepy-mini`), not the sticky "online" flag.
- Deliver the join script by sending its content via the relay and instructing Peer2-codex to save it on creepy-mini (e.g. /home/creepy/Documents/Workspace/peer2-join.mjs) and run it with the cached Playwright + chrome 149, pointed at the ROOM_URL you give it, then report back the metrics JSON + ICE state + any console/errors. Keep messages focused.
- creepy-mini has DISPLAY=:0 (can run headed) and no pulseaudio (use Chrome fake-audio flags — no system audio needed).

Scope:
- Build the host harness + the Peer2-join script + the relay orchestration to get a SUCCESSFUL remote JOIN (R2). ONE vertical slice ending at connected+publishing + host-admitted.
- If a REAL app bug blocks the long-haul join (ICE/TURN/SFU/relay), diagnosing + fixing it IS in scope (that's the point) — root-cause it, fix minimally, retest. Bigger architectural pivots → STATUS: NEEDS-INFO.
- Do NOT ship secrets to creepy-mini. Do NOT touch TEST_ROOM01/testroom01001. DEV only.
- Robust polled assertions (poll ICE state until connected/timeout), not one-shot. Assert the OUTCOME (connected+publishing+admitted), never just "navigation fired".
- Clean up the throwaway room at batch end OR record its id; report it.

Plan handshake protocol (MANDATORY before implementation):
1. Read this brief + batch-0/changes.md (join path) + audio-rig.ts + the SFU/signaling client + project_specs.md §§5,5.1 + the ICE config endpoint (/api/ice-config). 
2. Reply PROPOSED: how you'll host+admit, the Peer2-join script shape, the relay orchestration, the guest-auth resolution, ICE/TURN diagnosis plan, risks, estimate.
3. Confirm/counter the effort tier (one-line why). Higher wins.
4. End reply with: STATUS: PROPOSED — <one-line approach> · complexity: <confirmed-or-counter> · why: <one line>.
5. Wait for APPROVED-PLAN before implementing.
6. If REVISE-PLAN, address gaps, re-emit PROPOSED.

After APPROVED-PLAN:
7. Implement at the agreed chord. Auto-escalate effort on 2nd send-back (log in changes.md).
8. STATUS: DONE — <one-line> when the remote JOIN is green (host-admitted + remote ICE connected+publishing) with both-ends artifacts.

Required artifacts (under run dir `batch-artifacts/batch-1/`):
- batch-1/scenarios.md
- batch-1/changes.md (the orchestration + Root Cause of any join bug fixed + per-file WHY + final room id + the guest-auth resolution)
- batch-1/review.md
- batch-1/test-report.md
- batch-1/screenshots/ (host showing the admitted remote tile)
- batch-1/metrics/ (host-side + Peer2-side getStats JSON: ICE state, candidate-pair type, RTT)
- batch-1/relay-transcript.md (the key sendRelayChatMessage/ listAiMessages exchanges with Peer2-codex — REDACT any secret)
- batch-1/independent-validation.md
- decisions/<YYYY-MM-DD>-<slug>.md per §1.15 (or "Autonomous decisions: none").

---
## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). Not the first sentence — the first TOOL CALL, BEFORE any prose tokens stream. This is a buffer-flush guarantee: if your session is interrupted between prose-streaming and the tool call, the callback never lands and projcore stalls. Append first, prose after.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=<abs-path-to-callbacks.md> \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-1 <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO

NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Use WORKING for non-terminal progress (first reply if no routeable state yet, or any reply >2min since last callback).

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-1[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo (human-readable mirror only)
End your reply with `STATUS: <STATE> — <note>`. Callback wins if they differ.
---
(end of brief)
