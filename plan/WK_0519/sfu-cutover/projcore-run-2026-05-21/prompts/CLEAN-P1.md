Clean-P1: SFU-only presentation layer (reuse 90%, rewrite the entangled ~10%)

You are the IMPLEMENTER (Sonnet), supervised by Claude /projcore (lkvc-38). Branch `feat/sfu-clean` (already checked out, = working B10 state). GOAL: a CLEAN SFU-ONLY app by REUSING the validated mesh-independent code and rewriting ONLY the mesh-entangled presentation layer. This is the token-conservative alternative to surgically gutting the mesh (which kept breaking the in-call flow). Write the SFU-only version fresh so there's NO dual-path logic to mangle.

## Key context (why this approach)
A prior surgical mesh-removal broke the join→in-call transition (stuck at 'connecting') because mesh+SFU were intertwined and stripping mesh guards in-place mangled the transition. Writing the presentation layer SFU-ONLY from the start avoids that — there is only ONE media path (SFU).

## REUSE AS-IS (do NOT modify, do NOT re-validate — import unchanged):
- ALL backend (signaling, realtime-sfu proxy, sessions, auth, rooms, ice-config, recording, questions, llm).
- Frontend services: `sfu-client.service.ts` (the validated SFU engine: publish/subscribe/reconnect/diagnostics/op-queue), media.service, ice-config.service, ws.service, meeting-sessions.service, rooms.service, auth.service, recorder/recordings.service, questions.service, active-speaker.service, remote-audio.service, viewport.service, platform.service.
- Lobby/admit/chat/host/diagnostics components + pages.

## REWRITE SFU-ONLY (the entangled files — only these 3 import the mesh webrtc.service):
- `frontend/src/app/pages/room/room.page.ts` + `room.page.html` — produce the SFU-ONLY version: ONE media path via `sfuClient`. Keep ALL the non-mesh wiring (admit/waiting-room, chat, host controls, lobby, media toggles via sfuClient, screenshare, reconnect, diagnostics, device handling). REMOVE: the `isSfuMode` gate, the mesh `webrtc.service` usage, mesh signal handling, the `?sfu=0` branch. CRITICAL: the admitted→in-call transition must work (it broke before) — the smoke test below must pass.
- `frontend/src/app/components/participant-sidebar/participant-sidebar.component.ts` + `frontend/src/app/components/tile/tile.component.ts` — drop the mesh `webrtc.service`/mesh-PeerState coupling; bind to SFU peers/streams (sfuPeers/remoteStreams).

## DELETE (now unimported):
- `webrtc.service.ts`, `webrtc-diagnostics.ts`, `webrtc-video-policy.ts` (+ their .spec.ts).

## Scope guards
- Touch ONLY the 3 rewritten files + the 3 deletions (+ minor wiring if a reused service exposed a mesh-only method — flag it). Do NOT modify the reused services/backend. Do NOT touch e2e specs in this batch (B10 already pointed them; we validate in P2).
- The roster/identity (peer list with names/participantId/mic/cam/screen/reconnecting + dedup/no-ghost) currently lives in webrtc.service — you must preserve that capability: either keep a SLIM roster (move the identity-roster logic into a small service or into the SFU client) OR have room.page derive the roster from SFU presence. Propose which in PROPOSED. The no-ghost identity dedup MUST survive.

## Plan handshake (FIRST — one round, token-aware)
1. Read brief + the 3 entangled files + sfu-client.service + context-handoff.md.
2. STATUS: PROPOSED — concise: where the identity roster goes (slim service vs SFU client vs room.page-derived), the SFU-only room.page structure (how admitted→in-call transition is set, how toggles/screenshare/reconnect wire to sfuClient), the 2 component rewrites, the deletions, and confirm what's reused-unchanged. Keep it tight.
3. WAIT for APPROVED-PLAN (projcore validates in-process — 2-agent, token-conservative).

## After APPROVED-PLAN
4. Implement. 5. SELF-CHECK before DONE: `npm run build -w frontend` PASS (no TS errors, no dangling mesh imports — grep to confirm webrtc.service is gone). 6. Commit on feat/sfu-clean. (projcore runs the 2-client SFU smoke at the gate — you don't need the full e2e here; that's P2.)

## Callbacks + status
- Callback FIRST: append `[projcore callback] CLEAN-P1 <STATE> <note>` to `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/callbacks.md` BEFORE prose.
- End every reply with `STATUS: <PROPOSED|DONE|BLOCKED> — <reason>`.
- COMMIT before STATUS: DONE. Write `.../CLEAN-P1/changes.md` (files rewritten/deleted/reused).
- DO NOT spiral: if you hit a wall, STATUS: BLOCKED with the specific issue. A prior attempt burned an hour in a verification loop — once it builds + you've confirmed no mesh imports, commit and report DONE; projcore runs the smoke.
