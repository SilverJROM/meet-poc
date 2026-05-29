# Four JROM asks — sequence + plan request

## Asks (verbatim from JROM)

1. "fix the smiley icons to work on the other users as it only works on the host not the users"
2. "make the background draggable to reposition it or close it and just put it on setting if closed"
3. "the background and blur is working for the users but not the host" — host's local self-view shows raw camera even though SFU publishes composite (guests see blur)
4. "minimize the self camera on the call and just highlight the other videos, on 1 on 1 make the other persons camera bigger than the self camera but have a way to make it like right now that all same size just the default it the self camera is smaller"

## Important context

- BG-debug instrumentation already deployed (BG_DEBUG_ENABLED=1 in PM2 env). Endpoint `POST /api/bg-debug/log` writes to `logs/bg-debug.jsonl`. JROM hasn't hard-refreshed yet so log is empty.
- For ask #3 we know guests see blur but host doesn't. That narrows it: SFU pipeline + canvas + replaceVideoTrack all work; host's local `<video srcObject>` doesn't switch. Either `peer.stream` binding in `peers()` returns raw, or the local TileComponent's `effect()` setting `srcObject` doesn't re-run when `effectiveLocalStream` recomputes.
- Reactions: `room.page.ts` `sendReaction` calls `ws.send({type:'reaction', kind})`. Backend `signaling/index.ts:1058` broadcasts to `live.admitted` (skipping sender). Receiver adds transient reaction by `clientId`. Either backend isn't broadcasting (host id not matching admitted entry?) OR receiver renders to wrong tile.
- Picker UI: currently inline-in-lobby and overlay-in-call (wand button). JROM wants in-call overlay to be draggable + closeable with X → returns to settings/cog menu.
- Layout: in-call uses `tiles-grid` with `[attr.data-count]="peers().length"`. CSS likely uses grid-template-columns based on data-count. To minimize self + emphasize others, need (a) a separate "self" container outside the grid OR (b) a CSS rule that resizes the local peer's tile based on count.

## Asks for codex

1. Sequence the work. Pick the right order so JROM sees progress fast without blocking on each test cycle.
2. For each ask, propose a specific implementation path: files to touch, mechanism, scope guards. Don't write code yet.
3. Flag anything that requires the bg-debug logs to land first (i.e., ask #3 might be diagnosable from code alone).
4. Flag any ask that's bigger than it looks (scope risk).

Reply with: SEQUENCED LIST, PER-ASK PLAN, BLOCKER FLAGS. End with: STATUS: PLAN-AGREED.

Don't write code yet.
