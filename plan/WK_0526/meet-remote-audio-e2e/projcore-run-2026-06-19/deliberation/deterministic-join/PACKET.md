# DELIBERATION PACKET — deterministic agent join (front-loaded, before implementation)

## The problem
A remote agent (Peer2-codex on creepy-mini, across the world, driven via relay) joins our meet app (Angular FE, Node signaling over WS /ws, Cloudflare TURN+Calls SFU) at a STANDING room "agentroom" (id d98896162f09) where a persistent HOST is in-call + publishing. The agent join is RACY/non-deterministic: latest run showed "[signaling] send while NOT OPEN, join-ack watchdog, reconnect, page closed, no RESULT" → we never even measure audio. It has occasionally succeeded (join→KNOCK→ADMITTED) but mostly fails. We MUST make the agent join complete RELIABLY every run, then measure audio both ways.

## Relevant facts
- App has: join-ack watchdog (resend join if no ack), 15s client heartbeat (stops ~2min idle 1006/4000 drop), resume semantics (reconnectToken/clientKey), __meetDebug exposes myClientId/clientKeyHash/reconnectTokenPresent.
- Files: e2e/scripts/peer2-remote-join.mjs (agent harness, Playwright + system chrome, fake-device/ui), ws.service.ts (WS open/send/heartbeat/reconnect), room.page.ts (join ~869, ws.connect ~910, knocking ~1862).
- Agent loads https://voice.silverjrom.app/room/agentroom (CF tunnel). One prior run showed [Telegram.WebView] console events — possible wrong/odd browser context to rule out.

## codex55's proposed deterministic sequence (REVIEW THIS)
page loaded -> __meetDebug ready -> preflight complete -> ws connected -> click "Ask to join" -> myClientId -> admitted -> published -> iceConnectionState connected|completed -> measure.
- Register page.on('close'|'crash'|'pageerror') BEFORE goto (not after admit). Don't browser.close() until measure complete; if page closes early, fail with explicit page-closed-before-measure.
- Agent should NOT rely on the app join-ack watchdog as primary sync (blind clicks before WS open cause duplicate joins/reconnect churn). Wait for WS OPEN before clicking. No relying on "knocking" text alone.
- On any step timeout: ONE clean reload retry. Failure dump on exit.

## YOUR TASK (each panelist, independent)
Adversarially review this design BEFORE we implement it. Answer tight:
1. FLAWS / failure modes the sequence still misses (e.g. how to deterministically detect "ws connected" from outside the Angular app? how to know "preflight complete"? what if admit needs the host's auto-admit which races? what if the agent's heartbeat doesn't run pre-admit and it 1006-drops mid-wait? CF-tunnel WS upgrade quirks? the Telegram-webview context?).
2. The SINGLE most robust synchronization signal at each step (what exact observable — __meetDebug field, DOM state, getStats — to poll, vs racy ones to avoid).
3. Anything that should be FIXED IN THE APP (ws.service/room.page) vs the agent script.
4. Your verdict: is codex55's sequence sound to implement as-is, or what's the corrected version?
Keep it lean and specific. We converge then implement once.
