/lead — HYPER-FOCUSED IMPLEMENTER for ONE batch (B2). Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep. Fresh context (post-/clear).

Batch ID: B2 — Microphone selection persistence (R2)
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-audio-playout/projcore-run-2026-06-01
Branch: feat/host-audio-playout-mic-persist-20260601 (B1 already committed + deployed on it — CONTINUE on this branch, commit B2 on top). Do NOT touch B1's files unless B2 genuinely requires it.
Read FIRST: north-star.md, og-requirements.md (R2 only), context-handoff.md.
Lifecycle: post-live, Deferral OFF (tests required).
Estimated: ~25min.

## THE BUG (JROM verbatim)
> "he is trying to select a mic but its not persisting"
A user selects a microphone in the device picker, but the choice does not stick — it reverts / isn't applied / doesn't survive. This is SEPARATE from B1 (audio playout). B2 is purely the mic-SELECTION path.

## Where to look (already localized by projcore — confirm via repro, file:line)
- The picker (device-dialog component) emits `(audioDeviceChange)` → `changeAudioDevice(deviceId)` (room.page.html:175,422,536 → room.page.ts:825). That handler sets `selectedAudioId`, `storeDevice(DEVICE_STORAGE.audioInput, deviceId)` (persists to localStorage), then `replaceInCallAudio(deviceId)`. So persistence-to-storage exists — the revert is elsewhere.
- PRIME SUSPECT 1 — `replaceInCallAudio` (room.page.ts ~2056, esp. ~2113-2114): after acquiring the new track it does `this.selectedAudioId.set(actualDeviceId); storeDevice(..., actualDeviceId)` where `actualDeviceId` comes from the track's real settings. If the chosen deviceId ≠ the track's reported deviceId (e.g. user picks "Mic B" but the track reports `default` or a different id), the dropdown SNAPS BACK to a different entry → looks like "not persisting".
- PRIME SUSPECT 2 — `ensureSelectedAudioDevice` / `preferredDeviceId` (room.page.ts ~1923-1930): on a `devicechange` event or a `refreshDevices`, if `selectedAudioId` fails the `audioInputs.some(d => d.deviceId === selectedAudioId())` membership check, it OVERWRITES with `preferredDeviceId(...)`. If the chosen id transiently isn't in the enumerated list (labels/ids churn, permission timing), the user's pick gets reset.
- PRIME SUSPECT 3 — reload restore: `selectedAudioId = signal(readStoredDevice(DEVICE_STORAGE.audioInput))` (room.page.ts:156). Confirm the stored id is actually re-applied to capture on reload (not just read into the signal then overwritten by the membership check).

## Required (R2 acceptance — see og-requirements.md)
1. **Repro first** (mechanism-level root cause, not symptom): two-tab or single-tab with ≥2 mics (the Playwright fake-device flags can expose multiple) — select a NON-default mic, observe the exact revert (which line resets it). Document the mechanism in changes.md with file:line.
2. **Fix** so the selected mic: (a) is applied to live capture, (b) the picker UI KEEPS showing the selected device (no snap-back to a different entry), (c) survives reopening the picker AND a page reload (subject to the device still being present).
3. **Do NOT break the legitimate fallback**: when the selected device is genuinely GONE (unplugged), falling back to another mic is correct (that's B1-adjacent recovery). Distinguish "device removed" (fallback OK) from "device present but selection reset" (the bug). Preserve the former, fix the latter.
4. **Deterministic proof (NS5)**: extract/identify the selection-persistence decision (e.g. "given chosen id + enumerated devices + track-reported id, what should selectedAudioId be?") into a unit-provable function and spec it (node:assert style, matching remote-audio-health.spec.ts / remote-audio-playability.spec.ts — run via `npx tsx <spec>`). Cases: chosen-id present ⇒ keep chosen (don't overwrite with track's generic id); chosen-id absent-because-unplugged ⇒ fall back; reload restore re-applies stored id. Plus a manual localhost note for the picker UX.

## Scope guards (NS6 — surgical)
- B2 ONLY (R2). Touch the device-selection/persistence path in room.page.ts (changeAudioDevice / replaceInCallAudio / ensureSelectedAudioDevice / preferredDeviceId / readStoredDevice-restore) and the device-dialog component if its emit/echo is implicated. Plus tests.
- Do NOT touch: B1's remote-audio playout files, SFU/transport, capture energy/mic-recovery sweep logic (mic-energy.ts) beyond what selection requires, diagnostics, layout.
- If the real mechanism differs from the suspects above, fix the ACTUAL root cause and document the divergence with evidence.

## Plan handshake (MANDATORY)
1. Read briefs + the device path (changeAudioDevice, replaceInCallAudio, ensureSelectedAudioDevice/preferredDeviceId, readStoredDevice/storeDevice, the device-dialog component).
2. Reply PROPOSED: confirmed revert mechanism (file:line + repro), the fix, the persistence decision fn + test cases, files touched, fallback-preservation argument, risks, estimate.
3. End: `STATUS: PROPOSED — <one-line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green (FE) → run the new unit spec (tsx) → deploy DEV (pm2 restart) → STATUS: DONE.

## Artifacts (under <run-dir>/validation/B2/)
scenarios.md, changes.md (Root Cause at mechanism level + the exact reverting line), review.md, test-report.md, screenshots/ (picker keeps selection + survives reload). decisions/ entry for the persistence-decision approach.

## Completion protocol
- FIRST action on finishing/blocking: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] B2 <DONE|NEEDS-CLARIFICATION|BLOCKED> <one-line>` — BEFORE the prose summary.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
