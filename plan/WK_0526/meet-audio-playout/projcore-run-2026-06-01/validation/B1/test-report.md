# B1 Test Report — Host remote-audio playout: honest playability + AudioContext resume

**Batch:** B1 (R1 only — R2 mic-persistence is B2, out of scope)
**Branch:** `feat/host-audio-playout-mic-persist-20260601`
**Mode:** Mode 2 (independent re-run — tests executed by QA, NOT trusting dev self-report)
**Tested by:** [qa] v3.0
**Date:** 2026-06-02

## Tested Against

| Layer | How | Endpoint / Command |
|-------|-----|--------------------|
| Unit (U1-U10, regression) | `npx tsx <spec>` (node:assert/strict) | `frontend/src/app/services/remote-audio-playability.spec.ts`, `remote-audio-health.spec.ts` |
| E2E (E1-E6) | Playwright, two-context, `--workers=1`, Chromium fake-media | isolated webserver — proxy `http://localhost:4740`, backend 4730, frontend 4731, isolated DB `.b1-e2e/meet-poc.sqlite` + isolated recordings (live PM2 on 4700/4720 untouched) |

---

## Unit Tests (HARD — U1-U10 + regression)

Run: `npx tsx frontend/src/app/services/remote-audio-playability.spec.ts`

| # | Scenario | Expected | Actual | Result |
|---|----------|----------|--------|--------|
| U1 | suspended + sources ⇒ NOT playable (BUG-1 regression proof) | `false` | asserted `false` | PASS |
| U2 | running + sources + unpaused ⇒ playable | `true` | asserted `true` | PASS |
| U3 | running but outputPaused ⇒ NOT playable | `false` | asserted `false` | PASS |
| U4 | running but !outputAttached ⇒ NOT playable | `false` | asserted `false` | PASS |
| U5 | running + 0 sources ⇒ per-peer fallback | `true` | asserted `true` | PASS |
| U6 | 0 sources + per-peer paused ⇒ fallback false | `false` | asserted `false` | PASS |
| U7 | closed + sources ⇒ NOT playable | `false` | asserted `false` | PASS |
| U8 | 'none' + sources ⇒ NOT playable | `false` | asserted `false` | PASS |
| U9 | mixer disabled + sources ⇒ per-peer fallback | `true` | asserted `true` | PASS |
| U10 | mixer disabled + per-peer paused ⇒ fallback false | `false` | asserted `false` | PASS |

Output: `remote-audio-playability: all assertions passed` (exit 0). All 10 hard U-cases present in the spec and pass.

**Regression** — `npx tsx frontend/src/app/services/remote-audio-health.spec.ts` → `remote-audio-health: all assertions passed` (exit 0). No regression.

---

## E2E Tests (Playwright)

Run: `npm test -w e2e -- e2e/tests/b1-host-audio/ --config=playwright.config.ts --workers=1`
Isolated env: `MEET_DB_PATH` / `MEET_RECORDINGS_DIR` + `E2E_BACKEND_PORT=4730` `E2E_FRONTEND_PORT=4731` `E2E_PROXY_PORT=4740` `E2E_BASE_URL=http://localhost:4740` `E2E_WS_ORIGIN=ws://localhost:4740`.

