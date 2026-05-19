# context-handoff.md — meet-poc v2 Run 1

---

## Pre-B6 handoff (post-B5 PASS)

**HEAD:** `feat/meet-v2-b5-lobby-preview` (`fb6b341 docs: append v2 batch 5 callback`)
**Branch for B6:** `feat/meet-v2-b6-grid-overlays-clock` — off B5 HEAD.

**Post-B5 state:**
- Backend: stable. 16 vitest / 42 tests green.
- Frontend: app shell + 4 real tabs + lobby device preview all live. MediaDevices plumbing complete.
- Existing call-UI surface (the thing in JROM's screenshot complaint):
  - `pages/room/room.page.html` lines 56-60: `<div class="tiles-grid" aria-label="Participants">` rendering `<app-tile [peer]="peer" />` for each peer
  - `pages/room/room.page.scss` line 72-77: `.tiles-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; padding: 16px; }` — **this is the bug**: with 1 peer, the single tile stretches full-width via `auto-fit` and the `aspect-ratio: 16/9` (in tile component) makes the letterbox look wrong
  - `<app-tile>` currently renders: video element + name label corner + LOCAL/state corner. No mute icon, no camera-off avatar, no host badge.
  - Controls bar shows Mute/Unmute/Camera/Screen/Record/Leave as text-flipping buttons.
  - No meeting clock anywhere.

**WS protocol available (post-B2):** all v2 messages live. **B6 introduces ONE new message:** `media-state {clientId, mic, cam}` — clients broadcast their own mic/cam state changes.

**What B6 must produce — closes JROM's #2 screenshot complaint:**

- **`pages/room/room.page.scss`** — replace the broken `auto-fit minmax` grid with **count-driven dynamic grid**:
  - `<main class="tiles-grid" [attr.data-count]="peers().length">` (already has the binding scaffold ready)
  - CSS: `.tiles-grid[data-count="1"] { grid-template-columns: minmax(0, 720px); justify-content: center; }` — single tile centered, capped width
  - `.tiles-grid[data-count="2"] { grid-template-columns: 1fr 1fr; }`
  - `.tiles-grid[data-count="3"], .tiles-grid[data-count="4"] { grid-template-columns: 1fr 1fr; grid-auto-rows: 1fr; }` — 2x2
  - `.tiles-grid[data-count="5"], ..., [data-count="9"] { grid-template-columns: 1fr 1fr 1fr; }` — 3x3
  - `.tiles-grid[data-count^="1"]:not([data-count="1"]) { ... }` OR a fallback rule for 10+ (won't happen at 8-cap but document) — scrollable 3-column
  - Centered max-width container (~1400px) at outer level + responsive media queries (one breakpoint for <1024 → 2 cols max, one for <640 → 1 col stack)

- **`<app-tile>` per-tile overlays** (R6.2):
  - **Muted icon overlay**: render a small mic-off icon in the bottom-right when `peer.micEnabled === false`. Use Ionicons (mic-off or similar). Position via absolute + corner padding.
  - **Camera-off avatar**: when `peer.camEnabled === false` (NOT just an absent video track — explicit state), render the tile content as a centered circle with peer name's first letter (uppercase). Background color hash-derived from name (e.g. `hash(name) % 360` for HSL hue, fixed saturation/lightness for dark-theme readability). Hide the `<video>` element.
  - **Host badge**: render "HOST" pill in the bottom-left ONLY if the peer is the host. The peer object needs an `isHost: boolean` field — derive from `peer.id === hostClientId()` signal in `room.page.ts`.

- **`media-state` broadcast** (R6.3):
  - Backend `signaling/index.ts` extension: handle `{type:'media-state', mic, cam}` from any admitted peer; relay to all OTHER admitted peers as `{type:'media-state', clientId, mic, cam}`.
  - Frontend `MediaService` extensions: on `toggleMic()` / `toggleCamera()` / camera-off-during-call → broadcast new state via `WsService.send({type:'media-state', mic:bool, cam:bool})`.
  - Frontend `WebrtcService` or `room.page.ts`: subscribe to incoming `media-state` events and update the relevant peer's `micEnabled` / `camEnabled` signals.
  - Local peer's own tile updates from local signals (no round-trip).
  - This is the SAME pattern as legacy state-flip; just made explicit via signaling instead of inferred from track-enabled state (which doesn't propagate over RTP reliably).

- **Meeting clock** (R6.4):
  - Add a topbar element above the controls-bar (or inside it): `<span class="meeting-clock">{{ elapsed() }}</span>`
  - `room.page.ts`: when entering `in-call` state, start a `setInterval(1000)` that updates an `elapsedSec` signal. Format: `M:SS` under 60min, `H:MM:SS` over.
  - Cleanup interval when leaving / state changes.

- **Centered max-width container** (R6.5):
  - Wrap `tiles-grid` in a centered max-width container (~1400px) at the call-panel level. Smaller viewports (mobile prep for Run 3) cap at 100% with padding.

**Tests** `e2e/tests/v2-b6-grid/`:
- `grid-1-peer.spec.ts` (S6.1): owner alone in call, tile clientWidth <= 720, horizontally centered
- `grid-2-peer.spec.ts` (S6.2): two-context — owner + admitted guest, two tiles side-by-side
- `mute-icon.spec.ts` (S6.3): two-context — guest mutes, owner's view of guest's tile shows mute icon within 2s
- `camera-off-avatar.spec.ts` (S6.4): two-context — guest camera off, owner's view shows initials avatar on guest tile
- `host-badge.spec.ts` (S6.5): two-context — owner sees "HOST" pill on own tile, no badge on guest tile
- `meeting-clock.spec.ts` (S6.6): owner enters call, clock shows `0:00`, after 2s shows `0:02` (±1s)

**Standing flags:**
- Commit BEFORE STATUS: DONE
- §1.15 decisions for: avatar color hash function, exact grid breakpoints, clock format edge cases (>9:59:59?)
- §2.10 real DOM + real two-context
- Hygiene: tests clean up rooms/sessions

**Decisions locked:**
- Dynamic grid via `data-count` attribute selector (not Angular structural directive)
- Mute icon visible when peer.micEnabled=false (signal-driven)
- Camera-off renders avatar (NOT black video element)
- Host badge derived from `hostClientId` (added in B6)
- Clock starts at in-call state entry; resets on reconnect (acceptable drift)

**Live service:** PM2 NODE_ENV=production. Rebuild + restart meet-poc-fe (FE) + tsx-watch handles BE.

**Active callback target:** `plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/callbacks.md` + `progress.md`.
