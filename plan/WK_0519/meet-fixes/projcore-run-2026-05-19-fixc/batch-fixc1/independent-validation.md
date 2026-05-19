# FIXC1 — Independent Projcore Validation

**Verdict: PASS — VERIFIED. Cleared to dispatch FIXC2.**

## Independent test execution (projcore, separate from codex's run)

| Gate | Command | Result |
|---|---|---|
| 1 | `git status --short` | clean |
| 2 | `git log --oneline -5` | 3 commits: a3b5b9a docs seed, 6e305f6 fix(frontend), b0e962e docs evidence |
| 3 | `git branch --show-current` | `fix/meet-fixc1-camera-light` |
| 4 | `git diff --stat fix/meet-fixb4-transcripts...HEAD` | 17 files, 678+/1- — implementation + spec + 14 docs files |
| 5 | `npm test -w backend` | **59/59** PASS in 13.10s |
| 6 | `npm test -w e2e -- tests/v3-fixc1-camera-light --config=playwright.live.config.ts --workers=1` | **4/4** PASS in 6.8s, global-teardown cleaned 4/4 rooms |
| 7 | `npm test -w e2e -- <Run 1 set> --config=playwright.live.config.ts --workers=1` | **49/49** PASS in 1.5m, global-teardown cleaned 12/30 rooms |
| 8 | Live URL `https://voice.silverjrom.app/` HEAD | HTTP 200 (codex's smoke) |
| 9 | `TEST_ROOM01` (slug `3f324d8be763`) preserved | confirmed present |

## Implementation spot-check

- `media.service.ts`: adds `registerDebugTracks()` instrumentation hooking `getUserMedia` + `getDisplayMedia`; populates `window.__activeTracks`. Debug-only path; no production behavior change.
- `webrtc.service.ts`: new `stopLocalSenderTracks()` walks every peer's `pc.getSenders()` and `.stop()`s the local-side tracks (de-duplicates via Set), called as first action inside `reset()`. Covers screen-share senders that aren't part of the camera/mic media-service stream.
- `room.page.ts`:
  - **Cleanup ordering fix:** `cleanupCall()` now calls `this.media.stopLocal()` BEFORE `this.webrtc.reset()` (was the other way around). Combined with the new sender-track stop in `reset()`, this satisfies R-C-3's "stop before peer-connection close" requirement.
  - **Page lifecycle hooks:** `installPageLifecycleCleanup()` wires `pagehide` + `beforeunload` to `cleanupCall()`. Listeners removed in `ngOnDestroy()`.
  - **Mute is NOT regressed:** controls-bar mute path uses `track.enabled = false`, not `.stop()`. FIXC1.4 spec verifies.

## Spec coverage check

| Scenario | Spec test | Status |
|---|---|---|
| Join + Leave button → 0 live tracks | FIXC1.1 | PASS |
| pagehide event → 0 live tracks (incl. screen-share) | FIXC1.2 | PASS |
| Repeated pagehide/beforeunload → no throw, 0 live tracks | FIXC1.3 | PASS |
| Mute does NOT stop the track | FIXC1.4 | PASS |

Browser-tab-close real-world proof requires JROM's hardware (camera LED) — flagged in the brief as JROM's final smoke. Not blocking.

## Requirement closure

| Req | Status |
|---|---|
| R-C-3 — Camera-light fix | **VERIFIED** (browser-side; JROM hardware smoke recommended as belt-and-suspenders) |

## Regression check (R8.1)

11 consecutive batches now pass Run 1 desktop regression (49/49). No regressions introduced by FIXC1.

## Test pollution

global-teardown cleaned 12/30 rooms in the Run 1 run. The remaining 18 are cleaned inline by individual specs that own their fixtures.
