# gpt54 CODE red-team CR10 (lens L10: security-fix completeness + recent-change re-sweep)
## clientKey strip: complete everywhere? admission/reconnect intact? (file:line)
- New writes are stripped correctly before persistence: `appendDiagnosticsEntry()` removes `clientKey` from `payload_json` while still copying it into the private attribution column for auth/reconnect continuity in [backend/src/modules/sessions/store.ts](/home/agjrom/websites/meet-poc/backend/src/modules/sessions/store.ts:273).
- API mapping no longer returns `participant_client_key`; both detail and download now select/map only public fields in [backend/src/modules/sessions/store.ts](/home/agjrom/websites/meet-poc/backend/src/modules/sessions/store.ts:411) and [backend/src/modules/sessions/index.ts](/home/agjrom/websites/meet-poc/backend/src/modules/sessions/index.ts:56).
- Beacon and fetch share the same POST endpoint, so the strip applies to both paths: beacon/fetch originate in [frontend/src/app/services/meeting-sessions.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/meeting-sessions.service.ts:472) and land in the single POST handler in [backend/src/modules/sessions/index.ts](/home/agjrom/websites/meet-poc/backend/src/modules/sessions/index.ts:155).
- Admission/reconnect still depend on `clientKey` and remain covered: durable diagnostics posting is exercised in [backend/tests/session-diagnostics.test.ts](/home/agjrom/websites/meet-poc/backend/tests/session-diagnostics.test.ts:551), persistent-clientKey reconnect in [backend/tests/signaling-reconnect.test.ts](/home/agjrom/websites/meet-poc/backend/tests/signaling-reconnect.test.ts:79), and SFU authz/token non-leak in [backend/tests/realtime-sfu.test.ts](/home/agjrom/websites/meet-poc/backend/tests/realtime-sfu.test.ts:33).
- Bug: old rows still leak raw `clientKey` on read. `toDiagnosticEntry()` returns `parsePayload(row.payload_json)` verbatim, and `parsePayload()` does no redaction, so any pre-fix row that already stored `payload_json.clientKey` will still be exposed by detail/download/admin diagnostics reads in [backend/src/modules/sessions/store.ts](/home/agjrom/websites/meet-poc/backend/src/modules/sessions/store.ts:104) and [backend/src/modules/sessions/store.ts](/home/agjrom/websites/meet-poc/backend/src/modules/sessions/store.ts:539).
- I found no logging path that prints `clientKey` or CF tokens from these diagnostics/SFU flows. The current logs mention room/client IDs, but not credential payloads; the proxy tests also assert SFU token absence in responses in [backend/tests/realtime-sfu.test.ts](/home/agjrom/websites/meet-poc/backend/tests/realtime-sfu.test.ts:52).

## CR-fix-6/7 correctness: OK or issue
- The blocked-state derivation is now unified on `remoteAudioBlockingReason()` and feeds both `remoteAudioBlocked` and diagnostics rows in [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:630) and [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:648). I did not find a contradiction or stale parallel state machine.
- `selectedSpeakerUnavailable` is reset in both lobby preflight and call cleanup in [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2168) and [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2434). The in-call recovery/effect loop also re-derives remote-audio blocked state from the service rather than a second heuristic in [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:634) and [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2684).
- I did not find a new stuck-state or double-reset bug in CR-fix-6/7 from static review, and the direct assertion scripts passed for `room-decisions`, `remote-audio.service`, and `diagnostics.page`.

## Regression / old-row leak / beacon path: OK or gap
- Gap: old-row leak is real and currently untested. Existing tests only prove that newly inserted rows are stripped, not that legacy rows are sanitized on read; see [backend/tests/session-diagnostics.test.ts](/home/agjrom/websites/meet-poc/backend/tests/session-diagnostics.test.ts:551).
- Beacon path is otherwise OK because it uses the same server handler as fetch.
- Frontend diagnostics no longer require `payload.clientKey`; I found no diagnostics-page read of that field, and the helper assertions passed.

## NEW bugs
| Severity | Bug | Evidence |
|---|---|---|
| High | Legacy diagnostics rows created before CR-fix-8 still expose raw `payload.clientKey` through current diagnostics read endpoints because read-time sanitization is missing. | [backend/src/modules/sessions/store.ts](/home/agjrom/websites/meet-poc/backend/src/modules/sessions/store.ts:104), [backend/src/modules/sessions/store.ts](/home/agjrom/websites/meet-poc/backend/src/modules/sessions/store.ts:539) |

Verification:
- `npm test -w backend -- session-diagnostics.test.ts signaling-reconnect.test.ts realtime-sfu.test.ts` → PASS (`28` tests).
- `node --import tsx frontend/src/app/pages/room/room-decisions.spec.ts` → PASS.
- `node --import tsx frontend/src/app/services/remote-audio.service.spec.ts` → PASS.
- `node --import tsx frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts` → PASS.
- `npm test -w frontend ...` could not be used here because the frontend workspace currently has no Angular `test` target in [frontend/angular.json](/home/agjrom/websites/meet-poc/frontend/angular.json:1).

STATUS: BUGS — legacy diagnostics rows still leak `payload.clientKey` on read
