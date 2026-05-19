# Batch FIX-B1 — Signaling race fix + bg-tab gate tightening + control-bar contrast

**⚠️ Hard reminder #1:** **COMMIT BEFORE STATUS: DONE.** Clean tree.
**⚠️ Hard reminder #2:** JROM approved your triage analysis verbatim. Build to that. Do not invent additional scope.

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Run:** meet-fixes (post-Run-3 bug fixes from JROM's live-call test report)
**Batch ID:** FIX-B1
**Branch:** `fix/meet-fixb1-race-controls` off the current HEAD (`ec31720`).

## What this batch ships

### (1) Signaling race fix — root cause of "no peer video" + "no voice" + "recording missing remote audio"

In `frontend/src/app/pages/room/room.page.ts`, the `signal` handler currently *drops* messages when `peers().get(from)` has no PC. The backend's `admitPeer()` sends `admitted` → guest socket and `peer-joined` → host socket independently. Guest can produce + send its offer BEFORE the host has called `webrtc.addPeer(from)`, so the host silently discards the offer and the PC never connects.

**Implementation:**
- Add a `pendingSignals: Map<string, WSSignalMessage[]>` on `RoomPage` (or `WebRtcService`, whichever owns the dropping check).
- When a `signal` arrives for a `from` whose PC doesn't exist yet AND we're in a state where it eventually will (admission flow in progress / `peer-joined` not yet received), BUFFER instead of drop.
- Cap each sender's buffer at 20 messages (prevent DoS via flood).
- When `webrtc.addPeer(from)` (or equivalent host-side peer creation) lands, immediately drain `pendingSignals.get(from)` through the normal signal-processing path and clear the entry.
- Drop buffers for senders that leave the room without becoming peers.

**Add structured logging** (debug, not user-visible): when a signal is buffered, log `[signaling] buffered <type> from <id> (queue=<n>)`; when drained, log `[signaling] drained <n> queued signals for <id>`. This is for future diagnosis.

### (2) Bg-tab pause gate tightening

Currently `installMobileVisibilityPause()` and `handleVisibilityChange` gate on `viewport.isMobile()` which is `innerWidth <= 1023` — narrow desktop windows trigger it falsely. Codex's suggestion: gate on `isMobile && isMobileUA`. Implement as:

```ts
private shouldEnableBgPause(): boolean {
  return this.viewport.isMobile() && this.platform.isMobileUA();
}
```

Replace both gate checks in `installMobileVisibilityPause` and `handleVisibilityChange` to use this. Update test expectations if any v3-mb2 specs explicitly assumed viewport-only gating (they may need a UA-spoof or to set a mobile UA before asserting bg-pause behavior).

### (3) Control-bar contrast fix (theme regression from `ec31720`)

In `frontend/src/app/components/controls-bar/controls-bar.component.scss`:
- `.control-btn` background: change from `var(--panel-bg)` to `var(--panel-soft)` (#eef0f4)
- `.control-btn` border: change from `1px solid var(--line)` to `1px solid rgba(26, 31, 43, 0.18)` (≈ #1a1f2b at 18% opacity — visibly stronger than #d8dde6)
- `.control-btn` add `box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06)` for subtle lift
- `.control-btn:hover` should keep blue accent border + slight bg lift
- `.control-btn.active` keeps current blue tint
- `.control-btn.is-off` / `.control-btn.recording` / `.leave-btn` keep their semantic red colors unchanged
- Mobile `.controls-bar` (bp.mobile, currently `background: var(--panel-bg)`) stays solid white; buttons now visibly distinct because they're `var(--panel-soft)` against the white bar

After implementation, **visually verify** by hitting `https://voice.silverjrom.app/room/3f324d8be763` lobby (no auth) AND the in-call view (mock peer via Playwright `--use-fake-device-for-media-stream`). Capture a screenshot to `batch-fixb1/screenshots/controls-light.png`.

## Validation requirements (write a new e2e spec)

`e2e/tests/v3-fixb1-race/race-and-controls.spec.ts`:

1. **Test 1 — Offer-before-peer-joined race fixed.** Two Playwright `BrowserContext`s. Both sign in (or use existing test-cookie injection if that's the pattern). Host opens TEST_ROOM01, lets guest knock, admits, then within 10s assert:
   - On host page: `__meetDebug.peers().size >= 1` AND for every peer entry, the `pc.connectionState === 'connected'` (expose via `__meetDebug.peerConnectionStates()` helper if needed)
   - On guest page: same — guest sees host's connected PC
   - Both pages: `<video>` elements for remote tiles have `srcObject` set with at least 1 video track AND at least 1 audio track

2. **Test 2 — Recording captures remote audio.** Same 2-context setup. After PCs connect, host clicks Record, both speak (synthesized audio via fake-media file with tones), stop after 5s, download recording, assert file > 5KB. **Programmatically inspect** the downloaded blob: load into AudioContext.decodeAudioData and assert at least 2 distinct mixed audio sources are present (RMS > threshold at frequencies of both tones, or simpler: assert duration ≈ 5s and bytes consistent with ≥ 1 audio stream).

3. **Test 3 — Controls visible contrast.** In-call view, programmatically read computed `background-color` of `.control-btn` and `.controls-bar`. Assert they differ measurably (delta on any channel ≥ 8). Also assert `.control-btn` border-color is not `rgb(216, 221, 230)` (the broken `#d8dde6`).

**Test 4 — bg-tab UA gate.** Desktop UA + viewport 800×600 (narrow desktop): visibilitychange event fires → assert local video track stays `enabled: true` (not paused). Mobile UA + viewport 390×844: visibilitychange event fires → assert local video track gets `enabled: false`. Use `await page.emulate()` or set UA via context options.

## Regression suite (mandatory)

- `npm test -w backend` — must be GREEN
- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` — **R8.1 holds**
- New `tests/v3-fixb1-race/race-and-controls.spec.ts` — 4/4 PASS

## Required artifacts

`plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixb/batch-fixb1/`:
1. `changes.md` (Codex template: User Report verbatim + Root Cause for each of the 3 fixes + Code Changes per file)
2. `scenarios-implemented.md` — map each test to the issue it covers
3. `test-report.md` — backend + targeted + Run 1 regression + new spec results
4. `review.md` — codex's self-review
5. `independent-validation.md` — codex's own gate-check before STATUS: DONE
6. `screenshots/controls-light.png` — in-call controls visible in light theme
7. **Decisions:** `decisions/2026-05-19-fixb1-signaling-buffer.md` covering: buffer-size choice, drain-trigger choice, UA-gate change

## Scope (hard limits)

- **DO** items 1-3 above and their validation.
- **DO NOT** touch any unrelated feature (transcripts, sidebar, lobby — those are out of scope for FIX-B1).
- **DO NOT** add screen-share related changes.
- **DO NOT** refactor signaling.service or webrtc.service beyond what the race fix demands.

## Completion protocol

**COMMIT BEFORE STATUS: DONE.** Append to `progress.md` at run root (`plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixb/progress.md` — create it if absent):

```
[projcore callback] fixb1 DONE — signaling race buffered + bg-tab UA-gated + controls contrast
```

Then your `STATUS: DONE — FIX-B1 …` line.

— /projcore (Claude, Opus, 2026-05-19)
