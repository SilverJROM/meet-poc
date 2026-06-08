# codex55 CODE red-team CR10 (lens L10: security-fix completeness + recent-change re-sweep)

## clientKey strip: complete everywhere? admission/reconnect intact? (file:line)

Not complete for all readable surfaces.

New diagnostics rows are stripped before `payload_json` persistence: `appendDiagnosticsEntry()` extracts `participantClientKey` for the private attribution column, removes `clientKey` from `persistedPayload`, and serializes only that stripped object (`backend/src/modules/sessions/store.ts:273`, `backend/src/modules/sessions/store.ts:274`, `backend/src/modules/sessions/store.ts:282`). The private `participant_client_key` column is still populated for attribution/reconnect matching (`backend/src/modules/sessions/store.ts:296`, `backend/src/modules/sessions/store.ts:313`), and read queries no longer select it in detail/entry mapping (`backend/src/modules/sessions/store.ts:411`, `backend/src/modules/sessions/store.ts:470`).

Admission/reconnect are intact: the POST route reads `body.clientKey` before persistence and passes it to `isAdmittedDiagnosticPoster()` (`backend/src/modules/sessions/index.ts:155`, `backend/src/modules/sessions/index.ts:159`, `backend/src/modules/sessions/index.ts:163`); signaling still matches admitted/reconnecting peers and durable identities by `clientKey` + `participantId` (`backend/src/modules/signaling/index.ts:500`, `backend/src/modules/signaling/index.ts:511`, `backend/src/modules/signaling/index.ts:517`, `backend/src/modules/signaling/index.ts:532`). Reconnect admission also still stores and resumes by `clientKey` (`backend/src/modules/signaling/index.ts:913`, `backend/src/modules/signaling/index.ts:918`, `backend/src/modules/signaling/index.ts:985`).

Coverage exists for new-row stripping + admission/reconnect: G-1 asserts response payload/detail/download omit `clientKey` while the DB attribution column remains populated (`backend/tests/session-diagnostics.test.ts:551`, `backend/tests/session-diagnostics.test.ts:564`, `backend/tests/session-diagnostics.test.ts:566`, `backend/tests/session-diagnostics.test.ts:580`, `backend/tests/session-diagnostics.test.ts:584`); G-2 accepts durable re-post without `clientId` (`backend/tests/session-diagnostics.test.ts:597`); G-3 rejects a never-admitted key (`backend/tests/session-diagnostics.test.ts:639`).

## CR-fix-6/7 correctness: OK or issue

OK. `remoteAudioBlocked` is derived from the same `remoteAudioBlockingReason()` used for diagnostics, so the aggregate and per-publisher reason cannot disagree (`frontend/src/app/services/remote-audio.service.ts:630`, `frontend/src/app/services/remote-audio.service.ts:648`). `default-fallback` is not a block reason; only sink timeout/failed, voice stall, or true autoplay/paused state blocks (`frontend/src/app/services/remote-audio.service.ts:648`, `frontend/src/app/services/remote-audio.service.ts:649`, `frontend/src/app/services/remote-audio.service.ts:652`). `selectedSpeakerUnavailable` now resets at both preflight start and cleanup (`frontend/src/app/pages/room/room.page.ts:2175`, `frontend/src/app/pages/room/room.page.ts:2455`) and is set on actual output failures/fallbacks in the in-call output paths (`frontend/src/app/pages/room/room.page.ts:1019`, `frontend/src/app/pages/room/room.page.ts:1027`, `frontend/src/app/pages/room/room.page.ts:2639`).

## Regression / old-row leak / beacon path: OK or gap

Gap: old rows can still leak raw `clientKey`. The fix is store-time only. `toDiagnosticEntry()` maps `row.payload_json` through `parsePayload()` (`backend/src/modules/sessions/store.ts:118`), and `parsePayload()` returns parsed `payload_json` as-is (`backend/src/modules/sessions/store.ts:539`, `backend/src/modules/sessions/store.ts:542`). Both detail/download map that payload directly into readable API responses (`backend/src/modules/sessions/index.ts:129`, `backend/src/modules/sessions/index.ts:138`, `backend/src/modules/sessions/index.ts:143`, `backend/src/modules/sessions/index.ts:151`). Therefore any pre-CR-fix-8 row whose `payload_json` already contains `clientKey` remains readable through `/api/meeting-sessions/:sessionId/diagnostics` and `/api/meeting-sessions/:sessionId/diagnostics.json`.

Beacon vs fetch is OK for new writes: both use the same `DiagnosticsPostPayload` containing `clientKey` (`frontend/src/app/services/meeting-sessions.service.ts:416`) and post/beacon to the same backend route (`frontend/src/app/services/meeting-sessions.service.ts:472`, `frontend/src/app/services/meeting-sessions.service.ts:476`), which authenticates first then strips before storage. The diagnostics page does not reference `payload.clientKey` (`frontend/src/app/pages/diagnostics/diagnostics.page.ts` grep found no `clientKey` usage). Admin diagnostics settings expose only the global kill-switch, not diagnostic payloads (`backend/src/modules/admin/index.ts:74`, `backend/src/modules/admin/index.ts:78`).

## NEW bugs (table)

| Severity | Bug | Evidence | Impact |
|---|---|---|---|
| High | OLD `meeting_session_diagnostics.payload_json` rows with `clientKey` are not scrubbed at read time. | Store strips only on append (`backend/src/modules/sessions/store.ts:273`-`282`), but `parsePayload()` returns old JSON unchanged (`backend/src/modules/sessions/store.ts:539`-`542`), and detail/download expose `entry.payload` directly (`backend/src/modules/sessions/index.ts:138`, `backend/src/modules/sessions/index.ts:151`). | CR10 requirement says verify clientKey is gone from ALL readable surfaces including OLD rows; currently old rows remain readable to the room owner/export user. |

Verification run:
- `npm test -w backend -- tests/session-diagnostics.test.ts` PASS, 13/13.
- `npx tsx frontend/src/app/services/remote-audio.service.spec.ts && npx tsx frontend/src/app/services/remote-audio-watchdog.spec.ts && npx tsx frontend/src/app/pages/room/room-decisions.spec.ts && npx tsx frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts` PASS.
- Initial repo-root `npm test -- --run ...` attempts failed because the root script routes to the backend workspace while the provided filters were repo-root/frontend paths; corrected commands above.

STATUS: BUGS — old diagnostic rows can still expose raw clientKey through detail/download readable surfaces.
