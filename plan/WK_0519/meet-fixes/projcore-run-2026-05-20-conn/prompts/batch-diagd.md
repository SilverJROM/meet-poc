Batch-DIAGD: Join-prereqs popout (DR-12) + audio-bandwidth-reservation invariant (DR-13)

Batch ID: diagd
Requirements: DR-12, DR-13 (full text in plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/og-requirements.md)
Branch: continue on fix/meet-conn-diag (current tip).

**Protocol: projcore v2.0.** Plan handshake first (STATUS: PROPOSED → wait for APPROVED-PLAN → code). Final action of every STATUS reply: append `[projcore callback] diagd <STATE> <note>` to the run callbacks.md. End every reply with `STATUS: <verb> — <reason>`.

## DR-12 — Join-prereqs popout (SUPERSEDES DR-7's grey-out)

JROM 2026-05-20: "remove the greyout of join, just give a popout message on what is still needed like name or mic (atleast) ... if its name popout the name + mic or name otherwise mic only or name only."

- **Remove the disabled/greyed Join button** (the DR-7 disabled state). Join is ALWAYS clickable.
- On Join click, if prerequisites are unmet, show a **popout** (small dismissible modal/popover, unmissable) naming EXACTLY what's missing, dynamically:
  - both missing → "Please add your name and enable your microphone"
  - name only → "Please add your name"
  - mic only → "Please enable your microphone"
- Join proceeds only when prerequisites met.
- **Prerequisites = non-empty name + microphone access** (permission granted + a mic device present). Camera optional (join camera-off allowed). *(Interpretation: "mic (atleast)" = mic access/permission present, NOT mic toggled-on. Can join muted.)*
- Keep DR-7's clear setup-error messages for permission-denied / no-device cases (don't regress those).
- Works on the DR-6 quick-join lobby (the current default lobby).

## DR-13 — Audio-bandwidth reservation is a NON-OVERRIDABLE invariant

JROM 2026-05-20: "confirm that audio first cant be overridden even if the user picks for a better video quality its automatically reserved for audio bandwith and the user can only manual pick the remainder."

Current code (`webrtc.service.ts setSenderBandwidthPreference`) already sets audio `priority='high'`/`networkPriority='high'` and video `'low'`+maxBitrate cap. This requirement LOCKS that as a tested invariant:

- (a) Ensure audio sender priority is applied **unconditionally** and re-asserted whenever sender parameters change (after degrade/restore, active toggles, any future bitrate change). Audio priority must NEVER be lowered and audio sender must NEVER be stopped.
- (b) Video stays lower priority + bitrate-capped (the remainder).
- (c) Add a **regression test** asserting: after a video param change (degrade→restore cycle, video active toggle), the audio sender encoding still reads `priority='high'`+`networkPriority='high'` and is active; video encoding reads `priority='low'`.
- (d) Do NOT build a user-facing video-quality picker (separate feature). This is the guarantee + test only. If you see any code path where a setting could touch audio priority, harden it.

## Observed (confirm by reading)

- `frontend/src/app/pages/room/room.page.{ts,html}` — DR-6 quick-join lobby, the Join button + current DR-7 disabled/validation logic to replace; name field, mic state.
- `frontend/src/app/services/webrtc.service.ts` — `setSenderBandwidthPreference` (L745+), audio/video priority application (DR-13).
- `frontend/src/app/services/media.service.ts` — mic permission/device state for the prerequisite check.

## Scope

- DR-12 + DR-13 only.
- DO NOT regress DR-1..DR-11 or the FIXC work.
- DR-12: remove grey-out, add popout; don't change the actual join/admit flow beyond the prerequisite gate.
- DR-13: invariant + test; no new UI.

## Plan handshake (MANDATORY)

STATUS: PROPOSED with: how you replace the DR-7 disabled-Join with always-clickable + popout (component/markup for the popout), how you compute the missing-prereqs message (name + mic-access detection), the DR-13 invariant enforcement points + the regression test approach. Append callback. Wait for APPROVED-PLAN.

## Tests

- DR-12: empty name → click Join → popout says name; mic blocked/denied → popout says mic; both → names both; all satisfied → joins. Assert NO greyed/disabled Join button.
- DR-13: degrade→restore cycle (via the DR-11 `__meetDebug.sampleConnectionQualityForTest` seam) + video active toggle → assert audio sender stays priority high + active, video stays low. Audio never stopped.

## Required artifacts at plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagd/

changes.md, scenarios.md, review.md, test-report.md, screenshots/{join-popout-name.png, join-popout-mic.png or combined}, independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

- Backend + frontend build PASS; backend tests PASS; new e2e PASS; targeted Run-1 + diag specs PASS (use a clean/isolated DB if you self-seed — note the live DB was just cleaned to TEST_ROOM01, keep it clean). R8.1 must hold.
- pm2 restart meet-poc-fe meet-poc-be.
- **Clean up any test rooms you create** (global-teardown + verify) — JROM directive: no test-room pollution on the dashboard.

## Completion

COMMIT BEFORE STATUS: DONE. End with `STATUS: DONE — <reason>` + append `[projcore callback] diagd DONE <note>` to callbacks.md.
