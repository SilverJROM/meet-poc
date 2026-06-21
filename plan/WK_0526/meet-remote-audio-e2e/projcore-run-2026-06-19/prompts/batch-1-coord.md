<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-1 (coord): real creepy-mini remote ADMITTED into a live host room AND media connected

Batch ID: batch-1
Branch: feat/remote-audio-e2e-20260619
Requirements: R2 (remote joins AND reaches connected+publishing media)
Lifecycle: pre-live — Deferral OFF.
Estimated: TEST-HEAVY 45min. Effort high · /fast OFF · think hard.

FRESH CONTEXT — full distilled state below. Re-read the listed files; don't assume.

## WHAT WORKS (banked — do not redo, do not break)
- B0: local 2-client (host+guest) — knock→admit→BIDIRECTIONAL audio — VERIFIED. The app's full media path is SOUND locally.
- The app `join()` device gate + signaling WS + knock + admit all work. Earlier B1 runs DID log `KNOCK peer2-remote → ADMITTED peer2-remote admitted=2` for the REAL creepy-mini guest. **Do NOT modify the admit logic — it works.**
- PAGE-CLOSE SOLVED: the remote browser kept dying because it was a child of the relay command. FIX that works: have **Peer2-codex** (persistent agent on creepy-mini, relay session 872d483d) OWN the guest process — it held chrome alive a full 90s and reported a clean timeline.

## THE REMAINING PROBLEM (the only thing to fix)
Reliably get the REAL creepy-mini guest ADMITTED into a LIVE host room, THEN have its media (offer→ICE) connect. Current decoupled runs fail because the host (PW test) and the Peer2-codex guest aren't on the same live room at the same time: guest knocks but no admit (no backend KNOCK for that room → host wasn't live/admit-ready on it during the guest's window).

## ROBUST RECIPE (implement this)
1. **Long-lived auto-admitting host** under the Playwright test runner: create a throwaway room, join as host, and STAY in-call ~5 minutes, AUTO-ADMITTING any knocker on the room (reuse the existing admit path — do not force/modify it). Confirm host is in-call + signaling WS connected + admit-ready BEFORE step 2. Capture the room PUBLIC url.
2. **Then** send Peer2-codex ONE agent task via sendRelayChatMessage: `Run: node /home/creepy/Documents/Workspace/peer2-remote-join.mjs "<ROOM_URL>". KEEP the process + chrome ALIVE YOURSELF until it logs iceConnectionState=connected OR 120s. Then report the FULL timeline (admit-rel, myClientId, createOffer, setLocalDescription, each icecandidate, iceConnectionState transitions, selected candidate-pair type+RTT) + /tmp/peer2-b1-metrics.json.`
3. Host AUTO-ADMITS the knock when it arrives (within its 5-min window), completes the SFU answer. Both stay up through ICE connect.
4. Poll listAiMessages for Peer2-codex's report; capture host-side getStats too.
5. Cross-check `pm2 logs meet-poc-be`: KNOCK→ADMITTED for THIS room + the remote STAYS admitted (no premature EXPIRE) through the media window + offer/answer.

## SUCCESS BAR (R2 — REAL creepy-mini remote, not local sim)
Backend KNOCK→ADMITTED for the room + STAYS admitted; Peer2-codex timeline shows admit → createOffer → setLocalDescription → icecandidates → **iceConnectionState=connected/completed** + an active outbound audio track + a real selected candidate-pair (type+RTT, expect relay for long-haul). Local-sim or admit-without-connected-media is NOT acceptable (RED-TEAM-CHARTER.md B1/B3/C1).

## If media STILL fails after a clean admit
Now the timeline reveals the real layer: did createOffer fire? did the WS drop mid offer/answer (hyp2)? did publish never trigger (hyp3)? Fix the actual mechanism (likely app `frontend/src/app/services/ws.service.ts` keepalive/reconnect-preserving-PC, or publish sequencing) — minimal, root-caused.

## Files
e2e/scripts/peer2-remote-join.mjs (guest), the B1 host test under runner, e2e/fixtures/audio-rig.ts, frontend/src/app/pages/room/room.page.ts (join ~869 / ws.connect ~910 / admit/knock), frontend/src/app/services/ws.service.ts.

## Relay
GraphQL https://johnnyone.peer2-353.workers.dev/graphql, header Authorization: Bearer $PEER2_MACHINE (source from /home/agjrom/websites/meet-poc/.env, NEVER echo). Session 872d483d-d986-4a3d-9486-eb59a600a55d. Node liveness: listDesktopNodes fresh lastHeartbeatAt.

## Scope
Fix ONLY the coordination + (if needed) the post-admit media mechanism. No prod debug logs left in (deferral OFF). No force-admit hack. Don't touch TEST_ROOM01. DEV only. Robust polled assertions.

## Plan handshake
1. Read this brief + the files. 2. STATUS: PROPOSED — the coordination flow + how you confirm host-ready before tasking Peer2-codex + the success capture. 3. End: STATUS: PROPOSED — <approach> · complexity: high · why: <one line>. Wait for APPROVED-PLAN.
After APPROVED: implement, run, STATUS: DONE only when the REAL remote reaches iceConnectionState=connected + outbound track + real pair (not admit-only, not local-sim).

Required artifacts under batch-artifacts/batch-1/: changes.md (root cause + fix), metrics/ (REAL remote timeline + pair), relay-transcript.md, test-report.md, independent-validation.md.

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
If matched — STOP emitting callbacks for this batch.
## Optional pane-STATUS echo
End reply with `STATUS: <STATE> — <note>`. Callback wins if they differ.
---
(end of brief)
