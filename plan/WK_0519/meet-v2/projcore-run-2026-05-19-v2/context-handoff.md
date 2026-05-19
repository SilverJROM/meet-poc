# context-handoff.md — meet-poc v2 Run 1

---

## Pre-B7 handoff (post-B6 PASS)

**HEAD:** `feat/meet-v2-b6-grid-overlays-clock` (commit `b71a321 docs: add v2 B6 evidence artifacts`)
**Branch for B7:** `feat/meet-v2-b7-controls-banner-failure` — off B6 HEAD.

**Post-B6 state:**
- Backend: 17 vitest / 43 tests green. `media-state` relay live. `admitted` payload includes `hostClientId` + per-peer `host` flag.
- Frontend: dynamic grid + per-tile overlays (mute icon / camera-off avatar / HOST badge) + meeting clock all live at voice.silverjrom.app. Lobby has device preview from B5.
- Controls bar currently text-flips ("Mute"/"Unmute", "Camera on"/"Camera off") — UNCHANGED from rebuild. **B7 replaces with icon-state buttons.**
- Record button: visible to ALL peers currently (legacy from rebuild). **B7 gates it host-only.**
- No "Host is recording" banner exists. **B7 adds it.**
- Permission-denied state in lobby is a basic placeholder (B5). **B7 polishes the full device-failure UX (denied, no-devices, mid-call denial, Retry, helpful instructions).**

**WS protocol available (post-B6):** `media-state` (R6.3) + `recording-started/stopped` (R2.4 wired backend-side; B7 wires frontend banner subscription).

**What B7 must produce:**

1. **Icon-state controls** (R7.1):
   - Replace text-flip in `<app-controls-bar>` with **single icon buttons** that have on/off visual state. Each button:
     - Has an Ionicon name (`mic`, `mic-off`, `videocam`, `videocam-off`, `desktop`, `radio`, `exit`)
     - Renders mic ON state with the `mic` icon + a neutral background; OFF state with `mic-off` icon + red/destructive background
     - Same for camera, screen-share (toggle), record, leave (no toggle — just an icon)
     - Has `aria-pressed="true|false"` for screen reader; aria-label tells action
     - Tooltip on hover shows the action label
   - Use existing Ionicons setup. Single button per control, NOT 2 mutually exclusive ones.

2. **Record button visible only to host** (R7.2):
   - In `<app-controls-bar>` template: `@if (isHost()) { <button aria-label="Record"...> }`
   - The `isHost` signal comes from `room.page.ts` (already derived from `hostClientId` in B6).
   - Non-hosts: button is NOT IN THE DOM (not just `display:none`). Verified by `toHaveCount(0)`.

3. **"Host is recording" banner visible to ALL** (R7.3):
   - New `<app-recording-banner>` component rendered above the tiles-grid (or inside the call-panel topbar).
   - Subscribes to incoming `recording-started/stopped` WS broadcasts. State signals: `isRecording = signal(false)`, `recordingStartedAt = signal<number|null>(null)`.
   - When `isRecording()` true: render a red dot + "Host is recording" text + duration counter (counts up from `recordingStartedAt`, formatted `m:ss` / `h:mm:ss` like the meeting clock).
   - When false: hidden.
   - Triggered by:
     - Server `recording-started` event → banner appears for all admitted peers
     - Server `recording-stopped` event → banner disappears
   - For the host: banner serves as their own "I am recording" indicator (no separate UI needed).

4. **Device failure UX polish** (R7.4):
   - Extend the existing lobby permission-denied placeholder (B5) into a fuller treatment:
     - **Permission denied (`MediaError.code === 'denied'`):** clearer copy — "Microphone access denied. To join this call, allow microphone access for **voice.silverjrom.app** in your browser settings, then click Retry below." + a Retry button that re-invokes `preflight`.
     - **No devices found (`MediaError.code === 'no-devices'`):** "No microphone detected. Please connect a microphone and refresh the page." (no Retry — refresh required to re-enumerate).
     - **Camera-only denial (audio denied but video would work):** mic is required; same as Permission denied above.
     - **Camera denied but mic ok:** acceptable to join (video off); show a less-blocking warning "Camera unavailable — joining audio-only."
   - **Mid-call device denial** (e.g. user revokes mic permission mid-call via browser UI): listen for `MediaStreamTrack.onmute`/`onended`; if mic dies mid-call, show a toast "Microphone disconnected. Please refresh to rejoin." — non-blocking, audio stops working but other peers stay on.

5. **Camera-off renders avatar in-call** (R7.5):
   - This is mostly closed by B6's `<app-tile>` overlays. B7 just confirms it works correctly in the in-call state when local camera toggles OFF — the local tile flips to avatar same as remote tiles.
   - Existing test S6.4 covers remote-peer-camera-off. B7 adds a single spec for local-self-camera-off avatar.

### Tests `e2e/tests/v2-b7-controls/`

- `record-button-host-only.spec.ts` (S7.1, S7.2) — two-context: host sees Record button (visible); non-host (`toHaveCount(0)`)
- `recording-banner.spec.ts` (S7.3) — two-context: host clicks Record → both contexts see "Host is recording" banner within 2s; host clicks Stop → banner disappears within 2s; banner duration counter advances
- `permission-denied-polish.spec.ts` (S7.4) — Playwright with `permissions: []`; lobby shows the polished copy + Retry; click Retry re-invokes preflight (verify via spy or by granting permissions after Retry and seeing the lobby load)
- `no-devices.spec.ts` (S7.4) — harder to fake `NotFoundError` in Playwright. Acceptable to mock via `page.addInitScript` overriding `getUserMedia` to throw `NotFoundError`. Verify "No microphone detected" message + no Retry button.
- `controls-aria-pressed.spec.ts` (S7.5 — aria-pressed flip)

### Build + deploy

```bash
npm run build -w frontend
pm2 restart meet-poc-fe
```

Verify live at voice.silverjrom.app: log in, join a room, see icon-state controls + Record button only when you're the host.

### Hygiene reminder (carried from B6 flaky-parallel learning)

Codex's B6 test-report noted parallel race on B4 ongoing-tab when run alongside B6 specs. Same root cause: tests hit prod DB. **For B7 tests**: prefer running with `--workers=1` for the regression sweep, OR ensure each spec serializes its own DB writes. If a flaky FAIL surfaces in parallel, /projcore reruns solo to confirm; not a blocker if solo-PASS.

**`meet-poc-fe` PM2 restart is needed after frontend build** for changes to land on voice.silverjrom.app. `meet-poc-be` tsx-watch picks up backend changes automatically.

## Standing flags (unchanged from prior)

- Commit BEFORE STATUS: DONE — **B6 missed this AGAIN; treat as a hard reminder**
- §1.15 decisions for non-trivial autonomous calls (icon choice, exact tooltip strings if non-obvious, mid-call denial detection strategy)
- §2.10 real DOM + real two-context where applicable

**Active callback target:** `plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/callbacks.md` + `progress.md`.
