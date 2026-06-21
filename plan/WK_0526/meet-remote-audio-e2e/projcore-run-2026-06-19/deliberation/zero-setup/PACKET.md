# DELIBERATION PACKET — R10 zero-setup join + app-defaults + thin user-faithful agent (front-load, before implementation)

## JROM's requirement (R10, top-line UX)
"all the user needs to do is join the call and everything should work as expected no setup, configuration BS, except the approval to use mic/video." A user opens the room URL → grants browser mic/cam permission → EVERYTHING works (audio both ways, video, recording, transcription). ZERO other user action. No config screens, URL params, toggles, or device-setup gates blocking entry. Settings live in the APP as defaults, never user/URL-supplied.

## The two anti-patterns found in current code
1. SFU mode via URL param: the agent (and presumably any link) could carry ?sfu=0 which DISABLED the SFU media path → no audio. SFU must DEFAULT ON; no ?sfu override should be able to silently break a normal join. (Find where sfu mode is decided — meeting-sessions.service / room.page / query param — and make 'on' the unconditional default.)
2. Pre-join DEVICE GATE blocks entry: frontend/src/app/pages/room/room.page.ts:270 `preflightConfirmReady = micWorking() && speakerVerified()`. A user/agent with NO speaker device (creepy-mini) can NEVER pass speakerVerified → stuck at preflight, can't join. This is the "configuration BS" R10 forbids.

## Also: test-harness architecture (JROM)
The agent (Peer2-codex on creepy-mini) currently runs an 864-line peer2-remote-join.mjs that must be DEPLOYED to the machine (fragile base64-via-relay, keeps drifting/failing). JROM: the agent should load the call EXACTLY like a real user (plain URL, real join, real defaults) with only a THIN measurement layer. A thin inline snippet sent per-run via relay avoids the deployment-drift entirely.

## YOUR TASK (each panelist, independent, READ-ONLY — do not edit)
Read frontend/src/app/pages/room/room.page.ts (join ~869, preflight gate ~264-270, ws.connect ~910), the sfu mode source (grep sfu in frontend/src/app/services/meeting-sessions.service.ts + room.page), backend/src/modules/signaling. Then answer tight:
1. APP DEFAULTS: exactly where/how to make SFU default ON unconditionally (no ?sfu override breaking a normal join). And what other call settings (audio/codec/devices) need app-default-ization.
2. ZERO-SETUP JOIN (R10): how to make the pre-join gate NON-BLOCKING — join with just browser mic/cam permission; auto-pick devices; speaker-verification must NOT block entry (a user with no speaker still joins + works). Exact change to preflightConfirmReady / the gate.
3. THIN USER-FAITHFUL AGENT: the minimal way the agent loads the call like a real user (plain URL, real join UI, getStats measurement) — small enough to send inline per run (no fat deployed script). What's the smallest faithful agent?
4. RISKS / what could break for REAL users with these changes.
5. Your converged recommendation + the exact files/lines to change.
Keep it lean and specific. We converge once, then implement.
