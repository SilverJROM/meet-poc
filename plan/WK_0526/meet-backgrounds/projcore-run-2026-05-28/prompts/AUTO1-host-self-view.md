# Autonomous Ask #1 — Host self-view shows raw, guests see blur

> **Role for THIS dispatch:** You are the IMPLEMENTER. You are NOT projcore. JROM is asleep. Claude /projcore is operating autonomously per JROM's directive ("do this autonomously as i need to sleep now i expect all of these fixed when i wake up, work with codex to fix it please").

## Problem

When host enables background blur or background image in-call:
- Guests see the blurred / image-background composite (SFU `replaceVideoTrack` works)
- Host's own local self-view tile continues to show the raw camera feed

Pipeline therefore works end-to-end; the bug is specifically how the host's LOCAL self-view tile renders.

## Read first

- `frontend/src/app/pages/room/room.page.ts` — `peers` computed at line ~190 (local peer's `stream: this.effectiveLocalStream()`), `effectiveStreamForSourceTrack`, SFU sync `effect()`
- `frontend/src/app/components/tile/tile.component.ts` — `videoStream` computed, the effect that sets `video.srcObject`
- `frontend/src/app/services/background-effects.service.ts` — `processStream` returns `canvas.captureStream(30)` outputStream
- `logs/bg-debug.jsonl` — likely empty (JROM didn't hard-refresh)

## Hypotheses (you should verify, not assume)

1. **Tile effect not re-firing**: `effectiveLocalStream` returns a new `MediaStream` wrapper each recompute. `peers()` returns a new array with a new local peer object. Tile gets new `[peer]` input. But the inner `effect()` watching `videoStream()` may dedupe by reference and miss the actual stream change.
2. **Race**: `peers()` may capture `effectiveLocalStream()` BEFORE `modelReady` flips. Result: stream is raw at the moment peers() runs.
3. **Local peer's stream gets stuck**: the local peer object construction in `peers()` reads `this.effectiveLocalStream()` synchronously; if that returns the cached raw stream (before model load completes), and peers() doesn't re-fire later because its dependencies don't include `effectiveLocalStream` reactively... wait, computed-of-computed should propagate. Verify.
4. **TileComponent video element**: the effect `video.srcObject = this.videoStream()` may set the same MediaStream object reference, so srcObject re-assignment is a no-op. With a wrapper that holds the same processed track, browser may not re-render.

## Plan

1. **Reproduce in playwright**: spin up two browsers (host + guest), host enables blur, guest checks that guest's incoming track is composite (different track id from host's raw camera), and HOST's own `<app-tile>` inside `peers()` for the local peer has `<video>.srcObject` whose video track id == effective track id (the canvas captureStream output), not the raw camera track. This will give you a failing test that pinpoints whether the local tile actually gets the composite track.
2. **Fix mechanism**: based on the failing test, the cleanest fix is likely to make the local tile component bypass the MediaStream-wrapper and bind directly to the effective video track (use displayStream input override, or change videoStream computed to flatten). Don't change SFU publish path.
3. **Verify**: same spec passes; existing background-effects spec still passes; e2e fixloop-banner 16/16 unchanged.

## Hard constraints

- Touch only what's needed for this fix. Likely files: `room.page.ts/html`, `tile.component.ts/html`. Optional: `background-effects.service.ts` only if absolutely required.
- DO NOT touch the SFU publish path; guests already see blur — don't risk that regression.
- DO NOT touch the picker UI (Ask #2).
- DO NOT touch reactions (Ask #3).
- DO NOT touch layout/grid (Ask #4).
- DO NOT remove the BG-DEBUG instrumentation — that's task #18, comes later as one separate commit.

## Acceptance gate

1. New playwright spec demonstrates the bug + the fix.
2. Background-effects existing spec PASS.
3. fixloop-banner 16/16 PASS.
4. ng build clean.
5. Commit message: `fix(bg): host local self-view shows composite stream when effect active (Ask #1)`
6. Validation note: `validation/AUTO1-host-self-view.md` (mechanism + diff summary + test references).
7. Deploy: PM2 restart meet-poc-fe (frontend only — no backend change).

Final line MUST be EXACTLY: `STATUS: DONE — Ask #1 ready for validation`

## Stop conditions

- If the fix requires changing SFU publish path or significantly refactoring `effectiveStreamForSourceTrack`, STOP and report — that's bigger than this ask.
- If the playwright spec can't determine the local tile's actual srcObject track id (browser security blocks introspection), STOP and surface — we may need a different test strategy.
