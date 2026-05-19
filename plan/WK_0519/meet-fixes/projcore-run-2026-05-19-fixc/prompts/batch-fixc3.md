# Batch FIXC3 — Screen-share layout reflow

**Persona:** Codex builder, `-s danger-full-access`. FIXC1 + FIXC2 PASSED. R8.1 holds 12 consecutive batches. **COMMIT BEFORE STATUS: DONE.**

## Scope: requirement R-C-4

JROM verbatim:
> "3rd, when sharing the screen have the profiles of the users auto adjust and have a smaller form factor on the screen by being listed on the right side i think with an option to collapse them so that the share screen can have bigger room on the screen."
> "vertical strip with a scroll, but have the ones speaking on top or sort of vibrate them to know they are talking."

Spec row:
- **R-C-4** When local or remote share active: participant tiles collapse into a vertical right-side strip with scroll. Active speakers float to top; speaking tile pulses subtly. Main area resizes to fit the share. Collapse toggle hides the strip entirely.

## Branch

```
git checkout -b fix/meet-fixc3-share-reflow fix/meet-fixc2-device-modal
```

## Implementation (your discussion-phase plan)

> Files: room.page.ts/html/scss, tile.*, webrtc.service.ts, ws.service.ts, backend/src/modules/signaling/index.ts, signaling tests, new e2e/tests/v3-fixc3-share-reflow/*.spec.ts.
> Approach: add explicit screen flag to media-state signaling; when any peer shares, render main share area and vertical right strip. Sort strip by active speaker RMS using existing activeSpeaker.activeFrame; apply subtle pulse for current speaker; add collapse toggle.
> Gotcha: existing code cannot distinguish remote camera video from remote screen share without new signaling.
> Tests: backend media-state relay with screen flag; Playwright 4-participant/share/collapse/speaker-order.
> Commits: 2.

### Signaling change

Add a `screenOn: boolean` flag to the existing media-state relay so peers know which peer is actively sharing. Mirror the existing `micOn` / `cameraOn` pattern. When local user starts/stops screen share, broadcast updated state.

- Backend: `backend/src/modules/signaling/index.ts` — add `screenOn` to media-state validation + relay.
- Backend test: assert relay carries the new field.
- Frontend `ws.service.ts`: emit `screenOn` in outgoing state, parse it on incoming.
- Frontend `webrtc.service.ts`: track each peer's `screenOn` in the existing per-peer state record.

### Layout reflow

When ANY peer (local or remote) has `screenOn === true`:
- **Main area:** show that peer's screen-share video at 16:9 (or natural ratio) maximized.
- **Right strip:** vertical scrolling list of all participants' camera tiles in a smaller form factor (~180px wide × 120px tall, similar to Meet/Zoom).
- **Speaker order:** sort the strip by active-speaker RMS descending. Use the existing `activeSpeaker.activeFrame` 8Hz signal from FIX-B2. Higher RMS = nearer the top.
- **Pulse animation:** the currently-speaking tile gets a subtle CSS pulse (e.g., box-shadow expanding/contracting via @keyframes, 1.2s loop, low intensity — not distracting).
- **Collapse toggle:** a button on the strip's top edge (chevron icon) toggles strip visibility. When collapsed, strip becomes a thin hover-edge zone; main share expands to full width.

When NO peer is sharing:
- Restore the existing grid layout (no behavioral change).

### Frontend files (your outline)

- `frontend/src/app/pages/room/room.page.{ts,html,scss}` — layout-mode signal (`grid` vs `share`), pass through to template, hook collapse toggle.
- `frontend/src/app/components/tile/tile.component.{ts,html,scss}` — small-form-factor variant via input prop, pulse class wired to active-speaker signal.
- `frontend/src/app/services/webrtc.service.ts` — expose `peers().some(p => p.screenOn)` derived signal, plus a getter for "which peer is sharing".
- `frontend/src/app/services/ws.service.ts` — wire `screenOn` into media-state messages.
- `frontend/src/app/services/active-speaker.service.ts` — should already give per-peer RMS via `activeFrame`; just verify and consume.

### Backend files

- `backend/src/modules/signaling/index.ts` — extend media-state schema with optional `screenOn: boolean` (default false).
- `backend/tests/signaling.test.ts` (or whichever file owns media-state tests) — assert relay carries the new field.

### Test plan (Playwright)

1. **FIXC3.1 — share starts, layout switches.** 4 participants join. Host starts screen share. Assert layout class on `.call-panel` changes from `grid` to `share`; main area shows the share; right strip is visible with all 4 small tiles.
2. **FIXC3.2 — strip scrolls when many participants.** Force 8 participants (use ws fixtures + fake peers); assert strip is scrollable (overflow-y), all 8 tiles enumerable.
3. **FIXC3.3 — active speaker floats to top.** With ≥3 participants in the strip, simulate active-speaker RMS for one non-first peer; assert that peer's tile moves to index 0 within ~500ms.
4. **FIXC3.4 — pulse class on active speaker.** Assert the active-speaker tile has the `pulse` class (or equivalent CSS state).
5. **FIXC3.5 — collapse toggle hides strip.** Click collapse chevron; assert strip width → 0 (or display: none); main area's computed width grows.
6. **FIXC3.6 — share stop returns to grid.** Host stops share; assert layout class returns to `grid`; all tiles restore normal size.

Use the existing fake-display-media polyfill from FIXC1.2's spec for screen-share. Use `createRoomViaApi` for room creation.

## Gotchas codex flagged

- **Existing code cannot distinguish remote camera video from remote screen share without new signaling.** This is the core reason for the `screenOn` flag.
- **Active-speaker float must not jitter.** Use a small hysteresis: a tile must lead RMS for ≥500ms before promoting to index 0, to avoid flickering between two equally-loud speakers.
- **Pulse animation perf.** CSS @keyframes, not JS-driven. Single property animated (box-shadow or transform: scale). Don't animate width/height/layout properties.

## Required artifacts at `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc3/`

1. `changes.md`
2. `scenarios-implemented.md`
3. `test-report.md`
4. `review.md`
5. `independent-validation.md` (placeholder)
6. `screenshots/share-strip.png` (mid-share, strip visible, ≥4 tiles, one speaking)
7. `screenshots/share-collapsed.png` (strip collapsed, share full-width)

## Build + deploy

- Backend build + tests PASS (includes new signaling field)
- Frontend build PASS
- `pm2 restart meet-poc-fe meet-poc-be`
- Live URL smoke: open a room, start fake screen share, observe layout

## Validation gates (your self-checks)

- [ ] Tree clean before STATUS: DONE
- [ ] `npm test -w backend` PASS (≥60/60 — assuming +1 for new signaling test)
- [ ] `npm test -w e2e -- tests/v3-fixc3-share-reflow --config=playwright.live.config.ts --workers=1` PASS
- [ ] Run 1 regression PASS (53-spec set used in FIXC2 + new FIXC3 tests) — must hold; this is R8.1's 13th consecutive batch

## Completion

End with the STATUS: DONE block. I'll validate independently before dispatching FIXC4.
