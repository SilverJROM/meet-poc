# changes — B7 iter2 fix

## Exact broken link found

**Main bug — `doSubscribeTracks` silent no-op on CF `not_found_track_error`**

After B drops and reconnects (new CF session, new clientId), A subscribes to B-new
within ~4ms of B's CF publish completing. Cloudflare's `POST /api/sfu/tracks`
(location:remote) returned:
```json
{"requiresImmediateRenegotiation":false,"tracks":[{"mid":"","errorCode":"not_found_track_error",...}]}
```
CF's internal track propagation hadn't completed yet. The response fell into the
`else` branch in `doSubscribeTracks`, which skipped all tracks with `mid:""`.
No throw → `subscribeIfNeeded.catch()` never fired → `subscribedClientIds` retained
B-new → zero retries → `subscribedTracks` stayed 0 for the full 180s.

**Secondary bug — `doClose` ignoring CF's renegotiation response**

`doClose` (used by `tearDownPeerSubscription` when A stops receiving B-old's tracks)
called `PUT /api/sfu/tracks/close` typed as `void`, discarding the response body
entirely. Unlike `doStopScreen`, it never processed `requiresImmediateRenegotiation`.
The close also returned HTTP 400 (CF rejects remote-subscriber track closes) which
was not caught.

## Fix (commit c8b6182)

**File: `frontend/src/app/services/sfu-client.service.ts`**

1. `doSubscribeTracks` — after the POST response, scan `res.tracks` for any entry
   with `errorCode`. If found, throw `"[sfu] CF subscribe not ready: {errorCode}"`.
   The existing `subscribeIfNeeded.catch()` handler clears `subscribedClientIds` and
   bumps `subscribeRetryVersion`; the Angular effect fires, calls `subscribeIfNeeded`
   again, re-enqueues, retries. The retry (≥100ms later via HTTP round-trip) succeeds
   once CF's propagation completes.

2. `doClose` — typed response as `CloseResp`, wrapped PUT in try/catch (HTTP 400
   from CF is silently swallowed — CF auto-GCs remote tracks on session expiry).
   Added renegotiation handling: if CF returns `requiresImmediateRenegotiation:true`,
   apply the offer → createAnswer → setLocalDescription → PUT renegotiate (matching
   the pattern in `doStopScreen`). Inner try/catch guards against partial-stale-PC
   edge cases.

## Evidence

Playwright trace analysis (ctx1 = A's page, ctx2 = B-new's page):
- `doClose PUT failed: HttpErrorResponse` (400 "Body JSON validation error: force")
- `doSubscribeTracks existingMids=0,1,2,3` — B-old's mids 2,3 still in PC
- `requiresImmediateRenegotiation:false` + `errorCode:not_found_track_error` in 779-byte response
- No `after reneg` log → subscribe silently stored nothing → infinite stuck

## Test results

Run 1: 4/4 PASS (32.8s) — B7-drop 8.1s, B7-exit 6.7s, B7-regression-B4a 5.6s, B4a 7.1s  
Run 2: 4/4 PASS (26.4s) — B7-drop 6.7s, B7-exit 4.6s, B7-regression-B4a 4.6s, B4a 5.1s

## IMPL-2 — reclaim-safe subscribe mid binding

Changed `frontend/src/app/services/sfu-client.service.ts` so subscribe mid binding now uses one shared guard in both the renegotiation and no-renegotiation branches:
- same publisher + trackName is idempotent
- stale cross-publisher mappings are reclaimed in place
- live cross-publisher mid conflicts warn once per conflict key and throw through the existing rollback/retry path

Added `frontend/src/app/services/sfu-client.spec.ts` coverage for two concurrent audio publishers, live mid collision rollback without orphaning the existing publisher, warning de-dupe across repeated conflict retries, and stale mid reclaim.

Verification:
- `cd frontend && npx tsx src/app/services/sfu-client.spec.ts` = 0
- `cd frontend && npx tsc --noEmit` = 0

## IMPL-3 — remote-audio playout diagnostics

Added next-call playout evidence so diagnostics can distinguish decode, autoplay, and selected-speaker routing issues:
- `frontend/src/app/services/sfu-client.service.ts` now captures Chrome `media-playout` stats (`audioLevel`, `totalAudioEnergy`, `totalSamplesDuration`) and preserves inbound RTP `totalAudioEnergy` when present.
- `frontend/src/app/services/remote-audio.service.ts` now exposes `playoutDiagnostics()` from the registry: selected output, unlock state, blocked publishers, and per-publisher audio element state.
- `frontend/src/app/pages/room/room.page.ts` now includes optional `selectedAudioOutputId` and `remoteAudioPlayout` in diagnostics payloads.
- `frontend/src/app/pages/diagnostics/diagnostics.page.ts/.html` now render optional per-publisher playout rows with redacted sink labels (`default`, `selected`, or short hash), so old diagnostics rows without the new fields still render.

Interpretation tuple:
- reached selected speaker = `mediaPlayout.totalAudioEnergy` rising AND `element.paused === false` AND `element.sinkId === selectedAudioOutputId`
- energy rising but `sinkId !== selectedAudioOutputId` = sink/device issue
- element exists but paused = autoplay/blocked
- no registry entry for a live publisher = wiring/subscribe issue

Verification:
- `npx tsx frontend/src/app/services/sfu-client.spec.ts` = 0
- `npx tsx frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts` = 0
- `npx tsc -p frontend/tsconfig.app.json --noEmit` = 0

## CR-FIX-1 — code red-team fixes

Fixed the CR1 findings in the frontend media path:
- `frontend/src/app/services/remote-audio.service.ts` — added a per-publisher `voiceStalled` latch set by the remote voice watchdog recovery path. The latch keeps `remoteAudioBlocked` true even when `play()` succeeds and the element is unpaused, and clears only when the room watchdog observes emitted-count advancement. `reset()` now clears sticky unlock and per-call sink selection.
- `frontend/src/app/pages/room/room.page.ts/.html` and `frontend/src/app/components/tile/tile.component.ts` — kept watchdog replay behavior, added emitted-advance latch clearing, and removed dead mixer-era tile bindings/view-child attachment.
- `frontend/src/app/services/sfu-client.service.ts` — protected subscribe renegotiation rollback by snapshotting remote stream signals and deferring pending `ontrack` flush until after renegotiation commit, preventing ghost streams after failed renegotiation.
- `frontend/src/app/pages/diagnostics/diagnostics.page.ts/.html` — moved call-wide `mediaPlayout` to its own row and made per-publisher rows use inbound per-publisher audio level/energy.

Added/updated tests:
- silent-live watchdog verdict latches banner while `el.paused=false`, then clears on emitted advance
- `syncPeers` replaces a publisher when the audio track changes on the same stream
- `reset()` clears `unlocked`
- failed subscribe renegotiation leaves no ghost remote stream

Verification:
- `npx tsx frontend/src/app/services/remote-audio.service.spec.ts` = 0
- `npx tsx frontend/src/app/services/sfu-client.spec.ts` = 0
- `npx tsx frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts` = 0
- `npx tsc -p frontend/tsconfig.app.json --noEmit false` = 0
- `npx tsc -p frontend/tsconfig.app.json --noEmit=0` = rejected by TypeScript as an unknown option spelling (`TS5025`); supported equivalent above passed
- `npm run build -w frontend` = 0 (existing Ionic empty-glob and MediaPipe CommonJS warnings only)

## CR-FIX-3 — selected-speaker fallback, SFU warning cleanup, watchdog cap UX

Fixed the CR4 findings in the frontend media path:
- `frontend/src/app/services/remote-audio.service.ts` now returns sink routing status as `selected`, `default-fallback`, or `failed`; diagnostics keep the requested `selectedAudioOutputId` while separately reporting `effectiveSinkId` and `usedFallback`.
- `frontend/src/app/pages/room/room.page.ts/.html` now surfaces selected-speaker fallback as a distinct “Selected speaker unavailable. Using system default.” notice, separate from the autoplay “Tap to enable audio” banner. The user’s selected speaker remains stored and fallback clears when the selected sink later succeeds.
- `frontend/src/app/services/sfu-client.service.ts` clears `subscribeMidConflictWarnings` in `clearLocalTransportSessionState`, `closeLiveTracksForExit`, and `destroy`.
- The remote voice watchdog keeps the voice-stall banner latched when the bounded recovery window is exhausted while bytes and voice energy still indicate stalled playout.

Added/updated tests:
- selected `setSinkId` reject + default success reports `default-fallback`, keeps selected sink in diagnostics, records default as effective, and clears fallback after selected success
- `subscribeMidConflictWarnings` clears in all teardown paths
- watchdog attempt-cap helper reports the still-stalled exhausted-window condition

Verification:
- `npx tsx frontend/src/app/services/remote-audio.service.spec.ts` = 0
- `npx tsx frontend/src/app/services/remote-audio-watchdog.spec.ts` = 0
- `npx tsx frontend/src/app/services/sfu-client.spec.ts` = 0
- `npx tsx frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts` = 0
- `cd frontend && npx tsc --noEmit` = 0
- `cd frontend && npx ng build` = 0 (existing Ionic empty-glob and MediaPipe CommonJS warnings only)

## CR-FIX-5 — B5 renegotiating subscribe recovery and playout observability

Fixed the CR6 findings in the frontend media path:
- `frontend/src/app/services/sfu-client.service.ts` now treats live cross-publisher MID conflicts as a separate recovery class: they warn loudly, roll back, force a bounded/idempotent renegotiating subscribe retry with fresh MIDs, and do not increment the permanent-stop subscribe retry caps.
- `frontend/src/app/services/remote-audio.service.ts` and `frontend/src/app/services/meeting-sessions.service.ts` now carry per-publisher `blockedReason`, `sinkApplyResult`, and `sinkApplyTimedOut` diagnostics.
- `frontend/src/app/pages/room/room.page.ts` now emits advertised SFU remote publishers in diagnostics `peers`, including advertised audio track names and subscribed/not-subscribed status.
- `frontend/src/app/pages/diagnostics/diagnostics.page.ts/.html` now render per-publisher blocked reason and sink-apply outcome.

Added/updated tests:
- live MID conflict preserves the existing live publisher, forces a renegotiating retry for the new publisher, converges on a fresh MID, and leaves permanent-stop retry counters empty
- R1 selected-sink audible outcome: inbound publisher element is playing on selected sink with `blockedReason=null`
- R2 two-publisher outcome: A and B are simultaneously registered/audible with correct sink/volume; removing A leaves B audible
- diagnostics row formatting covers blocked reason and sink apply fields

Verification:
- `cd frontend && npx tsx src/app/services/remote-audio.service.spec.ts` = 0
- `cd frontend && npx tsx src/app/services/sfu-client.spec.ts` = 0
- `cd frontend && npx tsx src/app/pages/diagnostics/diagnostics.page.spec.ts` = 0
- `cd frontend && npx tsc --noEmit` = 0
- `cd frontend && npx ng build` = 0 (existing Ionic empty-glob and MediaPipe CommonJS warnings only)

## CR-FIX-6 — remote audio blocked-state consistency and stale sink reset guard

Fixed the CR7 blocked-state consistency cluster:
- `frontend/src/app/services/remote-audio.service.ts` now derives aggregate `remoteAudioBlocked`, debug/diagnostic `blockedPeerIds`, per-publisher `blockedReason`, and `allSinksPlaying()` from one blocking predicate.
- Playing `default-fallback` and `unsupported` sink routes are non-blocking and report `blockedReason=null`; only `failed`/timed-out sink routing reports `sink-failed`.
- Successful sink re-apply always records the latest `sinkApplyResult`, clears `sinkApplyTimedOut`, and clears stale `blocked` when the entry is audible.
- Sink apply continuations now guard post-await entry writes with current-entry/generation checks, including aggregate fallback-state updates after reset.
- `frontend/src/app/pages/room/room.page.ts` resets `selectedSpeakerUnavailable=false` in `cleanupCall()`.

Added/updated tests:
- playing default fallback and unsupported sink routing do not raise the tap-to-enable banner and have no blocked reason
- selected+default sink failure raises `sink-failed`, and later selected success clears stale `failed`, timeout, reason, and aggregate blocked state
- sink apply resolving after reset cannot restore selected/effective/fallback state or relatch the aggregate banner

Verification:
- `npx tsc --noEmit -p frontend/tsconfig.app.json` = 0
- `npx tsx frontend/src/app/services/remote-audio.service.spec.ts` = 0
- `npx tsx frontend/src/app/pages/room/room-decisions.spec.ts` = 0
- `npm run build -w frontend` = 0 (existing Ionic empty-glob and MediaPipe CommonJS warnings only)

## CR-FIX-8 — diagnostics clientKey read-surface redaction

Fixed the owner-readable diagnostics credential exposure while preserving diagnostics POST authorization and reconnect/admission matching:
- `backend/src/modules/sessions/store.ts` still reads `payload.clientKey` and stores it in the internal `participant_client_key` column, but strips `clientKey` before serializing `payload_json`.
- Diagnostics entry reads no longer SELECT `participant_client_key`; list/detail/download response objects only expose participant id/name and sanitized payload JSON.
- `frontend/src/app/services/meeting-sessions.service.ts` now separates readable `DiagnosticsPayload` from transport-only `DiagnosticsPostPayload`, so diagnostics READ paths do not depend on `payload.clientKey`; the room page still sends `clientKey` only for POST/auth.

Added/updated tests:
- durable admitted guest diagnostics POST still succeeds after reconnect grace expiry
- DB `participant_client_key` remains populated for matching while stored `payload_json` has no `clientKey`
- POST response, diagnostics detail response, and diagnostics download response expose no `clientKey`, `participant_client_key`, or `participantClientKey`

Verification:
- `npm test -w backend -- session-diagnostics` = 0
- `npm test -w backend -- admin-diagnostics-killswitch` = 0
- `npm run build -w backend` = 0
- `cd frontend && npx tsc --noEmit` = 0
- `npm test -w backend` = 0 (166 passed, 1 skipped)

## CR-FIX-9 — legacy diagnostics clientKey read-time redaction

Closed the old-row diagnostics credential leak:
- `backend/src/modules/sessions/store.ts` now redacts `clientKey` in `parsePayload()`, so legacy `payload_json` rows are sanitized on every read path before detail/download/list responses can map entry payloads.
- The existing store-time strip remains in place, preserving the internal `participant_client_key` column for admission/reconnect matching without exposing it in API responses.
- `frontend/src/app/pages/room/room.page.ts` now treats a failed selected-speaker refresh as selected-speaker unavailable, matching the existing devicechange behavior. `default-fallback` remains unavailable/info only; `failed` remains the truly blocked/silent case through remote audio blocked state.

Added/updated tests:
- inserted a legacy diagnostics row directly into `meeting_session_diagnostics` with `clientKey` still present in `payload_json`
- verified both diagnostics detail and diagnostics download omit `payload.clientKey` while preserving non-secret payload fields

Verification:
- `npm test -w backend -- session-diagnostics` = 0
- `npm test -w backend -- admin-diagnostics-killswitch sessions-api sessions-lifecycle sessions-ttl` = 0
- `cd frontend && npx tsc --noEmit` = 0
