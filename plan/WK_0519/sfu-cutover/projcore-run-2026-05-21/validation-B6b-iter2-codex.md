# B6b Iter2 Independent Validation - Codex

Date: 2026-05-22
Branch: feat/sfu-cutover
HEAD observed: d2e063f
Target implementation commit: 66db677

## Scope

Re-validated B6b iter2 under Claude /projcore lkvc-38. I did not edit source files.

## Findings

VALIDATED-FAIL.

The e2e fix is materially improved and the requested test command passed, but the source-level mid reconciliation is not sound for duplicate empty mids.

### 1. Empty-mid reconciliation in `sfu-client.service.ts`

Fail.

`doUpdateCameraLayer()` now builds camera update mids from `midToEntry` and only sends entries whose `entry.kind === 'video'`:

- `frontend/src/app/services/sfu-client.service.ts:121-140`

The iter2 reconciliation snapshots existing mids before the remote subscribe POST, then after `setLocalDescription()` finds new transceivers:

- `frontend/src/app/services/sfu-client.service.ts:478-479`
- `frontend/src/app/services/sfu-client.service.ts:505-527`

However, before reconciliation it seeds both `midToEntry` and `nextSubscribed` by `rt.mid`:

- `frontend/src/app/services/sfu-client.service.ts:495-503`

If Cloudflare returns `mid: ""` for more than one response track in the same subscribe response, those entries collide on the same empty-string key. The last empty-mid entry overwrites the earlier ones. The later order-based reconciliation then does:

```ts
const staleEntry = this.midToEntry.get(rt.mid);
```

For repeated `rt.mid === ""`, the first loop iteration can attach the last stale entry to the first new transceiver mid, and subsequent empty-mid response tracks no longer have a stale entry to fix. That can produce a mismatched audio/video mapping or missing mapping. This is not a duplicate-safe order reconciliation.

The e2e run below did prove the observed B6b path no longer returned the previous empty-mid 4xx failure, but I cannot validate the implementation as sound because the map key collision remains in the code path that is meant to fix empty mids.

### 2. E2E update response assertion

Pass.

`e2e/tests/sfu-b6b-layer-pref/sfu-layer-pref.spec.ts` now captures `PUT /api/sfu/tracks/update` responses and asserts HTTP success:

- response capture: `e2e/tests/sfu-b6b-layer-pref/sfu-layer-pref.spec.ts:55-65`
- debug update call: `e2e/tests/sfu-b6b-layer-pref/sfu-layer-pref.spec.ts:140-143`
- response count and `ok` assertion: `e2e/tests/sfu-b6b-layer-pref/sfu-layer-pref.spec.ts:145-151`

This would catch the prior empty-mid rejection because the test awaits an update response and asserts `resp.ok() === true`.

The same spec still asserts desktop subscribe `preferredRid: "h"` and mobile subscribe `preferredRid: "l"`:

- desktop h: `e2e/tests/sfu-b6b-layer-pref/sfu-layer-pref.spec.ts:108-123`
- mobile l: `e2e/tests/sfu-b6b-layer-pref/sfu-layer-pref.spec.ts:125-138`

It also checks inbound video frames after the update:

- `e2e/tests/sfu-b6b-layer-pref/sfu-layer-pref.spec.ts:153-156`

### 3. Mesh WebRTC service unchanged

Pass.

I checked:

```bash
git diff -- frontend/src/app/services/webrtc.service.ts
git diff 66db677^..66db677 -- frontend/src/app/services/webrtc.service.ts
git diff d2e063f^..d2e063f -- frontend/src/app/services/webrtc.service.ts
```

All were empty. Mesh `webrtc.service.ts` is unchanged by the target implementation and callback chore.

### 4. Required e2e command

Pass.

Command run:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b6b2-val.sqlite npm test -w e2e -- tests/sfu-b6b-layer-pref tests/sfu-b4a-subscribe tests/sfu-b6a-simulcast --config=playwright.config.ts --workers=1
```

Result:

```text
Running 3 tests using 1 worker

PASS tests/sfu-b4a-subscribe/sfu-subscribe.spec.ts
PASS tests/sfu-b6a-simulcast/sfu-simulcast.spec.ts
PASS tests/sfu-b6b-layer-pref/sfu-layer-pref.spec.ts

3 passed (28.3s)
```

The B6b test genuinely exercised the update path and received a 2xx response in this run, and the desktop `h`, mobile `l`, and video regression assertions all passed.

## Recommendation

Fix reconciliation so response-track entries are not stored under a possibly duplicate stale mid before real mids are assigned. The safe shape is to reconcile by the ordered `responseTracks`/`newTransceivers` arrays directly, constructing each fixed entry from `responseTracks[i]` plus the matching requested track metadata, then setting `midToEntry`/`subscribedTracks` only under the real mid. Also add a focused test where at least two subscribe response tracks have `mid: ""` so the duplicate-empty-mid case cannot regress.

STATUS: VALIDATED-FAIL
