Batch B6b — Subscriber layer preference (SR-6 part 2, completes it)

You are the IMPLEMENTER (Sonnet), supervised by Claude /projcore (lkvc-38); codex validates. Branch `feat/sfu-cutover`. One atomic task, surgical. Context just cleared — re-read.

## Read first
- `plan/WK_0519/sfu-cutover/og-requirements.md` — SR-6 + "Key design constraints" (subscriber prefs `preferredRid`, `priorityOrdering`, `ridNotAvailable`; verify the layer).
- `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/context-handoff.md` — B0-B6a state (doSubscribe, /api/sfu/tracks location:remote, /api/sfu/tracks/update, enqueue, isMobile detection).
- `frontend/src/app/services/sfu-client.service.ts` — doSubscribe (the remote subscribe call), enqueue.
- `backend/src/modules/realtime-sfu/index.ts` — /api/sfu/tracks (remote subscribe accepts simulcast prefs) + /api/sfu/tracks/update.
- How the app knows a peer/this client is mobile (DR-37 isMobile propagation; the mesh used `mobile` flags).

## Task (SR-6 part 2) — pick the right simulcast layer per receiver
When subscribing to a remote publisher's CAMERA track (simulcast, from B6a), request an appropriate layer; allow switching it.
1. **Layer choice:** when THIS client is mobile (small device / low capability), request the LOW layer ('l'); desktop requests HIGH ('h') (or medium as a middle default). Use the existing isMobile signal for the local client. Apply via the subscribe call's simulcast preference (`preferredRid` + `priorityOrdering` + `ridNotAvailable`) on `POST /api/sfu/tracks` (location:remote), OR via `PUT /api/sfu/tracks/update` after subscribing.
2. **Screenshare prioritized:** when a screenshare track is active in the room, the shared screen should get priority/high quality; camera layers can be deprioritized (e.g. request low camera layers while a demo screenshare is active) — this realizes JROM's "during a demo, prioritize the shared content" goal. Keep it simple: when any remote screenOn, request low camera layer; otherwise the device-based default.
3. **Switchable:** expose a way to change the layer (used by the above triggers) via /api/sfu/tracks/update through enqueue. The layer change must be serialized (enqueue) and not break the subscription.
4. Verify the selected layer is reflected (the tracks/update or subscribe response indicates the active rid, or stats).

## Scope guards
- Touch: `frontend/src/app/services/sfu-client.service.ts` (layer pref in subscribe + a setLayer/update method via enqueue + the mobile/screenshare triggers), maybe tiny room.page wiring for the screenshare-active trigger. Do NOT modify mesh webrtc.service.ts. Backend /api/sfu/tracks/update already exists (B1) — use it; don't change backend unless a field is genuinely missing (if so, flag it).
- All PC/track-mutating ops via enqueue. Must not regress B4a/B4b subscribe, B6a publish.
- Do not deploy.

## Plan handshake (FIRST)
1. Read brief + files + handoff + the simulcast-prefs design constraint.
2. STATUS: PROPOSED — how the layer preference is expressed (on subscribe vs tracks/update; the exact preferredRid/priorityOrdering/ridNotAvailable shape), the mobile→low / desktop→high rule, the screenshare-active→low-camera rule, the switch mechanism via enqueue, how you verify the chosen layer, and the test. Confirm CF's tracks/new + tracks/update accept these fields (per the API). Split if bigger than one slice.
3. WAIT for APPROVED-PLAN.

## After APPROVED-PLAN
4. Implement. 5. Test — e2e or focused (isolated ports + /tmp DB): a receiver flagged mobile (simulate isMobile, e.g. a query/launch flag the test sets) subscribes with the LOW layer preference (assert the subscribe/update request carried preferredRid:'l' or the response/stats reflect the low layer); a desktop receiver requests high; and (if feasible) a screenshare-active state makes the camera layer request go low. Plus: 2-client video still flows (no regression). Robust polled assertions. If verifying the *active* rid is not observable in headless, assert the REQUEST carried the correct preference + that switching via update doesn't break the stream, and note it. 6. Frontend build + e2e green. 7. Commit on feat/sfu-cutover.

## Callbacks + status
- Callback FIRST: append `[projcore callback] B6b <STATE> <note>` to `.../callbacks.md` (PROPOSED/DONE/BLOCKED) BEFORE prose.
- End every reply with `STATUS: <PROPOSED|DONE|BLOCKED> — <reason>`.
- Write `.../B6b/changes.md` at DONE. COMMIT before STATUS: DONE.
- If CF doesn't accept the simulcast prefs as expected, don't spiral — STATUS: BLOCKED with the exact behavior, or propose the closest working approach in PROPOSED.
