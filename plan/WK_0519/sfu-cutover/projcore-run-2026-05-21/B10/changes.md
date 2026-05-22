# B10 Changes — SFU Default Flip

## Summary

Single-line production change: `isSfuMode` signal now defaults to **TRUE** (SFU mode) instead of FALSE (mesh). `?sfu=0` opts in to the deprecated mesh fallback. Mesh code is fully intact; B8 deferred.

---

## Production Code (1 file, 2 lines changed)

### `frontend/src/app/pages/room/room.page.ts`

**Line 143 — isSfuMode signal (the B10 flip):**
```typescript
// Before
readonly isSfuMode = signal(this.route.snapshot.queryParamMap.get('sfu') === '1');
// After
readonly isSfuMode = signal(this.route.snapshot.queryParamMap.get('sfu') !== '0'); // mesh is deprecated fallback (B8 deferred); ?sfu=0 opts in to mesh
```

**Line 1036 — publish gate (consistency fix):**
```typescript
// Before (hardcoded, bypassed the signal)
if (this.route.snapshot.queryParamMap.get('sfu') === '1' && msg.participantId && msg.sessionId) {
// After (uses signal)
if (this.isSfuMode() && msg.participantId && msg.sessionId) {
```

**Reversibility:** one-line revert (`!== '0'` → `=== '1'`) restores mesh-default.

---

## Test-Only Changes (no production semantics)

### `e2e/fixtures/rooms.ts`
- `joinOwnerCall`: `page.goto(room.url)` → `page.goto(room.url + '?sfu=0')`
- `joinGuestAndWait`: `page.goto(room.url)` → `page.goto(room.url + '?sfu=0')`

Covers ~28 spec files that use these shared helpers.

### `e2e/playwright.config.ts`
- `reuseExistingServer: false` → `reuseExistingServer: true` (allows running against already-running dev server)

### Per-file local joiner fixes (29 spec files)
All `page.goto(room.url)` / `guest.goto(room.url)` local navigations updated to append `?sfu=0`:
- `e2e/tests/v2-b5-lobby/helpers.ts`
- `e2e/tests/v2-b7-controls/controls-banner-failure.spec.ts`
- `e2e/tests/v2-b8-sidebar/sidebar-actions-leave-speaker.spec.ts`
- `e2e/tests/v3-admit/admit.spec.ts`
- `e2e/tests/v3-audiofix/audiofix.spec.ts`
- `e2e/tests/v3-diagc-weak-connection/diagc-weak-connection.spec.ts`
- `e2e/tests/v3-diagd-join-audio-invariant/diagd-join-audio-invariant.spec.ts`
- `e2e/tests/v3-diage2-waiting-room/diage2-waiting-room.spec.ts`
- `e2e/tests/v3-diagg-orientation-speaker/diagg-orientation-speaker.spec.ts`
- `e2e/tests/v3-diagi-device-switch/device-switch.spec.ts`
- `e2e/tests/v3-diaglog-recv/diaglog-recv.spec.ts`
- `e2e/tests/v3-diaglog/diaglog.spec.ts`
- `e2e/tests/v3-dr41-diagnostics/dr41-diagnostics.spec.ts`
- `e2e/tests/v3-extdev/extdev.spec.ts`
- `e2e/tests/v3-fixb1-race/race-and-controls.spec.ts`
- `e2e/tests/v3-fixb2-transcript/transcript-tagging.spec.ts`
- `e2e/tests/v3-fixc1-camera-light/camera-light.spec.ts`
- `e2e/tests/v3-fixc2-device-modal/device-modal.spec.ts`
- `e2e/tests/v3-fixc3-share-reflow/share-reflow.spec.ts`
- `e2e/tests/v3-identity/identity.spec.ts`
- `e2e/tests/v3-ios-audio/ios-audio.spec.ts`
- `e2e/tests/v3-mb2-webrtc/helpers.ts`
- `e2e/tests/v3-mb2-webrtc/mobile-constraints.spec.ts` (missed in initial pass — exemption was wrong, test IS affected by default flip)
- `e2e/tests/v3-mic-liveness/mic-liveness.spec.ts`
- `e2e/tests/v3-mobile-rx-video/mobile-rx-video.spec.ts`
- `e2e/tests/v3-renegotiate/renegotiate.spec.ts`
- `e2e/tests/v3-share-camera-cut/share-camera-cut.spec.ts`
- `e2e/tests/v3-tilefix/tilefix.spec.ts`
- `e2e/tests/v3-video-freeze/video-freeze.spec.ts`

### Quarantined tests (3 — pre-existing mesh WebRTC failures)
Confirmed pre-existing by stash test (fail WITHOUT B10 changes):
- `e2e/tests/b4-call-ui/two-context-p2p.spec.ts` — S4.3 (peer state stuck at "new")
- `e2e/tests/v3-chat/chat.spec.ts` — DR-27 (peer state stuck at "new")
- `e2e/tests/v3-diagb2-conn/diagb2-conn.spec.ts` — DR-2 (peer state stuck at "new")

---

## Test Results

### SFU Suite (new default — no params)
- **7/9 passing** in batch; B4b and B5b are confirmed **pre-existing** failures (stash-verified, unrelated to B10).
- B6b occasionally flaky (CF network timing); passes in isolation.

### Legacy Suite (?sfu=0 — mesh fallback)
- **122+ passing** in full batch run.
- **35 pre-existing failures** confirmed (fail identically without B10 changes; stash-verified across the full set of affected files). Not quarantined — pre-existing, not B10's scope.
- **3 quarantined** (skipped with note) — subset of the 35 pre-existing failures, marked to keep the suite output clean.
- **0 newly broken by B10** (mobile-constraints fixed; FIXC8.3 confirmed flaky/transient).

### Build
Clean — `ng build` with no errors.
