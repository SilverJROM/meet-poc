Batch B5b — Screenshare as a separate published track over the SFU (SR-5 part 2, completes it)

You are the IMPLEMENTER (Sonnet), supervised by Claude /projcore (lkvc-38); codex validates. Branch `feat/sfu-cutover`. One atomic task, surgical. Context just cleared — re-read.

## Read first
- `plan/WK_0519/sfu-cutover/og-requirements.md` — SR-5.
- `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/context-handoff.md` — B0-B5a state (publish flow, enqueue, sfu-publish announce, tracks/close-by-mid, remotePublishers, sfuPeers/tiles).
- `frontend/src/app/services/sfu-client.service.ts` — doPublish (the publish round-trip via /api/sfu/tracks location:local + the track/mid model), doClose, enqueue.
- `frontend/src/app/pages/room/room.page.ts` — the existing screenshare button + how mesh does screenshare (getDisplayMedia), the share-layout UI, ?sfu=1 path.
- `backend/src/modules/realtime-sfu/index.ts` — /api/sfu/tracks (local), /api/sfu/renegotiate, /api/sfu/tracks/close.

## Task (SR-5 part 2) — screenshare = a SEPARATE published video track (NOT replacing the camera)
1. **Start share:** acquire the display stream (getDisplayMedia, reuse mesh's acquisition). Add it as a NEW video track/transceiver to the SFU PC → this is a NEW sender added AFTER initial negotiation, so unlike the camera toggle it REQUIRES renegotiation: publish it via `POST /api/sfu/tracks` (location:local, a new trackName with kind 'screen') and complete the CF answer/renegotiation THROUGH `enqueue` (the publish-style round-trip, not the no-reneg replaceTrack). Persist its mid in the track model. Announce via `sfu-publish` (add the screen track to the announced tracks, kind 'screen').
2. **Stop share:** stop the display track, `PUT /api/sfu/tracks/close` by the screen track's mid (via enqueue), remove it from the announced tracks (sfu-publish update), and stop sending. Camera (if on) keeps running independently — screenshare must NOT disturb the camera track.
3. **Remote render:** a remote peer subscribing sees the screen track (kind 'screen') as a distinct stream. Render it in the share layout (reuse the existing share-main/share UI where possible) so a shared screen shows up for everyone, separate from the camera tile.
4. The two video tracks (camera + screen) coexist as separate senders/trackNames — different lifecycle.

## Scope guards
- Touch: `frontend/src/app/services/sfu-client.service.ts` (publishScreen/stopScreen via enqueue + the screen track model), `frontend/src/app/pages/room/room.page.ts` (wire the screenshare button in ?sfu=1 + render remote screen in share layout), the e2e. Reuse media/getDisplayMedia. Do NOT modify mesh webrtc.service.ts. Do NOT implement simulcast (B6)/reconnect (B7).
- All PC-mutating ops (add screen sender + renegotiate, close) via enqueue.
- Do not deploy.

## Plan handshake (FIRST)
1. Read brief + files + handoff.
2. STATUS: PROPOSED — the start-share flow (add screen track → /api/sfu/tracks local → renegotiation via enqueue → announce), the stop-share flow (close-by-mid + announce removal), how the screen track stays separate from the camera, how a remote renders the screen track, and the e2e. Split if bigger than one slice.
3. WAIT for APPROVED-PLAN.

## After APPROVED-PLAN
4. Implement. 5. Test — Playwright e2e (fake media + ?sfu=1, isolated 48xx ports + /tmp DB; getDisplayMedia can be faked via launch args or a fake display source — if true screenshare capture isn't feasible headless, publish a synthetic second video track to represent the screen and assert it flows as a separate track): 2 clients connected; A starts "share" → assert B receives a SECOND distinct video track (the screen) IN ADDITION to A's camera (B sees 2 inbound video tracks, or the screen renders in share layout) ; A stops share → assert B's screen track goes away while A's camera video continues. Use robust polled assertions. 6. Frontend build + e2e green. 7. Commit on feat/sfu-cutover.

## Callbacks + status
- Callback FIRST: append `[projcore callback] B5b <STATE> <note>` to `.../callbacks.md` (PROPOSED/DONE/BLOCKED) BEFORE prose.
- End every reply with `STATUS: <PROPOSED|DONE|BLOCKED> — <reason>`.
- Write `.../B5b/changes.md` at DONE. COMMIT before STATUS: DONE.
- If headless screenshare capture is genuinely infeasible, don't spiral — propose the synthetic-second-track approach in PROPOSED and note it; or emit STATUS: BLOCKED with specifics.
