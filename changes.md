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
