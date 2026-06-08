# opus verdict — T1 round 5

## Q1 — Ownership: SERVICE-OWNED (registry creates/owns the elements)
Service-owned wins in this zoneless/signals app:
- The current muted "kickstart" elements are ALREADY service-created and appended to `document.body` (remote-audio.service.ts:552-561) — body-appended elements live OUTSIDE Angular's view, so tile @if remount/layout churn (grid↔share-stage↔strip) does NOT drop them. Tile-owned audio would unmount with the tile on every layout change → audio drop. So service-owned is strictly more robust.
- `applySpeakerDevice`'s `querySelectorAll('video,audio')` (room.page.ts:2648) still finds body-appended elements (they ARE in the document), but the registry applies sink ITSELF atomically in addPublisher → it no longer DEPENDS on that effect's timing → kills the first-tile sink race (B9) by construction.
- Driven by the existing `syncPeers(this.peers())` effect (room.page.ts:635): syncPeers becomes addPublisher/removePublisher diff against the registry map.

## Q2 — B12 late-joiner join-order table (sticky `unlocked` flag is the fix)
| Case | Outcome | Why (file:line) |
|------|---------|-----------------|
| (a) A subscribes BEFORE host gesture | HEARD after join click | host JOIN is itself the gesture → unlockAll() plays A; until then banner (B8) shows |
| (b) B joins AFTER host gestured | HEARD immediately | sticky `unlocked=true` → addPublisher play() succeeds |
| (c) BOTH before any gesture | HEARD after join click | both elements registered+paused → banner → join gesture unlocks all |
| (d) host gestured, A joins, host never clicks again, B joins much later | **HEARD** (THE original-bug case) | sticky `unlocked` persists → B's addPublisher play() succeeds with NO new click. This is exactly what closes B12. |
| (e) background→resume then C joins | NEEDS-CLICK **with banner** | browser may drop user-activation on resume; addPublisher play() may reject → banner shows + global pointerdown/click recovery (room.page.ts:2801) replays on any interaction. NOT silent-no-banner. |
**No case yields permanent silent-no-banner** (the original failure) — because B8 makes the banner fire whenever a registered element is paused. (e) degrades to a visible "tap to enable", which is correct/honest.

## Q3 — B4 dedup-by-construction: HOLDS
Registry keyed by `publisherClientId` → exactly one audio element per publisher no matter how many tiles (grid+share-stage+strip+pip) render that peer → echo impossible. Caveats handled: screen-share is a separate VIDEO stream (remoteScreenStreams) — audio stays one element per publisher; rejoin race → addPublisher must dedup (if id already in map, replace stream on the existing element, do NOT create a second). Specify that in addPublisher.

## Q4 — 13th issue
- **CLEANUP (actionable, must-handle): registry teardown on call-end.** `reset()` (remote-audio.service.ts:444-462) currently clears mixer sources; it MUST also pause+null+remove every registry `<audio>` element and clear the map, else body-appended elements LEAK across calls (and could keep decoding). Add to reset() + the in-call→not-in-call effect (room.page.ts:666-671).
- **Rewire note (not a new bug):** `unlockAudioFromGesture` → `remoteAudio.unlockAndPlayRemoteSinks` (room.page.ts:2661) must call the registry `unlockAll()`; confirm join + interaction-recovery both route there.
- localStorage stale 1.3 volume: harmless (min(volume,1) caps), but cap the slider UI to 100% so it's not misleading.
- No new ROOT failure mechanism.

STATUS: AGREE — registry design is complete with ONE must-handle cleanup (reset()/leave must tear down all registry elements) + the unlockAll rewire. B12 fully closed for the dangerous cases (a-d) via sticky-unlock; (e) degrades to visible tap-to-enable, never silent. Dedup-by-construction holds. From my seat this is implementation-ready; flagging the reset-teardown as the last actionable item.
