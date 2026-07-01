# Batch-SS self-review (R7)

## Diff shape
- `room.page.ts`: 1 computed changed from 4 lines to 5 (1 line net), + icon import/registration (2 lines).
- `room.page.html`: share-stage block restructured into an `@if (presenter.isLocal)` branch (net +14 lines).
- `room.page.scss`: +25 lines, new isolated selector block, no existing rules touched.
- 4 existing e2e specs: 1 assertion block swapped each (net ~+2 to +4 lines per file).
- 1 new e2e spec (~120 lines).
- 3 shared e2e fixture files touched for pre-existing, unrelated breakage (see changes.md) —
  each a mechanical locator fix, zero app-code impact.

## Why each swapped assertion is non-vacuous (redteam ask #2)
Each of the 4 files previously asserted the LOCAL presenter's own share-stage rendered a live
`app-tile`/`video` — i.e. they encoded the pre-fix bug as expected behavior. Each swap now
asserts the opposite of what a vacuous/weakened test would do:
- `.share-stage .presenting-placeholder` is `toBeVisible()` (not just "exists" or removed).
- `.share-stage app-tile` / `.share-stage app-tile video` is `toHaveCount(0)` (an explicit
  negative assertion — a test that "deleted coverage" would simply remove these lines, not
  add a stronger negative check).
- `tilefix.spec.ts`'s swap additionally strengthens the ORIGINAL intent (no CSS-mirror on the
  presented screen) into a strictly stronger check (no video content at all, mirrored or not)
  — see the inline comment there.

## R7b verification note
The very first version of the new spec used a static (non-redrawn) `canvas.captureStream()`
for the fake screen share. That is sufficient for a same-page `<video>` to show a frame
locally, but NOT sufficient for the real SFU (Cloudflare Calls — confirmed via
`sfuPublishState.cfSessionId` in `__meetDebug`) to relay a decodable stream to a remote
subscriber: `remoteScreenStreams` stayed empty indefinitely on the guest side even after 30s,
while a control experiment (remote CAMERA subscribe, using Chromium's real fake-camera device)
succeeded in under a second. Root cause: a canvas that's never repainted only ever emits one
frame, which isn't enough for the encoder/relay pipeline. Fixed by repainting the canvas every
200ms. This was a test-fixture gap, not a product bug — no existing spec in this repo
previously asserted remote reception of shared-screen video content (all existing specs only
assert from the sharer's own page, or check `RTCRtpSender` params on the sending side).

## Scope boundary self-check (redteam ask #3)
- `sfu-client.service.ts`, `sfu-recovery-coordinator.ts` and all R1–R6 code: 0 lines touched
  (confirmed via `git diff --stat` — not listed in the changed-files set at all).
- Camera/self-PIP tile logic (`effectiveLocalStream`, `effectiveCameraOn`,
  `isMirroredSelfView`): 0 lines touched. (`tilefix.spec.ts` DR-30's pre-existing failure is
  IN this logic, discovered but explicitly not touched per brief.)
- `remoteScreenStreams`: read, not written, in the unchanged remote branch of `shareStream`.

## Residual risk
- The 2 blocked specs (share-camera-cut DR-53, tilefix DR-30) cannot be driven to full green
  without either (a) new SFU-client debug instrumentation or (b) fixing a camera-mirror
  regression — both explicitly out of scope. Recommend filing these as separate follow-up
  tickets rather than silently leaving them broken with no record.
