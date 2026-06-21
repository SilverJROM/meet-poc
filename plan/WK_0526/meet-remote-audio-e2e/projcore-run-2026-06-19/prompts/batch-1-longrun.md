<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-1 (longrun): sustained 10-15min+ agent call with measured audio, zero errors

Batch ID: batch-1
Requirements: R2+R3+R4 (agent joins + holds + audio both ways), durability bar
Lifecycle: pre-live — Deferral OFF.
Estimated: TEST-HEAVY. Effort high.

FRESH CONTEXT — full distilled state. Re-read files; don't assume.

## What's BUILT + WORKING (do not redo)
- Standing room AGENTROOM id=d98896162f09. Persistent auto-admitting HOST stays in it (host holds fine, pings every 15s).
- Join handshake fix (sonnet): join-ack watchdog in room.page.ts (resend join if no ack) + backend join idempotency (signaling/index.ts ~904, incl closedWaiters).
- 15s client HEARTBEAT (sonnet) in ws.service.ts + backend ping handling — stops the ~2min idle 1006/4000 drop. App had a 45s stale-heartbeat self-closer (close 4000) that was killing idle sockets.
- Resume instrumentation: backend logs resumeReason=token|clientKey|identity|none; __meetDebug exposes clientKeyHash (durable, room.page.ts:611) + reconnectTokenPresent. Backend logs clientKeyPresent=true (NOT raw key).
- Agent harness: e2e/scripts/peer2-remote-join.mjs — clean real join flow (NO window.WebSocket monkey-patch — that was a past regression, stays removed). Driven on creepy-mini by Peer2-codex via the relay.

## The GOAL now (JROM durability bar)
A **CLEAN RUN = a SUSTAINED 10-15min+ call with ZERO errors**: the agent (Peer2-codex on creepy-mini) joins AGENTROOM, STAYS admitted/connected the WHOLE 10-15min (no 1006 drop, no EXPIRE, no re-knock churn), ICE connected, and AUDIO measured BOTH ways continuously. Need **2-3 such sessions**. A 90s/3min test does NOT count — runs must be 10-15min+.

## Open questions to nail (last diagnostic was vague)
1. Does the AGENT (not just host) reliably get myClientId + get ADMITTED server-side? (Verify via pm2 [ws-recv] type=admit + ADMITTED peer2-remote AND the agent's own __meetDebug.myClientId now that it's durable.)
2. Is the AGENT'S OWN 15s heartbeat firing (in the agent browser context, not just the host)? A 1006 at ~90s in a prior run suggests maybe not.
3. Does the agent reach iceConnectionState=connected + a real selected pair (relay=Cloudflare TURN for long-haul) + RTT?

## THE RUN (do this)
1. Confirm host in-call on AGENTROOM d98896162f09 (reopen if needed); confirm host pings.
2. Via relay (sendRelayChatMessage to 872d483d), have Peer2-codex run peer2-remote-join.mjs against the AGENTROOM public URL and KEEP IT ALIVE for **a FULL 12-15 MINUTES** (not 90-120s). The agent must publish audio.
3. CAPTURE CONTINUOUSLY for the whole window (agent side via __meetDebug + getStats; host side via getStats; backend via pm2): join+myClientId, admit, agent's own heartbeat cadence, iceConnectionState, selected pair type+RTT, AUDIO both ways (host measures agent tone + agent measures host tone — energy >=3s sustained AND inbound-rtp bytesReceived rising, per the B0 dual-criteria), and ANY error/drop/reconnect/warn at any point.
4. PASS = the full 12-15min holds with ZERO errors + audio both ways the whole time. Report the timeline + every metric + any single error (any error = NOT clean).

## If the agent's own heartbeat ISN'T firing / it drops mid-run
That's the fix to make (likely the agent's ws heartbeat not running in its context, or long-haul keepalive interval). Diagnose exact cause, report it (coordinator routes the fix: complex→sonnet).

## Relay / files
GraphQL https://johnnyone.peer2-353.workers.dev/graphql, header Authorization: Bearer $PEER2_MACHINE (from .env, NEVER echo). Session 872d483d. Node liveness: listDesktopNodes fresh lastHeartbeatAt. Files: peer2-remote-join.mjs, ws.service.ts, room.page.ts, backend signaling/index.ts, audio-rig.ts (B0 measurement). Loop mechanic: any code change → rebuild fe+be → pm2 restart → host reopens AGENTROOM → agent joins → read. DEV only; never touch TEST_ROOM01.

## Plan handshake
1. Read this + the files. 2. STATUS: PROPOSED — how you'll run the 12-15min capture + the 3 open questions. 3. End: STATUS: PROPOSED — <approach> · complexity: high · why: <one line>. Wait for APPROVED-PLAN.
After APPROVED: run it. STATUS: DONE only for a genuinely clean 12-15min run w/ audio both ways (else report findings + STATUS: WORKING/NEEDS-INFO).

Artifacts under batch-artifacts/batch-1/: longrun-timeline.md (full minute-by-minute), metrics/ (both-ends getStats over time + audio), test-report.md.

---
## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). Not the first sentence — the first TOOL CALL, BEFORE any prose tokens stream. Append first, prose after.**
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
Keep callback notes under ~200 chars.
## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-1[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If matched — STOP emitting for this batch.
## Optional pane-STATUS echo
End reply with `STATUS: <STATE> — <note>`. Callback wins if they differ.
---
(end of brief)

## ADDITIONAL CHECK (R8 — JROM, per-user recording for transcription)
During the 10-15min clean call, ALSO verify RECORDING: start a recording (the app has recording — see project_specs.md §5.2 recording persistence + /upload), and confirm the produced recording captures EACH user's voice as a SEPARATE/distinguishable track (host + agent), so per-speaker transcription is accurate (not one mixed-overlap track). Report: recording produced y/n + per-user separability y/n + where the artifact is. If recording mixes voices into one track with no per-user separation, that's an R8 gap to flag (coordinator routes the fix).
