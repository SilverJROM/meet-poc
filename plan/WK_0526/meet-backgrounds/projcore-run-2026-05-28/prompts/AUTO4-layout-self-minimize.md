# Autonomous Ask #4 — Minimize self camera + 1-on-1 emphasis + toggle

> **Role for THIS dispatch:** You are the IMPLEMENTER. JROM is asleep. Claude /projcore is operating autonomously.

## Ask (verbatim from JROM)

> "also try to minimize the self camera on the call and just highlight the other videos, on 1 on 1 make the other persons camera bigger than the self camera but have a way to make it like right now that all same size just the default it the self camera is smaller"

## Read first

- `frontend/src/app/pages/room/room.page.{ts,html,scss}` — `peers()` computed (~190), `tiles-grid` block (~236), data-count attr
- `frontend/src/app/components/tile/tile.component.{ts,html,scss}` — variant input + tile rendering
- `e2e/tests/v3-mb3-call-layout/controls-and-grid.spec.ts` — existing layout coverage that may need updating
- `frontend/src/app/components/controls-bar/controls-bar.component.{ts,html}` — where the toggle UI goes

## Required behaviors

1. **Default layout**: in-call non-share view emphasizes REMOTE peers. Self tile is smaller (e.g., picture-in-picture style overlay in a corner, OR last in a row at reduced size).
2. **1-on-1 case** (1 remote peer): remote peer's tile is the dominant large view. Self appears as a smaller corner overlay (PiP-style).
3. **3+ participants**: remote peers fill the main grid evenly. Self is the smaller overlay/last-position tile.
4. **Toggle to restore current behavior**: a switch (probably in the settings/cog popover) that says "Equal-size tiles" — when enabled, falls back to the existing equal-grid layout for all peers (current behavior).
5. **Preference persists** in localStorage so user's choice survives reload.

## Mechanism choices (you decide)

Option A: CSS-only — add a class to `tiles-grid` like `emphasize-remote` and a special class to the local tile when in that mode. Use grid template areas or grid-area positioning to place local tile as overlay/smaller.

Option B: Template-level — split `peers()` into `remotePeers` + `localPeer` and render them in separate containers (PiP-style overlay for local). Switch container based on toggle.

Option B is cleaner and more flexible for the 1-on-1 case but riskier (changes existing structure). Option A is safer but may be harder to style for 1-on-1.

Recommend A if it can achieve 1-on-1 emphasis with reasonable CSS. Recommend B otherwise.

## Hard constraints

- Touch only: `room.page.{ts,html,scss}`, `tile.component.{ts,html,scss}` (if variant needs tweaking), `controls-bar.component.{ts,html,scss}` (toggle UI), localStorage helper.
- Do NOT touch screen-share layout (`share-stage`, `share-strip`) — that's outside this ask.
- Do NOT touch SFU / streams / backend.
- Do NOT touch background picker (Ask #2 done).
- Do NOT touch reactions (Ask #3 done).
- Do NOT touch BG-DEBUG instrumentation (#18).
- Existing `controls-and-grid.spec.ts` is allowed to be UPDATED to match new default behavior, BUT you must also retain coverage that toggling to "Equal-size tiles" restores the old behavior.

## Acceptance gate

1. New playwright spec(s) cover:
   - Default 1-on-1: local tile is visibly smaller than remote
   - Default 3+ participants: local tile is smaller than other peers
   - Toggle "Equal-size tiles" ON → all tiles equal (matches old behavior)
   - Preference persists across reload
2. Updated `controls-and-grid.spec.ts` if its assumptions changed (allowed — document why).
3. fixloop-banner PASS at the current count (17/17 was the baseline after Ask #3).
4. ng build PASS.
5. Commit message: `feat(layout): emphasize remote peers; self as smaller overlay + equal-size toggle (Ask #4)`
6. Validation note: `validation/AUTO4-layout-self-minimize.md`
7. Deploy: pm2 restart meet-poc-fe.

Final line MUST be EXACTLY: `STATUS: DONE — Ask #4 ready for validation`

## Stop conditions

- If touching the layout breaks `share-stage` / `share-strip` mode (screen share), STOP and report.
- If responsive CSS at mobile breakpoints requires fundamental restructure, document and stop at desktop coverage only (mobile can be a follow-up).
- If the toggle integration requires changes to deep state management beyond a single signal + localStorage, STOP and report scope.
