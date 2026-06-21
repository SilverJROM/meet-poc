# CONSENSUS — deterministic agent join (6-panel front-load, 2026-06-20)

Panel: 2x Opus + 2x codex55 + spark + haiku. Strong convergence. Opus+codex55 settle.

## BIG FINDINGS (root causes of non-determinism — beyond the script)
1. **?sfu=0 / SFU mode** (opus): the room URL/mode may carry sfu=0 → SFU media path DISABLED → no audio even on a clean join. MUST ensure SFU mode ON for the agent (and host). Check peer2-remote-join.mjs URL + room.page sfu handling. (Possible THE media bug.)
2. **Admission must be DETERMINISTIC server-side** (both Opus): auto-admit for the standing AGENTROOM instead of relying on the host browser racing to admit a knock. "Single server change converts occasionally-succeeds → completes-every-run." App: server auto-admits knockers in the standing room (or host auto-admit must be deterministic + the host's admit must not depend on a flaky UI/race).
3. **Pre-admit heartbeat** (opus): the agent must send its 15s heartbeat WHILE knocking/pre-admit, else it 1006-drops while waiting. Ensure heartbeat starts at ws-open, not at in-call.

## APP FIXES (sonnet)
- A. Ensure SFU mode is ON for agent + host (resolve any ?sfu=0). 
- B. Deterministic admit for AGENTROOM (server auto-admit knockers, or rock-solid host auto-admit not gated on UI race).
- C. Agent/client heartbeat starts at WS-open (covers the knocking/pre-admit window), not at in-call.
- D. ws.send() logs LOUDLY (warn) when readyState != OPEN (haiku) — no silent drops.

## AGENT SCRIPT — deterministic sequence (sonnet, peer2-remote-join.mjs)
Register page.on('close'|'crash'|'pageerror') BEFORE goto. Poll APP-TRUTH observables (__meetDebug), never UI text or late stats:
1. goto(roomUrl with SFU ON) → assert expected browser context (NOT Telegram webview) + __meetDebug.roomState==='lobby'.
2. Complete guest name + device preflight → poll preflight TRUTH: live local audio track + speakerVerified + micWorking + preflightGateStatus, no blocking permission/setup error.
3. WAIT for ws OPEN: __meetDebug.wsConnected===true (+ lastJoinSentAt) — BEFORE clicking. (fixes the inverted WS step / NOT-OPEN churn.)
4. Click "Ask to join".
5. Poll server ack: myClientId truthy + roomState ∈ {knocking, waiting-room}.
6. (admit is deterministic per APP fix B) → poll roomState==='in-call' + myParticipantId present. FAST-FAIL: stuck 'knocking' >25s = host-never-admitted (distinct failure).
7. Poll publish: publishTriggerCount>0 + sfuPublishState.status==='published' + preflightGateStatus==='ready'.
8. Poll ICE: iceConnectionState ∈ {connected,completed} + selected pair succeeded (expect relay=CF TURN).
9. Measure BOTH ways: agent inbound-rtp bytesReceived rising + analyser RMS (agent hears host) AND host-side measures agent (host hears agent) — don't declare both-ways from one side. outbound bytesSent rising too.
10. On ANY step timeout: ONE clean reload retry (stable clientKeyHash), then fail with explicit step label + full dump. Do NOT context.close() until measure done.

## Watchdog
App join-ack watchdog stays as a safety net but the agent does NOT rely on it as primary sync (clicking before WS open causes duplicate joins/churn). Deterministic waits above are primary.

## Implementation order (sonnet)
1. APP fix A (SFU mode) + B (deterministic admit) + C (heartbeat at ws-open) + D (loud send) — these are what make it deterministic.
2. AGENT script the polled sequence.
3. rebuild fe+be → pm2 restart → host reopens AGENTROOM → short voice test via relay.sh.
Then fresh 4-panel red-teams the fix.
