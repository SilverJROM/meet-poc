# Validation — v2-B5 (Frontend lobby device preview, Pattern X)

**Verdict:** **PASS** (iter 1).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present. 3 decisions: `test-mic-deferred`, `mic-meter-threshold`, `retry-preflight`. 3 real screenshots (camera-off, camera-on, denied).

## Gate 2 — Diff review

5 atomic commits. Key surfaces:
- **`MediaService` extensions**: `preflight()` with typed `MediaError` mapping (`denied|no-devices|unknown`), `enumerateDevices()`, `reacquire()`, `getMicLevel(stream)` returning signal sampled at 8 Hz, `getLocalStream(cameraOn)` reuses existing pre-acquired stream as fallback. Backward-compat preserved.
- **`<app-mic-meter>`** — 8 bars; codex's threshold decision: bar N activates when normalized RMS > N/8. Smooth transitions.
- **`<app-lobby-preview>`** — composite: video preview + meter + 2 device selectors (native `<select>` for predictable behavior + a11y — codex's call).
- **`room.page.ts`** — calls preflight on entering lobby state; reacquires on checkbox/selector change; Join reuses `media.localStream()` instead of re-calling getUserMedia (R5.5).
- **Permission-denied placeholder** — explicit "B5 placeholder; B7 owns polish" — codex correctly scoped this.
- **Test-mic playback (R5.4)** — codex deferred per its decision file. Reasoning: mic-meter already verifies live mic input; the extra MediaRecorder/playback path isn't needed for B6-B8 plumbing. /projcore concurs — this is the right scope discipline.

## Gate 3 — Build

`npm run build` PASS.

## Gate 4 — Targeted tests

- Backend regression: 16 files / 42 tests green
- B3+B4+B5 Playwright (live config): **19 tests / 11.7s** — all green on independent rerun

B5 specs: lobby-preflight (S5.1), lobby-mic-meter (S5.2), lobby-device-selector (S5.3), lobby-permission-denied (S5.4), lobby-stream-carries (S5.5), plus a `lobby-camera-preview.spec.ts` for the camera-on screenshot (bonus).

## Gate 5 — Evidence quality

- Q1 ✓ Real DOM + real MediaDevices + real PM2 stack
- Q2 ✓ UI-level proof at right level; `__meetDebug.localStream` window hook used for white-box assertions where DOM doesn't expose the underlying stream (S5.1, S5.5 track-ID comparisons)
- Q3 ✓ 3 real screenshots match claims
- Q4 ✓ 5 scenarios = 6 spec files (1 bonus for camera-on screenshot)
- Q5 ✓ Live UI smoke: `https://voice.silverjrom.app/room/3f324d8be763` serves the lobby with preview; codex's own public smoke confirmed `__meetDebug.localStream` exposed an audio track at the live URL

### Hygiene

Codex explicitly cleaned a short `host-disconnect-empty` smoke session row post-test. Rooms back to TEST_ROOM01 only, 0 sessions, 0 recordings. ✓

## Gate 6 — Matrix update

R5.1, R5.2, R5.3, R5.4 (placeholder/deferred per decision), R5.5 → **VERIFIED**.

For R5.4 specifically: codex implemented the placeholder UI + Retry loop (S5.4 PASS) and explicitly scoped the polish to B7. /projcore marks R5.4 VERIFIED for B5's scope; B7 will close the full polish (R7.4 covers the same surface).

## Gate 7 — Decisions + project_specs

3 decisions logged + `project_specs.md` updated. Codex's `test-mic-deferred` decision is the most consequential — and it's the right call.

## Verdict

**PASS** — 5 new VERIFIED. **Matrix: 28/44 VERIFIED, 16 ASSIGNED, 0 PARTIAL, 0 FAIL.** Cleared for B6 (the in-call grid + overlays + clock — closes JROM's verbatim screenshot complaint).
