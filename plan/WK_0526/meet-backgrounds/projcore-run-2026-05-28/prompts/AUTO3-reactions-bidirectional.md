# Autonomous Ask #3 — Smiley reactions bidirectional (host ↔ guests)

> **Role for THIS dispatch:** You are the IMPLEMENTER. JROM is asleep. Claude /projcore is operating autonomously.

## Ask (verbatim from JROM)

> "fix the smiley icons to work on the other users as it only works on the host not the users"

## Read first

- `backend/src/modules/signaling/index.ts` line ~1058 — `reaction` message handler + broadcast loop
- `frontend/src/app/pages/room/room.page.ts` — `sendReaction()` (~line 860), receiver branch (~line 1385), `transientReactions` signal, `tileReactions(clientId)` getter
- `frontend/src/app/components/controls-bar/controls-bar.component.{ts,html}` — reaction popover + `(reaction)` output
- `frontend/src/app/components/tile/tile.component.{ts,html}` — `reactions` input + render
- `e2e/tests/v3-fixc3-share-reflow/...` and any existing reaction spec — find current coverage; likely guest-to-host biased

## Diagnose first, then fix

Run a focused playwright spec with 2 browsers: host opens room, guest joins+admitted, host clicks 👍 → assert it appears on the host's tile in the GUEST's view; then guest clicks 👏 → assert it appears on the guest's tile in the HOST's view. If either direction fails, you have a real reproduction.

The likely failure modes:
1. Backend broadcasts to `live.admitted` skipping sender — if host is NOT in `live.admitted` (tracked as owner separately), host's reactions broadcast correctly. If host IS in admitted, guests should receive too. Verify by inspecting the live structure.
2. Receiver branch in `room.page.ts` line ~1385 maps `msg.clientId` to the visible tile via `tileReactions(clientId)` filter. If host's outgoing reaction's clientId doesn't match host's `peer.id` in guests' `peers()` map, the tile won't render it. The `peerIdentities` map / SFU client identity mapping may key by participantId vs clientId.
3. The sender's clientId on the WS connection (from `signaling` handler) may differ from the host's `myId` signal on the frontend. If so, on RECEIVER side, the message's `clientId` (= sender's WS client id) won't match the tile's `peer.id` (= mapped via identity).

## Plan

1. **Reproduce both directions** with a new playwright spec.
2. **Fix mechanism-level** based on actual failure mode — patch backend OR receiver mapping (whichever is wrong).
3. **Test passes both directions.**

## Hard constraints

- Touch only: `backend/src/modules/signaling/index.ts`, `frontend/src/app/pages/room/room.page.ts`, and only if necessary `tile.component.*`. Do NOT change media / SFU / streams.
- Do NOT touch background picker (Ask #2 done).
- Do NOT touch layout (Ask #4).
- Do NOT touch host-handoff (Ask #5).
- Do NOT touch BG-DEBUG instrumentation (task #18).

## Acceptance gate

1. New playwright spec covers host→guest AND guest→host reactions.
2. fixloop-banner 16/16 PASS.
3. Existing background + picker specs PASS.
4. Backend build PASS, ng build PASS.
5. Commit message: `fix(reactions): broadcast + render bidirectionally between host and guests (Ask #3)`
6. Validation note: `validation/AUTO3-reactions-bidirectional.md`
7. Deploy: pm2 restart meet-poc-be AND meet-poc-fe.

Final line MUST be EXACTLY: `STATUS: DONE — Ask #3 ready for validation`

## Stop conditions

- If the fix requires changing the identity/client-id model across the WS protocol (not just the reaction path), STOP and report — that's a bigger change than this ask.
