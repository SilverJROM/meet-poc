# Batch-SS: Screen-share infinite-mirror fix (R7)

## Root cause
`room.page.ts` `shareStream` computed returned `this.media.screenStream()` (the local
presenter's own live screen capture) whenever the LOCAL peer was sharing. When the shared
surface included the call tab itself, that self-view fed back into itself — the "infinite
mirror" JROM reported. The main share-stage template then rendered that stream through
`<app-tile forceVideo="true">`, which falls back to `peer().stream` (the camera stream) even
if `displayStream` were merely nulled — so the fix requires both a data-layer change AND a
template branch, not just one.

## Fix
1. **`frontend/src/app/pages/room/room.page.ts`**
   - `shareStream` computed: local-peer branch now returns `null` instead of
     `this.media.screenStream()`. Remote branch (`remoteScreenStreams().get(peer.id)`) is
     byte-for-byte unchanged.
   - Registered `desktopOutline` icon (same glyph already used by the controls-bar "Share
     screen" button) for the new placeholder.

2. **`frontend/src/app/pages/room/room.page.html`** (share-stage block)
   - Branches on `presenter.isLocal`:
     - **local** → new `.presenting-placeholder` (desktop icon + "You're presenting" text).
       No `<app-tile>` / `<video>` is rendered at all for the local presenter's own share.
     - **remote (else)** → unchanged `<app-tile [displayStream]="shareStream()">` path.
   - `share-strip` (participant strip) and camera/self-PIP tiles are untouched.

3. **`frontend/src/app/pages/room/room.page.scss`**
   - Added `.presenting-placeholder` rules reusing the existing dark-panel palette (same
     rgba tones as `.share-strip` / `.screen-share-help`) — no new design tokens.

## Scope discipline
- Did NOT touch: SFU publish path, `remoteScreenStreams`, camera/self-PIP tile logic, or any
  R1–R6 recovery code. `shareStream()` had exactly one call site (verified via repo-wide
  grep) before this change.
- The presenter's own share-stage tile previously carried raised-hand/reaction/mic-muted
  overlays; the placeholder drops those for self (Meet does the same — controls-bar already
  surfaces mic/hand state, so nothing is lost).

## Test/fixture changes (see review.md for the full rationale)
- New: `e2e/tests/batch-ss-presenting-placeholder/presenting-placeholder.spec.ts` — the R7
  acceptance spec (R7a/R7b/R7c), with screenshots.
- Assertion swaps (the 4 specs flagged in the plan handshake) in:
  `v3-fixc3-share-reflow/share-reflow.spec.ts`, `v3-mui-meet-ui/meet-ui.spec.ts`,
  `v3-share-camera-cut/share-camera-cut.spec.ts`, `v3-tilefix/tilefix.spec.ts` — each now
  asserts `.presenting-placeholder` visible / `app-tile` count 0 in the local presenter's own
  share-stage, instead of the old (bug-encoding) self-view assertion.
- **Out-of-scope fixture repairs**, needed only to get ANY of the above to execute at all
  (three separate, pre-existing, unrelated defects discovered while running this suite for
  the first time in a while — see review.md for full detail and stash-verified proof each
  predates this batch):
  - `e2e/fixtures/auth.ts`: `getByRole('button', {name:'Sign in'})` → `{exact:true}` (a
    Telegram login button added in a prior week's commit made the login button locator
    ambiguous for every spec that logs in).
  - `e2e/fixtures/rooms.ts`: `createRoomFromDashboard` now opens the row's overflow menu and
    flips the `.mini-toggle` — the inline "Open" button it used to click no longer exists in
    the current rooms-dashboard UI.
  - `admitWaiting`/`admit`/`admitBrowserGuest` helpers in 4 specs (share-reflow, meet-ui,
    share-camera-cut, tilefix): admit directly from the `.knock-toast` (top-right) instead of
    opening the participant sidebar — the toast stack visually overlaps the "Show
    participants" corner button and blocks the click.
  - `tilefix.spec.ts`: `getByLabel('Start with camera on')` → `getByLabel('Camera off')` +
    `{force:true}` — the pre-join checkbox's accessible name is derived from its live label
    text ("Camera on"/"Camera off"), not a static string; the checkbox itself is visually
    covered by its own label span (same reason `share-camera-cut.spec.ts` already used
    `{force:true}` on the equivalent control).

## Known blockers (NOT fixed — explicitly out of scope for R7, see review.md)
- `share-camera-cut.spec.ts` (DR-53): references `window.__meetDebug.senderSnapshot`, a debug
  hook that no longer exists anywhere in the codebase (removed at some point after the SFU
  cutover). Fixing this would mean adding new instrumentation to `sfu-client.service.ts`,
  which the brief explicitly puts out of scope ("Do NOT change: the SFU publish path...").
  My assertion swap is present and correct; the test cannot reach it because it fails earlier
  on this dead hook, unrelated to my diff.
- `tilefix.spec.ts` (DR-30): fails at `expectMirrored(localVideo, ...)` — the local camera
  self-view tile is expected to be CSS-mirrored but isn't, for reasons entirely inside
  `effectiveLocalStream()` / `isMirroredSelfView` (tile.component.ts), which the brief
  explicitly puts out of scope ("Do NOT change: ...the camera/self-PIP tiles"). My assertion
  swap is present and correct; the test cannot reach it because it fails on this earlier,
  unrelated line.
