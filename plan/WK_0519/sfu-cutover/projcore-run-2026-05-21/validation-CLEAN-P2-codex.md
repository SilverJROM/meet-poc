# CLEAN-P2 Independent Validation - Codex

Date: 2026-05-22
Branch: `feat/sfu-clean`
Commit: `75b69e8 feat(sfu): CLEAN-P1 - SFU-only presentation layer, delete webrtc mesh service`

## Scope

Independent swap-readiness validation for the CLEAN SFU-only rebuild. I did not edit production source.

## Mesh Deletion Gate

PASS.

- `git checkout feat/sfu-clean` confirmed the branch is already checked out.
- `git rev-parse --short HEAD` returned `75b69e8`.
- `frontend/src/app/services/webrtc.service.ts` is gone.
- `rg -n "webrtc\\.service|WebrtcService|webrtc.service" frontend --glob '!node_modules'` returned no matches.

## Full Requested Suite

Command:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-clean-p2.sqlite npm test -w e2e -- tests/sfu-b2-publish tests/sfu-b4a-subscribe tests/sfu-b5a-toggles tests/sfu-b6a-simulcast tests/sfu-b6b-layer-pref tests/sfu-b7-reconnect tests/sfu-b9-diagnostics tests/v3-admit tests/v3-chat tests/v2-b7-controls tests/v3-identity tests/v2-b5-lobby --config=playwright.config.ts --workers=1
```

Result: `18 passed`, `6 failed`, `1 skipped`.

SFU results: PASS.

- `B2: SFU client publishes audio+video to Cloudflare`
- `B4a: two SFU clients each receive audio+video from the other through Cloudflare`
- `B5a: cam-off stops remote video, cam-on resumes, mic-mute propagates; no renegotiation`
- `B6a: camera video published with simulcast encodings`
- `B6b: subscribe preferredRid h/l; update preserves stream`
- `B7-drop: reconnect creates new CF session, A sees B again with no ghost tile`
- `B7-exit: deliberate leave removes B tile from A immediately`
- `B7-regression-B4a: two SFU clients each receive audio+video from the other`
- `B9: SFU diagnostics persisted and displayed`

No SFU spec failed or looked flaky, so no SFU rerun was needed.

App-shell results from the requested command:

- `v2-b7-controls`: PASS, 6/6.
- `v3-admit`: PASS, 2/2.
- `v3-identity`: PASS, 1/1.
- `v3-chat`: SKIPPED by checked-in `test.skip(...)`; not executed by the suite.
- `v2-b5-lobby`: 6 failures, all before navigation due to missing isolated DB fixture row `TEST_ROOM01`.

## Failure Classification

The six failures were:

- `B5 lobby camera-on preview renders after camera checkbox`
- `S5.3 device selector populates from enumerateDevices`
- `S5.2 mic level meter shows activity`
- `S5.4 permission denied state shows retry placeholder`
- `S5.1 lobby pre-grants getUserMedia on mount`
- `S5.5 join carries the pre-acquired stream into the call`

Each failed at `e2e/tests/v2-b5-lobby/helpers.ts:11` with `Error: TEST_ROOM01 not found`.

Classification for each: not `APP-SHELL-BROKEN`; not `MESH-ASSERTION`; test-data precondition failure. The isolated DB was seeded by the app's seed command, but `backend/scripts/seed.ts` seeds only the user. It does not create `TEST_ROOM01`. The DB contained SFU-created dynamic rooms but no `TEST_ROOM01`.

No failures asserted deleted mesh internals such as `senderSnapshot` or mesh diagnostics. `MESH-ASSERTION` count: 0.

## Targeted Reruns / Extra Coverage

Lobby rerun after satisfying the stale test fixture precondition in the temporary validation DB:

```bash
sqlite3 /tmp/meet-clean-p2.sqlite "INSERT OR IGNORE INTO rooms (id,title,slug,owner_email,created_at,is_open,wait_timeout_minutes) VALUES ('testroom01001','TEST_ROOM01','test-room01','jrom@silverjrom.app',1779453500000,0,15);"

E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-clean-p2.sqlite npm test -w e2e -- tests/v2-b5-lobby --config=playwright.config.ts --workers=1
```

Result: `6 passed`.

Chat manual smoke was required because `tests/v3-chat/chat.spec.ts` is hard-skipped. Against the same isolated ports and DB, I validated:

- host creates/joins room;
- guest asks to join and is admitted;
- both reach `.call-panel`;
- host sends chat;
- guest unread badge shows `1`;
- guest opens chat and badge clears;
- guest sees host message;
- XSS-shaped text renders as text and does not set `window.__chatXss`.

Result: PASS. Diagnostics: `0` request failures. Console had `3` Angular dev-server HMR WebSocket errors for `ws://localhost:4821/?token=...`, unrelated to app signaling or API behavior.

## Verdict

Swap-ready.

Reasoning: the SFU suite is green; the SFU-only room/admit/identity/host controls/lobby/chat app shell is functional; `?sfu=0` legacy URLs did not force a mesh path; no frontend imports the deleted mesh service. The only initial suite failures were caused by a stale `TEST_ROOM01` fixture assumption under an isolated DB and passed once that temporary DB precondition existed.

STATUS: VALIDATED-PASS (swap-ready)
