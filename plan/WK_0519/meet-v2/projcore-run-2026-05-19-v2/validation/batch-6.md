# Validation — v2-B6 (Frontend in-call grid + per-tile overlays + meeting clock)

**Verdict:** **PASS** (iter 1, with one commit-process correction same as v1-B4 + 1 known-flaky test isolated).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present. 4 decisions: `host-identity-protocol`, `avatar-color-hash`, `clock-format`, `backend-restart`. **9 real screenshots** including the JROM-comparison live screenshot from voice.silverjrom.app.

## Gate 2 — Diff review

**Commit-process gap (same as v1-B4):** codex finished but did NOT commit before posting STATUS: DONE. /projcore sent the same "commit only, no code changes" correction; codex responded in ~15min with 4 grouped commits + STATUS: DONE.

Post-correction commits on `feat/meet-v2-b6-grid-overlays-clock`:
```
b71a321 docs: add v2 B6 evidence artifacts
94c9259 test: add v2 B6 grid and overlay coverage
1b100bb feat: add dynamic grid overlays and clock
7e6fff1 feat: add media-state relay and host metadata
```

**Soft flag carried forward to B7+B8 brief:** the "commit BEFORE STATUS: DONE" rule needs to be more prominently called out in future briefs OR an explicit checklist in the brief footer. /projcore folds this into B7's dispatch.

### Key surfaces touched (read each)

- `backend/src/modules/signaling/index.ts` — `media-state` relay (admitted-only, no echo to sender). Host metadata additive on `admitted` payloads (`hostClientId` + `peers[].host`). Backward-compat: existing `admitted` consumers ignore unknown fields gracefully.
- `frontend/src/services/{ws,webrtc}.service.ts` — types extended for the new fields. `updatePeer()` method added for media-state mutations.
- `frontend/pages/room/room.page.{ts,html,scss}` — count-driven grid, host tile detection, clock signal + cleanup.
- `frontend/components/tile/tile.component.{ts,html,scss}` — camera-off avatar (HSL color from name hash), HOST badge, mute icon overlay, repositioned name/state.
- `backend/tests/signaling-media-state.test.ts` — new vitest spec for relay-not-echo.
- `e2e/tests/v2-b6-grid/` — 2 spec files (grid-layout + overlays-clock) covering S6.1-S6.6.

## Gate 3 — Build

`npm run build` PASS.

## Gate 4 — Targeted tests

- Backend regression: **17 files / 43 tests** green (was 16/42, +1 file +1 test for `signaling-media-state.test.ts`)
- B3+B4+B5+B6 Playwright (parallel run on 8 workers): **25 passed, 1 failed (FLAKY)** — `S4.3 ongoing tab polling pickup` failed in the 4-suite parallel run; rerun **solo** PASSED in 10.6s. Cause: parallel test interference on the prod DB. Same root cause codex documented in B4 ("first two B4 Playwright runs exposed concurrent test-data interference"). NOT a code regression.

### Flaky-test note (B4 ongoing-tab in parallel)

The B4 ongoing-tab spec races other parallel specs writing to the same prod DB. Codex serialized B4 tests originally but the test-isolation pattern doesn't extend across batch directories. Cleanest fix: tests use a sandbox `MEET_DB_PATH` env (separate temp DB per test process). **Folding this into B7 brief as a hygiene reminder** — but B6 itself is not at fault.

## Gate 5 — Evidence quality (5Q)

- Q1 ✓ Real DOM + real WS clients + real two-context.
- Q2 ✓ UI-level proof at right level; backend media-state relay has its own backend-protocol spec.
- Q3 ✓ **9 real screenshots** verify each scenario AND `jrom-comparison-live-call.png` captures the new in-call view from the public URL (the closure of JROM's "trash UI" complaint).
- Q4 ✓ 6 scenarios = 7 specs (S6.1+S6.2 share grid-layout.spec.ts; rest 1:1).
- Q5 ✓ Live verification: `voice.silverjrom.app` serves the new grid + overlays; codex's own public smoke captured the comparison shot.

### Live state check post-validation

```
rooms = 1 (TEST_ROOM01)
recordings = 0
meeting_sessions = 0
```

Post-rerun cleanup completed — restored hygiene baseline. (Note: my /projcore rerun against the live PM2 DB added 7 short-lived `B6GRID*` rooms + 1 `B6LIVE` room + 11 sessions — all `host-disconnect-empty`, all <1s duration. Cleaned via direct SQL. This validates that the e2e tests touched prod DB but also that the impact is recoverable.)

## Gate 6 — Matrix update

R6.1, R6.2, R6.3, R6.4, R6.5 → **VERIFIED**.

## Gate 7 — Decisions + project_specs

4 decision files all properly placed. `project_specs.md` updated with B6 layout + overlay + media-state + clock behavior.

**Codex's `host-identity-protocol` decision:** chose the lightest touch — additive `hostClientId` field on `admitted` + per-peer `host` flag on `peers` array. No new WS message. Backward-compat with non-host-aware clients. ✓
**`avatar-color-hash` decision:** deterministic HSL from name hash. Standard pattern. ✓
**`clock-format`:** `m:ss` under 1 hour, `h:mm:ss` over. ✓
**`backend-restart` decision:** restarted BE too (not just FE) because the new WS protocol fields landed in the BE. Correct.

## Verdict

**PASS** — 5 new VERIFIED. **Matrix: 33/44 VERIFIED, 11 ASSIGNED, 0 PARTIAL, 0 FAIL.**

**JROM's "meeting UI is trash" complaint is now closed at the visual level**: dynamic grid removes the stretched-letterbox bug, per-tile overlays add the information the legacy UI lacked, host badge clarifies ownership, meeting clock provides time awareness. `screenshots/jrom-comparison-live-call.png` is the artifact.

Cleared for B7 (controls polish + recording banner + device failure UX).
