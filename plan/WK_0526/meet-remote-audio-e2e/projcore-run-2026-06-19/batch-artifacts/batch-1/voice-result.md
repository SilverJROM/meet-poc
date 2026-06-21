# Batch-1 Voice Result (SHORT ~2-3min run) — CLEAN relay.sh only

Room: d98896162f09 (AGENTROOM /agentroom)
URL used: https://voice.silverjrom.app/room/agentroom
Run time: 2026-06-20 ~08:33+
Method: ONLY ./e2e/scripts/relay.sh (send + last + poll + node). No node -e.

## 1. Host confirmed in-call + publishing (backend sfu-publish)
- pm2 agent-host: online, alive ticks continuing.
- BE: repeated media-state + ping for d98896162f09.
- Host diag (live): ws="connected", publish status="published", audio track "live", peers=1, myId present, selected pair local=srflx/remote=host rtt~6-7.
- sfu-publish present (prior + ongoing publish state).
- tiles=1 (host only).

## 2. Task via relay.sh + remote execution
- relay.sh node: creepy-mini online (heartbeat recent).
- relay.sh send used for task: "node /home/creepy/Documents/Workspace/peer2-remote-join.mjs ..." + VOICE_PROOF.
- Remote confirmed launch: process + /opt/google/chrome seen in ps during run; log file created (size ~12k in run).
- Targeted correct room (d98896162f09 in reconnect logs).

## 3. PEER2-VOICE-RESULT / metrics from remote (via relay.sh last responses)
- No PEER2-VOICE-RESULT or result JSON produced.
- During run logs showed:
  - [join-watchdog] no server ack within 5000ms; resending join
  - [signaling] send while NOT OPEN type=join readyState=1
  - [join-watchdog] no server ack after 3 resend(s); forcing socket reconnect
  - [signaling] reconnect scheduled room=d98896162f09 ...
  - PEER2-ERROR: page.waitForTimeout: Target page, context or browser has been closed
- After run: files gone, no process, "NO RESULT".
- iceConnectionState: never reached (pre-ICE error).
- selected pair type + RTT: n/a.
- Measures host's tone (energy + inbound-rtp): no (never published from agent, no measure executed).
- Loads the REAL app page (not Telegram webview): yes — correct room id referenced in logs; peer2 script is PW chromium driving the meet /room URL. No Telegram webview strings in failure logs.

## pm2 for sfu-publish + sfu-subscribe BOTH parties
- Host: yes (sfu-publish + "published" + live audio track).
- Agent: NO (no KNOCK, no ADMITTED for peer2, no second sfu-publish or subscribe evidence, no tiles=2, peers stayed 1).

## Does audio connect BOTH ways?
**NO**

## Exact failing step
agent join signaling to server (no ack received; "send while NOT OPEN"; watchdog resends + forced reconnect for the room; page closed before createOffer/setLocal/sfu-publish/ICE/audio measure on agent side). Knock never delivered; host never saw second party.

## Artifacts / evidence
- relay.sh last outputs (above summaries + process + log excerpts)
- Host diag snapshots (published + pair)
- BE pm2 (only host traffic)
- voice-proof-*.json (prior) + this updated voice-result.md

(End of clean relay.sh short voice test per brief.)

## Audio both-ways (B0 dual-criteria: energyAboveFloorMs>=3000 && inboundBytesDelta>0)
- HOST→AGENT: not measured (no remote report, host snap had no measure trigger)
- AGENT→HOST: not measured (no agent in call)
- voiceBothWays: false

## ICE / pair / states
- agent iceConnectionState: (not reported)
- selected candidate-pair: (not reported)
- No createOffer/setLocal/publishStatus from agent

## Backend sfu
- sfu-publish: yes for HOST
- sfu-subscribe: no evidence for AGENT (no join)
- No sfu activity from second party

## Failing step (exact)
agent_never_reported_voice_result (remote peer2-codex did not execute/return from the VOICE_PROOF node run; no knock reached backend)

## Telegram.WebView note
- No console/logs from this run (agent did not launch/report). 
- Prior history mentioned [Telegram.WebView] — the peer2-remote-join.mjs uses plain `chromium.launch` (real app page expected). If remote side is wrapped in Telegram WebView context it could break media/WS (would surface in PEER2 url logs + userAgent). Not observable this run.

## Raw artifacts
- voice-proof-1781944082282.json
- voice-proof-report.md
- pm2Excerpt + host diag captured above

## Next per brief
Add video + durability only after audio both-ways proven. Current bar not met on short voice run.

# STATUS: WORKING — short voice test executed; audio not both ways (agent side silent); failing step = agent_never_reported_voice_result
