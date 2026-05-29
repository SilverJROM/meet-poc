# Context handoff — B4 → B5 (FINAL gate)

**Run:** Phase 2b · projcore-run-2026-05-28
**Branch:** `feat/share-persistence-mobile-revoke-20260528`
**Commits so far:**
- `5cdb0af` — feat(bg): segmentation foundation + blur mode (R18)
- `f6f8714` — feat(bg): 5 generic backgrounds + picker UI (R19)
- `fb91c46` — feat(bg): custom background upload (R20)
- `a59043a` — docs(bg): B3 validation evidence (R20)
- `0469f64` — feat(bg): mobile opt-in warning (R21)

## What's done (R18–R21 — all VERIFIED)

- B1: `background-effects.service.ts` — MediaPipe segmentation, blur/image composite, lazy load, graceful fallback. LOCKED.
- B1: `room.page.ts` — `effectiveLocalStream` single source of truth + `lastSfuVideoTrack` debouncer + SFU sync `effect()` + wand icon button. LOCKED.
- B2: `background-picker.component.{ts,html,scss}` — 7-tile picker (None/Blur/City/Library/Beach/Mountain/Gradient), lobby inline + in-call overlay, localStorage persistence, keyboard nav.
- B2: `frontend/src/assets/backgrounds/*.svg` — 5 generated CC0 SVGs + CREDITS.md.
- B3: same picker file — upload tile, canvas resize (1280×720, JPEG ladder 0.85→0.5), localStorage FIFO max 5, custom-tile delete, restore.
- B4: same picker file — `ViewportService` injection, verbatim mobile warning, `meet-poc:bg:mobile-opt-in` flag for default-off-on-mobile.

## What B5 needs to do (R22 — final gate)

R22 is the test gate. Per og-requirements:

1. **Backend build PASS** — already passing at every batch; verify in this run.
2. **Frontend ng build PASS** — already passing; verify in this run.
3. **Existing e2e regression** — `tests/fixloop-banner/` 16/16; already passing at every batch; verify.
4. **NEW playwright spec** — `e2e/tests/background-effects.spec.ts`:
   - Spin up a single browser, navigate to lobby (use the same playwright fixture pattern as fixloop-banner).
   - Wait for camera preview ready (lobby fully rendered).
   - Locate the picker; click "Blur" tile.
   - Wait for `backgroundEffects.modelReady() === true` AND `effectiveLocalStream() !== media.localStream()`.
   - Assert `window.__meetDebug.effectiveLocalStream.getVideoTracks()[0].id !== window.__meetDebug.localStream.getVideoTracks()[0].id` — composite track is a different MediaStreamTrack than raw.
   - Toggle back to "None" — assert `effectiveLocalStream === localStream` (raw track restored).
   - Spec should complete in <60s including model load.
5. **Manual smoke** — JROM's responsibility, NOT codex's. Document in validation MD that this is JROM-gated.

### Spec acceptance pattern

Look at `e2e/tests/fixloop-banner/*.spec.ts` for the fixture pattern (room admit, host/guest). For background effects, a SINGLE-browser test is sufficient (no SFU exchange needed to assert composite-stream-in-use).

Reuse the `window.__meetDebug.effectiveLocalStream` debug hook that B1 added — that's the cleanest signal.

If the picker is not directly clickable from playwright due to overlay state, exercise it via the lobby inline rendering (no overlay needed in lobby — the picker is inline there).

### Where to make changes

- NEW file: `e2e/tests/background-effects.spec.ts`
- Possibly: `e2e/playwright.config.ts` — only if the new spec needs a new test directory; reuse existing config first.
- DO NOT touch frontend code.
- DO NOT touch background-effects.service.ts.
- DO NOT touch background-picker.component.*.
- DO NOT touch room.page.ts.

## Open considerations for B5

- The model loads from CDN (jsdelivr); ensure the playwright run has internet OR the test allows offline fallback. The fixloop-banner runs from `http://localhost:4700` (PM2 dev) — likely has internet.
- If the spec is flaky (model load timing), retry once via playwright's `test.describe.configure({ retries: 1 })` is acceptable.
- Don't over-test — one happy path (None → Blur → None) is enough for R22. Deep coverage of all 5 presets would be over-scope.

## Verified evidence (R18–R21)

- All 5 commits land cleanly.
- backend `tsc` + frontend `ng build` PASS at every batch gate.
- B1 two-browser join: guest received composite stream.
- B2 lobby/in-call screenshots saved.
- B3 picker-with-customs screenshot + validation MD saved.
- B4 desktop-no-warning + mobile-warning screenshots saved.
- e2e fixloop-banner 16/16 PASS at every batch gate.
