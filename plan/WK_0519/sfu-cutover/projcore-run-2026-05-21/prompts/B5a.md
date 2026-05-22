Batch B5a — Mic/cam toggles over the SFU (SR-5 part 1)

You are the IMPLEMENTER (Sonnet), supervised by Claude /projcore (lkvc-38); codex validates. Branch `feat/sfu-cutover`. One atomic task, surgical. Context just cleared — re-read.

## Read first
- `plan/WK_0519/sfu-cutover/og-requirements.md` — SR-5.
- `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/context-handoff.md` — B0-B4b state (SfuClientService shape: audioSender/videoSender stored, enqueue, remotePublishers, media-state).
- `frontend/src/app/services/sfu-client.service.ts`, `frontend/src/app/pages/room/room.page.ts` — the ?sfu=1 path, the existing mic/cam toggle buttons + how mesh handles them, the existing ws `media-state` message.
- `backend/src/modules/signaling/index.ts` — the existing `media-state` broadcast (mic/cam/screenOn).

## Task (SR-5 part 1) — local mic + camera toggles work over the SFU
In the ?sfu=1 path, the mic mute/unmute and camera on/off buttons must control the published SFU tracks and reflect on remote tiles:
1. **Mic toggle:** enable/disable the published audio track (`audioSender.track.enabled = !muted`, or replaceTrack as appropriate). No renegotiation (the audio m-line is already negotiated).
2. **Camera toggle:** turn camera off → stop sending video (e.g. `videoSender.replaceTrack(null)` or disable the track); turn camera on → acquire/`replaceTrack(videoTrack)` onto the pre-negotiated video sender (B2 ensured the sender always exists, so NO renegotiation needed). Reuse the existing media acquisition (media.service) where possible.
3. **Announce state:** reuse the existing ws `media-state` message so remotes know mic/cam state (the roster/tile shows muted/cam-off). If the SFU path needs the local mic/cam state reflected on the LOCAL tile too, wire that.
4. **Remote reflection:** a remote peer toggling cam off → its tile shows camera-off (no video) on the others; mic mute → muted indicator. (Video simply stops arriving when the sender track is null/disabled.)

Keep host controls (mute-target/remove/end) working as ws commands as they already are; the SFU track-close on remove reuses B4b's teardown path — do NOT rebuild teardown here. Focus B5a on the LOCAL mic/cam toggle mechanics + state announce.

## Scope guards
- Touch: `frontend/src/app/services/sfu-client.service.ts` (toggle methods on the stored senders), `frontend/src/app/pages/room/room.page.ts` (wire the existing toggle buttons to the SFU client in the ?sfu=1 path), the e2e. Possibly tiny media.service reuse. Do NOT modify mesh webrtc.service.ts. Do NOT implement screenshare (B5b), simulcast (B6), reconnect (B7).
- Any PC-mutating op via enqueue (replaceTrack on a sender does NOT renegotiate, so it's light — but keep ordering safe).
- Do not deploy.

## Plan handshake (FIRST)
1. Read brief + files + handoff.
2. STATUS: PROPOSED — the mic toggle mechanism, the cam on/off mechanism (replaceTrack on the pre-negotiated sender, no renegotiation), the media-state announce reuse, local+remote tile reflection, and the e2e. Split if bigger than one slice.
3. WAIT for APPROVED-PLAN.

## After APPROVED-PLAN
4. Implement. 5. Test — Playwright e2e (fake media + ?sfu=1, isolated 48xx ports + /tmp DB): 2 clients connected (per B4a); client B toggles CAMERA OFF → assert A stops receiving B's video (inbound video framesDecoded stops advancing / track ended) and/or B's tile shows cam-off; B toggles camera back ON → A receives video again; B MUTES mic → A sees B muted (media-state) ; assert no renegotiation errors. Keep it focused + robust (poll with timeout — avoid the flaky one-shot assertions that caused trouble before). 6. Frontend build + e2e green. 7. Commit on feat/sfu-cutover.

## Callbacks + status
- Callback FIRST: append `[projcore callback] B5a <STATE> <note>` to `.../callbacks.md` (PROPOSED/DONE/BLOCKED) BEFORE prose.
- End every reply with `STATUS: <PROPOSED|DONE|BLOCKED> — <reason>`.
- Write `.../B5a/changes.md` at DONE. COMMIT before STATUS: DONE.
- If you hit a hard problem, do NOT spiral into long analysis — after a focused attempt, emit STATUS: BLOCKED with the specific blocker and projcore will help.
