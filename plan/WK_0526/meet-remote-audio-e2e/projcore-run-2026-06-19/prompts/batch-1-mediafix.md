<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-1 (mediafix): make the REAL creepy-mini remote's WebRTC MEDIA actually connect

Batch ID: batch-1
Branch: feat/remote-audio-e2e-20260619
Requirements: R2 (remote joins AND reaches connected+publishing — media, not just admit)
Lifecycle: pre-live — Deferral OFF. No TODO/shims/debug-left-in-prod.

Estimated: TEST-HEAVY — 45min. Effort: high · /fast OFF · think hard.

THIS IS A FRESH CONTEXT — here is the full distilled state. Re-read the listed files; don't assume.

## What ALREADY WORKS (banked — do not redo)
- The remote guest on creepy-mini (driven via the JohnnyOne relay) JOINS our DEV call fully at the SIGNALING level: it passes the app's `join()` device gate, constructs the signaling WebSocket, knocks, and the host ADMITS it. Backend confirms: `KNOCK peer2-remote` → `ADMITTED peer2-remote admitted=2`. Tiles=2.
- Files in play: `e2e/scripts/peer2-remote-join.mjs` (the standalone guest that runs on creepy-mini), the B1 host test (host under Playwright runner), `e2e/fixtures/audio-rig.ts`, `frontend/src/app/pages/room/room.page.ts` (join() at line ~869, ws.connect at ~910), `frontend/src/app/services/ws.service.ts` (signaling WS + heartbeat/reconnect).
- A LOCAL guest sim (same script, run locally against the public URL) DOES establish media: gets an ICE pair (relay/host, rtt~6, pairState succeeded). So the APP + SCRIPT media path is SOUND locally.

## THE BUG (the only thing to fix)
The REAL creepy-mini remote NEVER establishes WebRTC media post-admit:
- metrics: `gatheredLocal=0`, `iceConnectionState=null`, `connectionState=null`, `publishState=null` — i.e. the PeerConnection never gathers a single ICE candidate or publishes.
- backend pattern: `KNOCK → ADMITTED → RECONNECTING (peer2-remote, ~4s after admit) → EXPIRED (~2min)`.
- So: real remote joins+admits, but its media negotiation never starts/completes.

## Top hypotheses (verify on the REAL creepy-mini remote, not a local sim)
1. **Remote browser/script exits or the page closes shortly after admit**, before the post-admit publish/PC negotiation runs → no createOffer/ICE. (Prior attempt added `nohup`/keep-alive — verify the page truly stays alive through PC connect+publish, e.g. 30–60s post-admit.)
2. **Long-haul signaling WS drops/reconnects mid offer-answer** (the RECONNECTING 4s after admit), aborting the SFU media negotiation before ICE gathers. (Echoes the JohnnyOne long-haul-WS lesson — needs keepalive/reconnect that PRESERVES the in-flight PC, or sequence publish to complete before any WS churn.)
3. **The publish/offer is never triggered** on the remote after admit (the app's admitted→publish step doesn't fire headless, or the script doesn't drive it).

## Required (R2 acceptance — on the REAL creepy-mini remote, via relay)
1. Instrument the remote (in peer2-remote-join.mjs): log PC creation, addTrack, createOffer, setLocalDescription, EVERY `icecandidate`, `iceconnectionstatechange`, `connectionstatechange`, and the SFU offer/answer WS messages — with timestamps relative to admit and to any WS reconnect/expire.
2. Keep the remote page ALIVE through the full post-admit negotiation window (don't snapshot/exit early).
3. Diagnose which hypothesis holds; fix the mechanism (app and/or script). If it's the app's signaling WS dropping the PC on long-haul, fix it in `ws.service.ts`/room.page (keepalive / reconnect that survives, or publish-before-churn) — that's a REAL app fix and in scope.
4. PASS = the REAL creepy-mini remote reaches `iceConnectionState` connected/completed, has an active outbound audio track, and a real selected candidate-pair (capture type relay/srflx/host + RTT — expect relay for long-haul). Backend should show the remote STAY admitted (no premature EXPIRE) through the media window.
5. A LOCAL guest sim is NOT acceptable proof (RED-TEAM-CHARTER.md B3). The bar is the actual creepy-mini remote.

## Relay (drive creepy-mini)
GraphQL https://johnnyone.peer2-353.workers.dev/graphql, header `Authorization: Bearer $PEER2_MACHINE` (source from /home/agjrom/websites/meet-poc/.env, NEVER echo). Live codex session: 872d483d-d986-4a3d-9486-eb59a600a55d. sendRelayChatMessage to write+run the script on creepy-mini + report; poll listAiMessages. Node liveness via listDesktopNodes (fresh lastHeartbeatAt). System chrome at /usr/bin/google-chrome with --use-fake-device-for-media-stream --use-fake-ui-for-media-stream.

## Scope
- Fix ONLY the real-remote media-connect problem. App fixes to signaling-WS stability / publish sequencing are in scope IF that's the root cause (root-cause it first, minimal change). Do NOT add prod debug logs that stay (deferral OFF) — instrumentation must be removed or guarded before DONE.
- Do NOT touch TEST_ROOM01. DEV only. Clean up throwaway rooms at end (or record ids).
- Robust: WAIT for iceConnectionState=connected (polled, timeout) before declaring anything; assert the OUTCOME.

## Plan handshake
1. Read this brief + peer2-remote-join.mjs + room.page.ts (join/publish/admitted flow) + ws.service.ts + audio-rig.ts.
2. STATUS: PROPOSED — which hypothesis you'll confirm first + how you'll instrument the REAL remote + the likely fix + risks.
3. End: STATUS: PROPOSED — <approach> · complexity: high · why: <one line>. Wait for APPROVED-PLAN.

After APPROVED-PLAN: implement, retest on the REAL creepy-mini remote, STATUS: DONE only when the real remote's iceConnectionState=connected + outbound track + real pair (NOT admit-only, NOT local-sim).

Required artifacts under batch-artifacts/batch-1/: changes.md (root cause + fix), metrics/ (REAL remote PC/ICE timeline + selected pair), relay-transcript.md, test-report.md, independent-validation.md.

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
Keep callback notes under ~200 chars. Use WORKING for progress.

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-1[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End reply with `STATUS: <STATE> — <note>`. Callback wins if they differ.
---
(end of brief)
