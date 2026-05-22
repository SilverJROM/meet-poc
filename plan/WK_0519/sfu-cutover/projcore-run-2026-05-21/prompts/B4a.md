Batch B4a — Subscribe to ONE remote publisher + render the tile (SR-4, core proof)

You are the IMPLEMENTER (Sonnet) for the meet-poc SFU cutover, supervised by Claude /projcore (lkvc-38); codex validates. Branch `feat/sfu-cutover`. One atomic task, surgical, in-scope. Context just cleared — re-read what you need.

## Read first
- `plan/WK_0519/sfu-cutover/og-requirements.md` — SR-4 + the "Key design constraints" (operation queue, mid persistence, renegotiation serialization).
- `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/context-handoff.md` — what B0-B3 delivered (READ — has the exact SfuClientService shape, /api/sfu routes, ws messages, remotePublishers roster).
- `frontend/src/app/services/sfu-client.service.ts` (B2/B3): the PC, `enqueue()` op queue, `localPublishState`, `remotePublishers` signal, `__meetDebug` hooks.
- `backend/src/modules/realtime-sfu/index.ts` (B1): `POST /api/sfu/tracks` (supports `location:'remote'`), `PUT /api/sfu/renegotiate`.
- `frontend/src/app/pages/room/room.page.ts`: the ?sfu=1 branch + how tiles are rendered (peer tiles); how the SFU stream would bind to a tile.

## Task (SR-4, this batch = ONE remote publisher, the core round-trip)
When a remote publisher appears in `remotePublishers`, subscribe to its tracks through the SFU and render its audio+video.

1. **Subscribe flow (THROUGH the `enqueue()` op queue — mandatory):** for a remote publisher's tracks, call `POST /api/sfu/tracks` with `location:'remote'` + `{ sessionId: <theirCfSessionId>, trackName }` for each track (on the LOCAL client's own cfSession). Cloudflare responds with `requiresImmediateRenegotiation: true` + an offer SDP. Then: `setRemoteDescription(offer)` → `createAnswer` → `setLocalDescription(answer)` → `PUT /api/sfu/renegotiate` with the answer. All of this serialized via `enqueue()` so it can't collide with publish/other ops.
2. **Render:** the subscribed tracks arrive via `pc.ontrack`. Map each remote track back to its publisher (use the trackName / mid → publisher mapping; track the subscribed `{publisherClientId, trackName, kind, mid}`). Build a per-publisher MediaStream and render it in that publisher's tile (audio plays, video shows) in the ?sfu=1 path. Reuse existing tile rendering where possible; do NOT rebuild the tile component.
3. **Trigger:** subscribe when a publisher is added to the roster (for B4a, subscribing to ONE already-present remote publisher is sufficient — full late-join/live-update/unsubscribe is B4b). Don't subscribe to your own session.
4. Persist the subscribed-track model (publisher → tracks → mid) for B4b/B7 cleanup.

## Scope guards
- Touch: `frontend/src/app/services/sfu-client.service.ts` (subscribe + ontrack + subscribed-track model), `frontend/src/app/pages/room/room.page.ts` (bind SFU remote streams to tiles, behind ?sfu=1), the e2e. Do NOT modify mesh webrtc.service.ts. Do NOT touch backend (B1 done). Do NOT implement late-join/unsubscribe/toggles/simulcast (later).
- Subscribe MUST go through the existing `enqueue()` queue (no parallel negotiation).
- Do not deploy (projcore gates).

## Plan handshake (FIRST)
1. Read brief + files + context-handoff.
2. STATUS: PROPOSED — the subscribe sequence (endpoints + the renegotiation offer/answer direction, all via enqueue), the trackName/mid → publisher mapping, how the remote MediaStream binds to the tile in the ?sfu=1 path, the subscribed-track model, and the e2e. Propose a split if bigger than one tight slice.
3. WAIT for APPROVED-PLAN.

## After APPROVED-PLAN
4. Implement. 5. Test — Playwright e2e (fake media + ?sfu=1, isolated 48xx ports + /tmp DB), THE CORE PROOF: two clients join the same room (both publish per B2/B3); assert that EACH client RECEIVES the other through the SFU — inbound-rtp AUDIO packetsReceived > 0 AND inbound-rtp VIDEO framesDecoded > 0 (via getStats, exposed through __meetDebug). Reuse the F2/B2 real-WebRTC-in-Chromium pattern. This proves cross-peer media flows through Cloudflare. 6. Frontend build + e2e green. 7. Commit on feat/sfu-cutover.

## Callbacks + status
- Callback FIRST: append `[projcore callback] B4a <STATE> <note>` to `.../callbacks.md` (PROPOSED/DONE/BLOCKED) BEFORE prose.
- End every reply with `STATUS: <PROPOSED|DONE|BLOCKED> — <reason>`.
- Write `.../B4a/changes.md` at DONE. COMMIT before STATUS: DONE.
