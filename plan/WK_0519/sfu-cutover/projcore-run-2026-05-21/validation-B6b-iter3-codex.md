# B6b Iter3 Independent Validation - Codex

Date: 2026-05-22
Branch: feat/sfu-cutover
Commit validated: 40b1782abb23a11bb0c087c058e1663e66598bb5

## Scope

Re-validated B6b iter3 after iter2 failed on duplicate empty `mid` reconciliation. Validation was read-only for source files; this report is the only file written.

## Code Inspection

PASS - `frontend/src/app/services/sfu-mid-reconcile.ts`

- New pure helper `reconcileSubscribedMids(responseTracks, newTransceiverMids, trackKindMap, publisherClientId)` matches `responseTracks[i]` to `newTransceiverMids[i]` positionally.
- The helper does not build any map keyed by `rt.mid`, so duplicate/empty Cloudflare response mids cannot collide inside the helper.
- It returns reconciled rows using `realMid` from the new transceiver mid list and preserves `trackName`, `kind`, and `publisherClientId`.

PASS - `frontend/src/app/services/sfu-client.service.ts`

- Imports and uses `reconcileSubscribedMids`.
- On the renegotiation path, existing non-empty transceiver mids are snapshotted before subscribe POST.
- After `setRemoteDescription/createAnswer/setLocalDescription`, the service derives `newTransceiverMids` from current transceivers and filters to non-empty mids not present before the subscribe.
- The old collision-prone seeding by `rt.mid` is gone from the renegotiation path. Entries are stored in `midToEntry` and `nextSubscribed` only after reconciliation, keyed by `r.realMid`.
- The no-renegotiation path still skips empty `rt.mid` before storing.

PASS - `frontend/src/app/services/sfu-client.spec.ts`

- Contains explicit duplicate-empty-mid collision coverage:
  - two `responseTracks` entries, audio and video, both with `mid: ''`;
  - two real mids `['2', '3']`;
  - assertions verify audio maps to real mid `2` and kind `audio`, and video maps to real mid `3` and kind `video`.

PASS - `frontend/src/app/services/webrtc.service.ts`

- `git diff --stat 40b1782^ 40b1782 -- frontend/src/app/services/webrtc.service.ts` produced no diff.
- `git diff -- frontend/src/app/services/webrtc.service.ts` produced no worktree diff.
- Mesh WebRTC service is unchanged.

## Unit Validation

Commands run from `frontend/`:

```bash
npx tsc -p tsconfig.spec.json
node out-tsc/spec/sfu-client.spec.js
```

Result: PASS

Observed output:

```text
sfu-client roster utils: all assertions passed
```

This includes the duplicate `mid: ''` audio+video reconciliation case.

## E2E Validation

Requested command run from repo root:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b6b3-val.sqlite npm test -w e2e -- tests/sfu-b6b-layer-pref tests/sfu-b4a-subscribe tests/sfu-b6a-simulcast --config=playwright.config.ts --workers=1
```

First run result: FAIL, then retried for final gate.

- PASS: `tests/sfu-b4a-subscribe`
- PASS: `tests/sfu-b6a-simulcast`
- FAIL: `tests/sfu-b6b-layer-pref`
- Failure detail: timed out waiting for captured `PUT /api/sfu/tracks/update` response count to become `> 0` at `e2e/tests/sfu-b6b-layer-pref/sfu-layer-pref.spec.ts:148`.

Focused retry of failing suite:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b6b3-val-retry.sqlite npm test -w e2e -- tests/sfu-b6b-layer-pref --config=playwright.config.ts --workers=1
```

Result: PASS - 1 passed.

Final rerun of the exact requested three-suite command:

```text
Running 3 tests using 1 worker

  ✓  1 [chromium] › tests/sfu-b4a-subscribe/sfu-subscribe.spec.ts:57:1 › B4a: two SFU clients each receive audio+video from the other through Cloudflare (6.4s)
  ✓  2 [chromium] › tests/sfu-b6a-simulcast/sfu-simulcast.spec.ts:58:1 › B6a: camera video published with simulcast encodings (h/m/l); 2-client regression (video flows) (5.8s)
  ✓  3 [chromium] › tests/sfu-b6b-layer-pref/sfu-layer-pref.spec.ts:68:1 › B6b: subscribe preferredRid h(desktop) / l(mobile); update preserves stream (5.8s)

  3 passed (27.9s)
```

Final result: PASS. The exact requested command passes on rerun after one transient B6b miss.

STATUS: VALIDATED-PASS
