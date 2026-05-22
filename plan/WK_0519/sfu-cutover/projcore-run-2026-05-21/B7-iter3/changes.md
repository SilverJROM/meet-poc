# B7 iter3 — Bound subscribe retry

## Root cause
`subscribeIfNeeded().catch()` cleared the guard + bumped `subscribeRetryVersion` unconditionally on every failure. If CF kept returning `not_found_track_error` (or any persistent subscribe error) for a publisher, this retried forever at HTTP-round-trip cadence — no attempt cap, no backoff, no terminal state.

## Fix (`frontend/src/app/services/sfu-client.service.ts`)

**New fields:**
- `subscribeRetryAttempts: Map<string, number>` — per-publisher failure counter
- `SUBSCRIBE_RETRY_CAP = 7` — max attempts before permanent stop

**`subscribeIfNeeded().catch()` — bounded retry with exponential backoff:**
- Increment per-publisher attempt counter on each failure
- If `attempts > 7`: log warning, return without clearing guard → permanently blocked for this publisher (no more retries until cfSessionId changes)
- Otherwise: compute `backoffMs = min(250 * 2^(attempts-1), 4000)` (250ms → 500 → 1s → 2s → 4s, capped), clear guard, `setTimeout(() => subscribeRetryVersion.update(...), backoffMs)`
- Total window before cap: ~16s — well within the ~30s ceiling

**Reset paths (counter cleared → fresh attempts allowed):**
- `doSubscribe` success: `subscribeRetryAttempts.delete(publisher.clientId)` — successful subscribe resets count
- `handleSfuPresence` cfSessionId change: delete attempts + clear guard for that clientId — publisher reconnected with new session, fresh subscribe should proceed
- `tearDownPeerSubscription`: delete entry for departing peer
- `resetForReconnect`: clear entire map
- `destroy`: clear entire map

## What was preserved
- Happy path and transient `not_found_track_error` retry (attempt 1-2 succeeds as before)
- Drop-reconnect mechanics, doClose 400 handling, reconnect state machine — unchanged

## Test results
Run 1 (`/tmp/meet-sfu-b7iter3-run1.sqlite`): 4/4 PASS (29.1s)
Run 2 (`/tmp/meet-sfu-b7iter3-run2.sqlite`): 4/4 PASS (25.7s)

- `B4a: two SFU clients each receive audio+video` ✓
- `B7-drop: reconnect creates new CF session, A sees B again with no ghost tile` ✓
- `B7-exit: deliberate leave removes B tile from A immediately` ✓
- `B7-regression-B4a` ✓
