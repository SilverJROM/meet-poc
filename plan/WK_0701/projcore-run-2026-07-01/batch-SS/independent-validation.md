# Batch-SS independent validation (R7)

Validator: codex55  
Dispatch marker: `DISPATCH-batch-SS-validator-2877458-1782914769`  
Verdict: **REPRO-CLEARED-ON-LOCAL**

## Required rerun

Command:

```bash
cd e2e && E2E_BASE_URL=http://localhost:4810 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 timeout 4m npx playwright test tests/batch-ss-presenting-placeholder --config=playwright.config.ts --workers=1
```

Result: **PASS** — 1 test passed in 14.1s.

## R7a: no local self-mirror

**PASS.**

- `frontend/src/app/pages/room/room.page.ts` now returns `null` from `shareStream()` when `sharingPeer().isLocal`.
- `frontend/src/app/pages/room/room.page.html` branches on `presenter.isLocal` and renders `.presenting-placeholder` with "You're presenting" instead of an `app-tile`.
- The new spec asserts:
  - `.share-stage .presenting-placeholder` is visible.
  - Placeholder text contains `You're presenting`.
  - `.share-stage app-tile` count is `0`.
  - `.share-stage video` count is `0`.
- Screenshot `screenshots/presenter-placeholder.png` shows the host in share layout with the desktop icon + "You're presenting" placeholder, not a local screen video.

## R7b: remote share unaffected

**PASS.**

- The outbound publish path in `executeScreenToggle()` still calls `this.sfuClient.publishScreen(track)` when a new screen track starts.
- The remote render path remains the non-local `app-tile [displayStream]="shareStream()"` branch.
- `shareStream()` still reads remote shares from `this.sfuClient.remoteScreenStreams().get(peer.id)`.
- `frontend/src/app/services/sfu-client.service.ts` has **0 diff** in this batch.
- The new spec asserts the guest enters share layout and sees `.share-stage app-tile video`, with no `.presenting-placeholder`.

Additional non-vacuous check:

- `app-tile` uses `forceVideo`, so I independently probed the guest page after reproducing the same flow.
- Probe result: guest share video had `srcObject instanceof MediaStream`, `remoteScreenStreams.size === 1`, `videoWidth === 1280`, `videoHeight === 720`, `readyState === 4`, `paused === false`, and advancing `currentTime`.
- `screenshots/remote-sees-share.png` is not blank/login; it shows the guest in share layout with the remote host as presenter. The video bitmap is dark in the screenshot capture, so the direct media probe above is the stronger proof that this is a decoded live share stream rather than a vacuous visible element.

## R7c: stop-share returns to grid

**PASS.**

- The new spec clicks `Stop sharing screen`.
- It then asserts `.call-panel.share-layout` count is `0`.
- It also asserts `.tiles-grid app-tile` count is `2`, confirming return to normal grid with host + guest.

## New spec honesty

**PASS.**

`e2e/tests/batch-ss-presenting-placeholder/presenting-placeholder.spec.ts` genuinely covers:

- Host/local presenter placeholder and no video/mirror.
- Guest/remote receiver share-stage video.
- Stop-share grid restoration.

The remote video assertion is indirectly tied to `remoteScreenStreams()` because `sharingPeer()` only activates the remote share layout from that map. I also performed the direct media probe described above to close the remaining `forceVideo` loophole.

## Legacy assertion swaps

**PASS.**

The four named legacy specs now assert the new correct local-presenter behavior rather than deleting coverage:

- `v3-fixc3-share-reflow/share-reflow.spec.ts`: asserts placeholder visible, text present, and `.share-stage app-tile` count `0`.
- `v3-mui-meet-ui/meet-ui.spec.ts`: asserts placeholder visible and `.share-stage app-tile` count `0`.
- `v3-share-camera-cut/share-camera-cut.spec.ts`: asserts placeholder visible and `.share-stage app-tile video` count `0`.
- `v3-tilefix/tilefix.spec.ts`: asserts placeholder visible and `.share-stage app-tile video` count `0`, which is stronger than the old "screen share is not mirrored" expectation for the local presenter.

The touched helper/fixture changes are mechanical e2e drift repairs, not coverage weakening:

- exact login button selector,
- dashboard room-open toggle moved to overflow menu,
- admission via visible knock toast instead of the overlapped participants button,
- stale tilefix camera checkbox label corrected.

## Pre-existing rot confirmation

**PASS.**

- `share-camera-cut.spec.ts` already referenced `window.__meetDebug.senderSnapshot` at `HEAD`. Current production code exposes `window.__meetDebug`, but there is no `senderSnapshot` member in `room.page.ts` or `sfu-client.service.ts`. This failure predates R7 and is unrelated to the placeholder diff.
- `tilefix.spec.ts` already expected the local camera self-view to be mirrored at `HEAD`. Current tile logic sets `isMirroredSelfView` only when the peer is local, video is shown, there is no `displayStream`, and the variant is not `share-main`; this is camera/self-view behavior and was not touched by the R7 diff.
- The project issue note `plan/WK_0701/list/2026-07-01-preexisting-e2e-fixture-rot.md` and decision note `decisions/2026-07-01-ss-preexisting-e2e-fixture-rot.md` record these as pre-existing and out of scope.

## R1-R6 / recovery / camera regression check

**PASS.**

- `git diff -- frontend/src/app/services/sfu-client.service.ts` produced no diff.
- `git diff --numstat -- frontend/src/app/services/sfu-client.service.ts frontend/src/app/services/sfu-recovery-coordinator.ts frontend/src/app/components/tile/tile.component.ts frontend/src/app/components/tile/tile.component.scss frontend/src/app/pages/room/room.page.ts` showed changes only in `room.page.ts` (`7` insertions, `3` deletions).
- The `room.page.ts` diff is limited to `shareStream()` and desktop icon registration/import. Recovery methods and camera/self-PIP/strip tile logic are untouched.

## Final verdict

**REPRO-CLEARED-ON-LOCAL.** R7a, R7b, and R7c hold locally; the new spec passes and is honest; the legacy assertion swaps preserve/strengthen coverage for the new behavior; the two blocked legacy specs are blocked by pre-existing rot; and SFU recovery code has no batch diff.
