# Autonomous Ask #5 — Host-handoff: first joiner acts as host until owner arrives

> **Role for THIS dispatch:** You are the IMPLEMENTER. JROM is asleep. Claude /projcore is operating autonomously.

## Ask (verbatim from JROM)

> "make the change that when the room is open have the first user be able to join and 'act' as host until the host arrives, meaning he/can admit other users. but host can join without admittion and the host is transferred to the main host when actual host joins"

## Interpreted requirements

Given `rooms.is_open` flag (already in schema):

1. **Room owner (actual host)** = the user whose email matches `rooms.owner_email`. They bypass admission entirely on join (no knock, instant admit) and they are the host.
2. **When `is_open=true` AND owner is NOT yet in the room**: the FIRST non-owner to join becomes the **acting host**. They can admit/reject other knockers exactly like a real host.
3. **When owner joins**: owner is admitted instantly. Acting host loses host privileges (no admit, no host UI). Host role transfers to owner.
4. **If owner is NEVER in the room**: acting host stays acting host. Multiple guests can be in the room, only the acting host can admit.
5. **If acting host leaves before owner arrives**: next-in-admitted-order becomes the new acting host (transferred to whoever joined next).
6. **`is_open=false`** (closed room): only owner can admit (existing behavior unchanged).

## Read first

- `backend/src/modules/signaling/index.ts` — `admit` / `reject` / `knock` paths, `live.admitted`, `live.waiters`, `isOwnerOf()`, `broadcastToOwners()`, the `state` machine
- `backend/src/modules/rooms/index.ts` — room create + open/close + ownership
- `frontend/src/app/pages/room/room.page.ts` — `isHost` signal (~line 153?), gate for admit/reject UI
- `frontend/src/app/components/...` — anywhere `isHost` controls visibility
- Schema: `rooms.is_open INTEGER NOT NULL DEFAULT 0` (we saw this earlier)

## Plan

1. **Backend signaling state**: track `actingHostClientId` per live room. On admit success of a non-owner when no owner is admitted and `is_open=true`, set `actingHostClientId = clientId` and broadcast a new message type `{ type: 'host-role', clientId, isHost: true }` to that client.
2. **Auto-admit owner**: when owner connects to an `is_open` room (or even closed), bypass the knock state and go straight to admitted. (Verify if this is already current behavior — it should be.)
3. **Transfer on owner join**: when owner is admitted, if `actingHostClientId !== null`, broadcast `{ type: 'host-role', clientId: actingHostClientId, isHost: false }` to that client. Set `actingHostClientId = null`. Owner is the host.
4. **Acting host leaves**: on disconnect of `actingHostClientId`, pick next admitted non-owner (if any) and promote them. Broadcast accordingly.
5. **Frontend**: room.page.ts adds an `isHost` signal that combines `isOwner()` OR `actingHostFlag()`. Listen for `host-role` messages and update.
6. **Broadcast to owners (= acting host)**: ensure `broadcastToOwners` includes the acting host's WS when no actual owner is connected, so they receive knock notifications and can call admit/reject.

## Hard constraints

- Touch only: `backend/src/modules/signaling/index.ts`, `backend/src/modules/rooms/index.ts` (only if room state needs additions), `frontend/src/app/pages/room/room.page.ts` (isHost / WS receiver), and any host-gated UI component.
- Do NOT change `is_open` semantics — existing `is_open=true` should still allow knock-less join? (verify current; might need adjustment) — if `is_open` currently bypasses knock entirely for non-owners, this ask is moot. Read carefully.
- Do NOT touch layout / picker / reactions / background — separate asks already done.
- Do NOT touch BG-DEBUG instrumentation (#18).

## Acceptance gate

1. New playwright spec covers:
   - is_open room, owner NOT joined yet, guest A joins → guest A is acting host
   - Acting host A admits guest B → B is in room
   - Owner joins → owner is host, A is no longer host
   - Acting host A leaves before owner joins → next admitted promotes to acting host
2. Existing fixloop-banner + admit/reject flows PASS (count consistent with current baseline 17/17).
3. ng build PASS, backend build PASS.
4. Commit message: `feat(signaling): acting host for open rooms; transfer on owner join (Ask #5)`
5. Validation note: `validation/AUTO5-host-handoff.md`
6. Deploy: pm2 restart meet-poc-be AND meet-poc-fe.

Final line MUST be EXACTLY: `STATUS: DONE — Ask #5 ready for validation`

## Stop conditions

- If `is_open` currently auto-admits all joiners (no knock at all), the "acting host" semantic still applies for the admit-others capability but auto-admit makes admitting moot. Document and propose: "acting host can mute/kick/etc instead." If unsure, STOP and surface.
- If host-role transfer requires deep changes to the SFU client identity model, STOP — too big.
