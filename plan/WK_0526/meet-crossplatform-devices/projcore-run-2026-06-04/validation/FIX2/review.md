# FIX2 Review

## Scope
Touched only:
- `frontend/src/app/services/sfu-client.service.ts`
- `frontend/src/app/services/sfu-client.spec.ts`

## Review findings
- PASS: mid-call retry is separate from `subscribeRetryAttempts` and `subscribeFirstFrameAt`.
- PASS: retry derives missing tracks from live publisher advertisement and actual subscribed state (`midToEntry` + `subscribedTracks`).
- PASS: retry calls `doSubscribeTracks()` directly and does not rely on the room-page `subscribeRetryVersion` effect.
- PASS: cap uses `SUBSCRIBE_RETRY_CAP` via `planSubscribeRetry()` and leaves no dangling timer.
- PASS: removed track, changed `cfSessionId`, and already-subscribed state stop retry.
- PASS: teardown paths clear timers and counters.
- PASS: join retry, transactional rollback, reconcile, and transport recovery were not modified.

## Residual risk
Real-device confirmation remains JROM's seat. The deterministic unit tests cover the retry mechanism but do not force a live CF transient race.
