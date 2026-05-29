# B10 Independent Validation - Codex

Validator: Codex independent validator, not implementer
Validated commit: `efbdd0a` (`feat(sfu): B10 - flip isSfuMode default to TRUE; add ?sfu=0 to all legacy e2e specs`)
Baseline used for comparisons: `c92f49e` (B9 callback baseline)
Callback chore excluded from behavior review: `0cc1a86`

## Production Change Review

PASS.

Only one production file changes between `c92f49e..efbdd0a`: `frontend/src/app/pages/room/room.page.ts`.

Functional production changes:

- `isSfuMode` default changed from `queryParamMap.get('sfu') === '1'` to `queryParamMap.get('sfu') !== '0'`.
- The admitted-path publish gate changed from checking the raw query param to `this.isSfuMode()`.

Mesh code remains present:

- Existing WebRTC configure/addPeer/signal/drainPendingSignals paths are still intact.
- `?sfu=0` still disables SFU because `isSfuMode()` is false, which also prevents SFU publish/subscribe/screen-share paths from running.
- Reversal is one-line: change `!== '0'` back to `=== '1'`.

Test-only changes include `?sfu=0` added to legacy E2E join paths and `e2e/playwright.config.ts` changing `reuseExistingServer` to true. Those are not production runtime changes.

## SFU Suite On B10

Command:

```bash
MEET_DB_PATH=/tmp/meet-b10-sfu.sqlite \
E2E_BACKEND_PORT=4822 \
E2E_FRONTEND_PORT=4823 \
E2E_PROXY_PORT=4821 \
E2E_BASE_URL=http://localhost:4821 \
E2E_WS_ORIGIN=ws://localhost:4821 \
npm test -w e2e -- tests/sfu-b2-publish tests/sfu-b4a-subscribe tests/sfu-b4b-late-join tests/sfu-b5a-toggles tests/sfu-b5b-screenshare tests/sfu-b6a-simulcast tests/sfu-b6b-layer-pref tests/sfu-b7-reconnect tests/sfu-b9-diagnostics --config=playwright.config.ts --workers=1
```

Result on `efbdd0a`: 9 passed, 2 failed.

Failures:

- `B4b: late join subscribes to all present + leave tears down subscription`: failed waiting for A remote stream count to become 1; received 0.
- `B5b: screenshare publishes a separate video track over SFU`: failed waiting for `remoteScreenStreams.size` to become 1; received 0.

## SFU Failure Baseline Comparison

Baseline checkout: `c92f49e`.

Command:

```bash
MEET_DB_PATH=/tmp/meet-b10-sfu.sqlite \
E2E_BACKEND_PORT=4822 \
E2E_FRONTEND_PORT=4823 \
E2E_PROXY_PORT=4821 \
E2E_BASE_URL=http://localhost:4821 \
E2E_WS_ORIGIN=ws://localhost:4821 \
npm test -w e2e -- tests/sfu-b4b-late-join tests/sfu-b5b-screenshare --config=playwright.config.ts --workers=1
```

Result on `c92f49e`: both failed with the same failure signatures.

Classification:

- `B4b`: PRE-EXISTING in this validation environment. It did not pass at `c92f49e`.
- `B5b`: PRE-EXISTING in this validation environment. It did not pass at `c92f49e`.

This contradicts the callback's "verified pass earlier" history, but the requested regression rule was commit comparison. These failures are not introduced by `efbdd0a`.

## Legacy Failure Spot Check

I first ran the B10-touched legacy subset on `efbdd0a` with the same isolated ports/DB pattern. Result: 58 passed, 11 failed, 3 skipped, 4 not run.

Representative failures compared against `c92f49e`:

| Spec / scenario | `efbdd0a` result | `c92f49e` result | Classification |
|---|---:|---:|---|
| `v2-b5-lobby/lobby-preflight` S5.1 | FAIL: `TEST_ROOM01 not found` | FAIL: same | PRE-EXISTING fixture issue |
| `v3-diaglog` DR-28 | FAIL: strict-mode `candidate` locator resolves to 8 elements | FAIL: same | PRE-EXISTING assertion issue |
| `v3-fixb1-race` FIX-B1.1 | FAIL: `remoteVideoStats` remains `[]` | FAIL: same | PRE-EXISTING mesh media issue |
| `v3-tilefix` DR-30 | FAIL: timeout waiting for share-strip host video | FAIL: same | PRE-EXISTING share/tile issue |

One transient/batch-order signal was investigated:

- `v3-diagc-weak-connection` DR-42 failed in the larger `efbdd0a` legacy batch with peer state stuck at `new`.
- It passed at `c92f49e`.
- It also passed when rerun alone on `efbdd0a` with a fresh DB.
- Classification: not a stable B10 regression; likely batch-order/test pollution in the large legacy subset run.

No stable spot-checked legacy failure passed at `c92f49e` and failed at `efbdd0a`.

## SFU Default No-Param Smoke

I ran a direct Playwright browser smoke without editing repo test files:

- host URL: `room.url` with no `?sfu`
- guest URL: `room.url` with no `?sfu`
- both clients enabled camera, joined/admitted, and waited for SFU publish plus inbound SFU media stats.

Result: PASS.

Observed:

```json
{"ok":true,"hostPublish":"published","guestPublish":"published","hostCounts":{"audio":27,"video":4},"guestCounts":{"audio":9,"video":3}}
```

This confirms a normal no-param join now uses SFU and media flows in both directions.

## Final Verdict

Production change is scoped and reversible. SFU default behavior works. The SFU suite failures (`B4b`, `B5b`) reproduce at the B9 baseline, so they are not B10 regressions by the requested comparison rule. Legacy spot-checks did not reveal a stable B10-only regression.

STATUS: VALIDATED-PASS
