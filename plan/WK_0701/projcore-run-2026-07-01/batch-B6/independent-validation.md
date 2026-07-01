# Batch B6 — Independent Validation

## Verdict

PASS — R6 local capstone proves real 2-person and 5-person SFU recovery, including coalesced full rejoin under simultaneous subscribe failures. The B6 changes are scoped to test/fault-injection plumbing plus read-only debug exposure; `sfu-client.service.ts` recovery logic is unchanged.

## Criteria

| Criterion | Result | Evidence |
|---|---:|---|
| R6a 2-person recovery is real | PASS | `sfu-b6a-two-person-recovery.spec.ts` sets a runtime `/api/sfu/test-only/fault-inject-rules` rule for the host participant with `matchLocation: 'remote'`, forces the guest to reconnect, waits for host subscription count to drop to `0`, observes a non-null recovery ladder event, clears the injected 406, then requires subscribed count `1` and advancing inbound RTP audio bytes. Independent artifact: `b6a-two-person-recovery.json` shows `hostSubscribedCountAfterRecovery: 1`, `hostInboundAudioBytesAfterRecovery: 6530`, and recovery events. |
| R6b 5-person recovery + coalescing is real | PASS | `sfu-b6b-five-person-coalescing.spec.ts` joins host + 4 guests, injects subscribe failures for the host, reconnects 3 guests in the same tick, verifies host subscription count drops below full mesh, samples `lastRecoveryEvent` for 13s, and asserts exactly one `sfu-rejoin` epoch before clearing the fault and requiring subscribed count `4` plus advancing inbound RTP audio. Independent artifact: `b6b-rejoin-epochs-during-fault.json` contains one epoch, and `b6b-five-person-coalescing.json` shows `hostSubscribedCountAfterRecovery: 4`, `hostInboundAudioBytesAfterRecovery: 26063`. |
| Required e2e rerun | PASS | From repo root: `MEET_DB_PATH=/tmp/meet-b6-val.sqlite MEET_RECORDINGS_DIR=/tmp/meet-b6-val-rec E2E_BACKEND_PORT=4830 E2E_FRONTEND_PORT=4831 E2E_PROXY_PORT=4832 E2E_BASE_URL=http://localhost:4832 E2E_WS_ORIGIN=ws://localhost:4832 timeout 7m npm test -w e2e -- tests/sfu-b6-multiparty-recovery --config=playwright.config.ts --workers=1` → `2 passed (55.2s)`. No flake observed in this independent run. Note: the brief's `cd e2e && npm test -w e2e ...` form fails because npm cannot resolve the workspace from inside the workspace directory; the equivalent workspace command succeeds from repo root. |
| Prod gating | PASS | `backend/src/modules/realtime-sfu/index.ts` returns `404` for `/sfu/test-only/fault-inject-rules` when `NODE_ENV === 'production'`. `backend/tests/realtime-sfu.test.ts` includes and passes the production-404 assertion. |
| Debug getters are read-only | PASS | `frontend/src/app/pages/room/room.page.ts` adds only one-line `__meetDebug` getters: `sfuLastRecoveryEvent`, `sfuRejoinThrottled`, and `sfuPublishRecoveryFailed`, plus type declarations. They expose existing `SfuClientService` signals and do not mutate behavior. |
| Fault targeting scope | PASS | `matchLocation` is added only in `backend/src/modules/realtime-sfu/sfu-fault-inject.ts` and used by the test-only route/rules to target subscribe direction. It is fault-injection plumbing, not recovery logic. |
| No recovery-logic scope creep | PASS | `git diff -- frontend/src/app/services/sfu-client.service.ts` is empty. |
| Backend targeted suite | PASS | `npm test -w backend -- realtime-sfu` → `tests/realtime-sfu.test.ts (7 tests)` passed. |
| Full backend non-pass claim | PASS | `npm test -w backend` → `33 passed | 1 skipped (34)`, `244 passed | 1 skipped (245)`. The non-pass is a skip (`tests/llm-smoke.test.ts`), not a B6 failure. |

## Red-Team Notes

- The tests are not green shells: they assert the faulted state first (`subscribedTrackCount` drops), then assert recovery using both subscription restoration and inbound RTP byte advancement.
- The 5-person coalescing proof samples `lastRecoveryEvent` epochs below the 15s full-rejoin throttle window and requires exactly one `sfu-rejoin` epoch for 3 simultaneous failures.
- Screenshots were regenerated during the independent e2e run: `screenshots/b6a-recovered.png` and `screenshots/b6b-recovered.png`.

STATUS: REPRO-CLEARED-ON-LOCAL — B6 local capstone independently passed; real recovery proven, prod-gated, no recovery-logic scope creep.
