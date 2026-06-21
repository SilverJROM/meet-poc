<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-1 (voice-first): prove the agent's AUDIO connects BOTH ways — SHORT run only

Batch ID: batch-1
Requirements: R3+R4 (audio both ways) — the core remaining media question
Effort: high. SHORT runs only (~2-3min) — do NOT run 10-15min yet (that's later, after voice works).

ONE JOB THIS PHASE: prove the remote agent's AUDIO actually flows BOTH directions. Nothing else.

## State (don't redo)
- Standing room AGENTROOM, slug "agentroom" → room id d98896162f09. Persistent HOST is in-call there + publishing (backend shows sfu-publish + pings). Join+admit+heartbeat work (agent holds connected).
- Agent harness: e2e/scripts/peer2-remote-join.mjs, driven on creepy-mini by Peer2-codex via relay (session 872d483d). B0 audio measurement util: e2e/fixtures/audio-rig.ts.

## DO (one short cycle)
1. Confirm host in-call on AGENTROOM d98896162f09 (it is — sfu-publish + pings). Host publishes a known tone.
2. Via relay (sendRelayChatMessage to 872d483d), Peer2-codex runs peer2-remote-join.mjs against https://voice.silverjrom.app/room/agentroom for ~2-3 MINUTES, agent PUBLISHES its known tone.
3. CAPTURE the audio result on BOTH ends and REPORT precisely:
   - agent iceConnectionState (connected/completed?)
   - selected candidate-pair TYPE (relay = Cloudflare TURN expected long-haul) + RTT
   - HOST→AGENT audio: does the agent measure the host's tone? (WebAudio energy >=3s AND inbound-rtp bytesReceived rising)
   - AGENT→HOST audio: does the host measure the agent's tone? (same dual-criteria)
   - backend: sfu-publish + sfu-subscribe for BOTH parties?

## If audio does NOT connect both ways
Report the EXACT failing step, one of: agent createOffer/setLocalDescription not firing · SFU publish not sent · SFU subscribe/answer missing · ICE never connects · track received but no decoded energy (decode/sink). That exact step is the media fix (coordinator routes: complex media → sonnet; co-plan codex55).

## Also note
- Earlier the agent console showed [Telegram.WebView] events — confirm the agent browser is loading the REAL app page (the meet room), not a Telegram webview/wrong context. If it's a wrong context, that could break media — flag it.

PASS this phase = audio measured BOTH ways in a short run. Then we add video + move to the 10-15min durability runs.

## Loop mechanic
Any code change → rebuild fe+be → pm2 restart → host reopens AGENTROOM → agent joins → SHORT run → read. DEV only; never TEST_ROOM01; no WebSocket monkey-patch.

## Plan handshake
Reply STATUS: PROPOSED — how you'll run the short voice test + capture both-ways audio. End: STATUS: PROPOSED — <approach> · complexity: high · why: <one line>. Wait for APPROVED-PLAN.
After APPROVED: run it, STATUS: WORKING with findings, or DONE only if audio confirmed both ways.

Artifacts: batch-artifacts/batch-1/voice-result.md (ICE/pair/audio both ways + any failing step).

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
