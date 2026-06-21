Batch-21a: Acquisition tinies — persist-after-success, clear stale cam pin, in-call mic fallback (A8/A9/A12/TINY3)

Batch ID: batch-21a
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (B20 committed @ 67438cf). Do NOT commit (projcore validates + commits).
Read FIRST: north-star.md, findings.md (A8 line 52, A9 line 53, A12 line 56, TINY3 line 146).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): LOW-MEDIUM. Confirm/counter at PROPOSED.

## projcore already re-verified these are STILL OPEN (current sites below from a code audit; confirm, don't re-derive). 6 sibling tiny-findings were found ALREADY-FIXED and are NOT in scope (ERR8/TINY5/TINY7/REC7/REC9/REC10).

## North-star tie-in
Universal device behavior: a saved device id must never strand a user on another device, and re-enabling the mic in-call must use the same robust fallback ladder the rest of the app uses. Four small but real correctness bugs in the device/acquisition path.

## THE FINDINGS (confirmed OPEN by audit; current sites)
- **A8 (device id persisted before acquisition success)** — `frontend/src/app/pages/room/room.page.ts` ~line 949-950: `storeDevice(DEVICE_STORAGE.audioInput, deviceId)` is written to storage BEFORE `replaceInCallAudio` succeeds, and the double-failure path (~2453-2456) has no rollback. So a deviceId that fails to acquire gets pinned in storage and reused across reload. Fix: stage the chosen id in memory, write to storage only AFTER acquisition succeeds; on failure do not persist (and if a prior bad id is in storage, clear/roll it back). Mirror the resolvedAcquiredDeviceId spirit (commit the actually-acquired id). Apply to the audio path here (and the symmetric video path if it shares the bug — check, but stay minimal).
- **A9 (stale camera pin not cleared)** — room.page.ts ~line 2276-2278: when `refreshDevices`/enumerate finds the stored camera id is MISSING, it updates `selectedVideoId` to a fallback (`preferredDeviceId`) but never calls `videoDevicePinned.set(false)` — so the "pinned exact" flag transfers to the fallback device. Fix: when the stored camera id is not among the enumerated devices, clear the pin (`videoDevicePinned.set(false)`) so the next acquire uses ideal/default rather than exact-pinning a substituted device.
- **A12 (in-call mic re-enable bypasses the fallback ladder)** — room.page.ts ~line 1040-1054 `toggleMic` → `media.toggleMic(...)` whose 'acquire' branch (media.service.ts ~line 326) uses `audioDeviceId` as `{exact}` with NO fallback ladder; the catch at ~1052 routes to `handleInCallMediaPermission`, not the recovery ladder. Fix: route the in-call mic re-enable acquire through the shared media-acquisition fallback ladder (the same acquireAudio/replaceInCallAudio path used elsewhere) so a stale/exact id falls back to ideal/default instead of hard-failing. Reuse the existing ladder — do NOT write a new one.
- **TINY3 (micOn set without readyState guard)** — `frontend/src/app/services/media.service.ts` ~line 170: in `replaceAudioTrack`, `this.micOn.set(nextTrack.enabled)` runs with no `nextTrack.readyState === 'live'` guard — a track that was acquired then immediately ended sets micOn=true (false-positive mic state). Fix: only set micOn true when the track is live (`nextTrack.readyState === 'live' && nextTrack.enabled`); otherwise reflect not-on.

## Required fix (acceptance)
1. A8: a failed audio device acquisition does NOT persist that id; storage holds only the actually-acquired (or prior-good) id; survives reload without pinning a dead id.
2. A9: a missing stored camera id clears videoDevicePinned so acquire falls back gracefully (no exact-pin on a substituted cam).
3. A12: in-call mic re-enable uses the fallback ladder (exact→ideal→default), opening the mic even when the saved id is wrong.
4. TINY3: micOn reflects a LIVE track only (no false-positive from an instantly-ended track).
5. No regression: device selection when ids match, mic-persistence, B01-B04 acquisition ladder + acquire-before-destroy, B14 mic-recovery, camera toggle, the device dialog.

## Scope guards (MANDATORY — bypass mode)
- B21a ONLY (A8/A9/A12/TINY3). Touch: room.page.ts (A8 persist-after-success + rollback, A9 clear pin, A12 route through ladder), media.service.ts (A12 ladder use if needed + TINY3 guard). Plus tests.
- Do NOT touch: SFU/signaling/recorder/transport, the B16 relay code, B17/B18/B19/B20 changes, the mic select template, ERR8/TINY5/TINY7/REC7/REC9/REC10 (already fixed).
- Prefer pure/testable seams (a persist-decision helper, a should-clear-pin helper, a live-track guard). Robust assertions — assert the OUTCOME.

## Deterministic proof
- Unit specs (npx tsx): A8 persist-only-on-success + no-persist-on-failure decision; A9 clear-pin-when-missing decision; TINY3 micOn-only-when-live; A12 the in-call acquire goes through the ladder (assert exact→ideal fallback for a wrong id, reusing media-acquisition seam).
- Re-run media-acquisition, media-toggle, device-selection, local-media-recovery specs (no regression). `npx ng build` green. Deploy DEV (`pm2 restart meet-poc-fe`).
- BE HONEST: real cross-device persistence/reload is JROM's seat; unit proves the decision logic.

## Plan handshake (MANDATORY)
1. Read brief + the 4 sites (room.page.ts ~949/~2276/~1040; media.service.ts ~326/~170) + how resolvedAcquiredDeviceId + the acquisition ladder + replaceInCallAudio currently work.
2. Reply PROPOSED: the persist-after-success approach, the clear-pin fix, the A12 ladder routing, the TINY3 guard, test plan, files, risks, estimate, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green → tests → deploy DEV → STATUS: DONE. Do NOT commit.

## Artifacts (under <run-dir>/validation/B21a/)
scenarios.md, changes.md (Root Cause per finding + per-file WHY + honest note), review.md, test-report.md, independent-validation.md. decisions/ entry if any choice is non-obvious.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-21a <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