| # | Scenario | Action | Expected | Actual | Screenshot | Result |
|---|----------|--------|----------|--------|-----------|--------|
| E1 | positive — context running, output unpaused, banner hidden | join host, gesture-enable, inject source | `contextState:'running'`, `outputPaused:false`, `mixedPeerIds>0`, banner count 0 | snapshot running, output unpaused, source mounted, no banner | `screenshots/E1-positive-running-banner-hidden.png` | PASS |
| E2 | negative — sources + non-running ctx ⇒ banner | inject source, suspend context | banner visible + "Tap to enable audio" + Enable audio button | banner surfaced, copy + button present | `screenshots/E2-negative-banner-shown.png` | PASS |
| E3 | recovery — Enable audio gesture resumes + clears banner | click Enable audio from E2 state | `running`, `outputPaused:false`, banner count 0 | context resumed, output unpaused, banner cleared | `screenshots/E3-recovery-running-banner-cleared.png` | PASS |
| E4 | source-add re-unlock — late source while not running ⇒ banner, gesture resumes | settled host (0 src) → suspend → inject src → gesture | `mixedPeerIds` 0→>0, banner shown, then `running` + banner cleared | source-add surfaced banner, gesture resumed | (Playwright on-fail capture) | PASS |
| E5 | no regression — stays playable; volume + mute-all | wait 3s; toggle mute-all; change volume | stable running/unpaused; `mutedAll` toggles; `volume` reflects 0.5; `outputPaused` stays false (gain not pause) | all held; mute-all toggled both ways; volume = 0.5; no re-block | (Playwright on-fail capture) | PASS |
| E6 | SOFT — getStats jitterBufferEmittedCount climbs | sample inbound-audio RTP twice ~2s apart | climb OR honest fake-media fallback | no live inbound RTP under headless (first=null, second=null); fell back to snapshot proxy `running`+`outputPaused:false` | n/a | PASS (SOFT, did not gate) |

**Result: 6 passed (33.7s).**

### E6 honesty note (NS5)
E6 is SOFT and did NOT gate. Under headless Chromium fake-media the injected synthetic source has no peer connection, so `getStats()` exposes no inbound-audio RTP track and `jitterBufferEmittedCount` is unavailable (first=null, second=null). The test reported this honestly and fell back to the deterministic `debugSnapshot()` proxy (`contextState:'running'`, `outputPaused:false`) as evidence of rendered-audio playout. Real climbing-emitted-count two-machine confirmation remains JROM's seat per NS5. This is an expected harness limitation, not a product defect — verdict not affected.

---

## Screenshots (Rule 2)

3 PNGs captured into `validation/B1/screenshots/` (added `page.screenshot()` hooks gated on `B1_SHOTS_DIR` env, no behavior change to assertions):
- `E1-positive-running-banner-hidden.png` — running state, NO banner (visually confirmed).
- `E2-negative-banner-shown.png` — "Tap to enable audio" banner + "Enable audio" button visible (visually confirmed — the user-visible recovery path BUG-1 suppressed).
- `E3-recovery-running-banner-cleared.png` — post-gesture, banner cleared (visually confirmed).

E1 vs E2 contrast is direct evidence the honest playability detection surfaces/clears the banner correctly. Plus the pre-existing `localhost-repro-debugsnapshot.md`.

---

## Test Pollution Cleanup

- **Live DB** (`data/meet-poc.sqlite`, the PM2 backend DB): `B1HOSTAUDIO%` rooms = **0** (no leak). Total rooms = 3.
- **TEST_ROOM01 intact:** present — `id=testroom01001`, `title=TEST_ROOM01`, owner `jrom@silverjrom.app`. (Note: memory's `3f324d8be763` is a stale identifier; the persistent room itself is intact and untouched.)
- **Isolated DB** `B1HOSTAUDIO%` after run = 0 (afterAll `cleanupRoomsByPrefix` worked).
- **Isolated env torn down:** `.b1-e2e/` (isolated DB + recordings) removed; ports 4730/4731/4740 no longer listening.

---

## Summary

- Unit: 10/10 HARD passed + regression spec green.
- E2E: 5/5 HARD (E1-E5) passed; 1/1 SOFT (E6) passed via honest fake-media fallback (did not gate).
- Console errors: none surfaced during the run; only a pre-existing unrelated Angular `NG8113 DatePipe` build warning.
- Screenshots: 3 captured + visually verified.
- Cleanup: clean — no live-DB pollution, TEST_ROOM01 intact, isolated env removed.

## Verdict: PASS
