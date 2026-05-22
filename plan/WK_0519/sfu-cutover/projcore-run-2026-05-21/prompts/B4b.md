Batch B4b — Late join + live publisher updates + unsubscribe on leave (SR-4, completes it)

You are the IMPLEMENTER (Sonnet), supervised by Claude /projcore (lkvc-38); codex validates. Branch `feat/sfu-cutover`. One atomic task, surgical. Context just cleared — re-read.

## Read first
- `plan/WK_0519/sfu-cutover/og-requirements.md` — SR-4.
- `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/context-handoff.md` — what B0-B4a delivered (READ — has the exact subscribe/roster/ontrack shape).
- `frontend/src/app/services/sfu-client.service.ts` (B4a): `subscribeIfNeeded`, `doSubscribe`, `remotePublishers`, `remoteStreams`, `subscribedTracks`, `subscribedClientIds`, `enqueue`.
- `frontend/src/app/pages/room/room.page.ts` (B4a): the subscription effect, `sfuPeers`, isSfuMode.

## Task (SR-4, completes it) — full roster reactivity
B4a subscribes to one already-present publisher. B4b makes subscription fully reactive to the roster:
1. **Late join:** a client joining a room with EXISTING publishers subscribes to ALL of them (the sfu-roster snapshot from B3). The subscription effect must iterate all `remotePublishers`, not just one.
2. **Live new publisher:** when a NEW publisher appears (sfu-presence after join), subscribe to it live (already partially handled by subscribeIfNeeded's guard — ensure the effect reacts to roster additions).
3. **Unsubscribe on remote leave:** when a publisher leaves (peer-left → removePeer removes it from `remotePublishers`), TEAR DOWN that subscription: close the subscribed tracks for that publisher via `PUT /api/sfu/tracks/close` (by the subscribed mids — through `enqueue`), remove its entry from `remoteStreams`/`subscribedTracks`/`subscribedClientIds`/`midToEntry`, and remove its tile. No ghost tiles, no leaked subscriptions.
4. **Revision-driven correctness:** rely on B3's roster revision so stale presence doesn't resurrect a left publisher or cause duplicate subscribes.

## Scope guards
- Touch: `frontend/src/app/services/sfu-client.service.ts` (the iterate-all + unsubscribe logic), `frontend/src/app/pages/room/room.page.ts` (effect reacts to full roster + removal), the e2e. Do NOT modify mesh webrtc.service.ts or the backend. Do NOT implement toggles/screenshare/simulcast/reconnect.
- All PC-mutating ops (subscribe AND unsubscribe/close) go through `enqueue`.
- Do not deploy.

## Plan handshake (FIRST)
1. Read brief + files + handoff.
2. STATUS: PROPOSED — how the effect iterates the full roster + reacts to additions/removals, the unsubscribe/close-by-mid teardown (through enqueue), the state cleanup, and the e2e. Split if bigger than one tight slice.
3. WAIT for APPROVED-PLAN.

## After APPROVED-PLAN
4. Implement. 5. Test — Playwright e2e (fake media + ?sfu=1, isolated 48xx ports + /tmp DB), THREE-client flow: client A + B in a call (each sees the other, per B4a); a THIRD client C joins LATE → assert C receives A's and B's audio+video (inbound packetsReceived>0 + framesDecoded>0 for both), AND A/B receive C; then C LEAVES → assert A and B drop C's tile + stop receiving C (the subscription is torn down — C no longer in sfuPeers/remoteStreams). Reuse the B4a e2e pattern. (If a 3-client harness is heavy, at minimum: 2 clients where the 2nd joins late and is seen by the 1st, then leaves and its tile clears — but prefer the 3-client proof.) 6. Frontend build + e2e green. 7. Commit on feat/sfu-cutover.

## Callbacks + status
- Callback FIRST: append `[projcore callback] B4b <STATE> <note>` to `.../callbacks.md` (PROPOSED/DONE/BLOCKED) BEFORE prose.
- End every reply with `STATUS: <PROPOSED|DONE|BLOCKED> — <reason>`.
- Write `.../B4b/changes.md` at DONE. COMMIT before STATUS: DONE.
