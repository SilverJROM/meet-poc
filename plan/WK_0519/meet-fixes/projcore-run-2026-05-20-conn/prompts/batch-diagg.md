Batch-DIAGG: Remove all video mirroring (DR-17) + stable speaker order ~5s settle (DR-20)

Batch ID: diagg
Requirements: DR-17, DR-20 (full text in og-requirements.md)
Branch: continue on fix/meet-conn-diag.

**Protocol: projcore v2.0.** Plan handshake first (PROPOSED → APPROVED-PLAN → code). Append `[projcore callback] diagg <STATE> <note>` to callbacks.md as the final action of each STATUS reply. End every reply with `STATUS: <verb> — <reason>`.
**ENV-HYGIENE (incident 2026-05-20):** never leave MEET_DB_PATH/MEET_RECORDINGS_DIR exported when restarting the live service; restart via clean `pm2 start ecosystem.config.js`; verify pm2 env has no /tmp leak.

## DR-17 — Remove all video mirroring (true orientation everywhere)

JROM: "view is inverted ... right is right and left is left on the perspective of the user" → answer: **no mirroring anywhere.** Remove the mirror transform (`scaleX(-1)` / `transform: rotateY(180deg)` / any CSS mirror) from ALL video surfaces — lobby self-preview, local self tile, AND remote tiles — so every video shows true real-world orientation. Grep for the mirror CSS and remove it everywhere it applies to a video element.

## DR-20 — Stable speaker ordering with ~5s settle (anti-dizzy)

JROM: "sharing the video is changing fast ... not change on top ... refresh like 5secs so its not dizzying" → answer: **stable order + ~5s settle.** In the screen-share participant strip (FIXC3 active-speaker float) AND the grid active-speaker ordering: do NOT continuously reorder tiles that are already visible/speaking; reconcile the order on a ~5s throttle interval (not per-frame/per-RMS-sample). Speaking is still indicated (pulse/highlight) but tiles stop jumping. A newly-speaking off-screen participant can surface at the next ~5s reconcile.

## Observed (confirm by reading)

- Grep `scaleX|rotateY|mirror|transform` in frontend SCSS/HTML for video elements (lobby-preview, tile, room.page, device-dialog self-preview).
- `frontend/src/app/services/active-speaker.service.ts` + `webrtc.service.ts` (activeFrame RMS sort) + `room.page.ts`/`tile` — where the strip/grid ordering is computed (FIXC3 + DR-2). Add the ~5s throttle to the reorder.

## Scope

- DR-17 + DR-20 only. Display-layer tweaks.
- Do NOT regress DR-1..16, 18-25, FIXC, or the audio/reconnect logic.
- DR-17: pure CSS/transform removal. DR-20: throttle the existing active-speaker reorder; keep the speaking highlight/pulse.

## Plan handshake (MANDATORY)

STATUS: PROPOSED with: every mirror-transform location you'll remove (DR-17), the ~5s throttle approach for the strip + grid ordering (DR-20 — where the reorder is computed + how you throttle without losing the speaking highlight), planned files, risks. Append callback. Wait for APPROVED-PLAN.

## Tests

- DR-17: assert NO mirror transform (scaleX(-1)/rotateY) on any video element (self-preview, self tile, remote tile).
- DR-20: simulate rapid speaker changes → assert tile order does not change more often than ~5s; speaking indicator still updates. (Use the existing active-speaker debug seam.)

## Required artifacts at plan/.../batch-diagg/

changes.md, scenarios.md, review.md, test-report.md, screenshots/ (mirror-removed self-view; stable-order note), independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

Backend+frontend build PASS; tests PASS; new e2e PASS; gate PASS on clean DB; pm2 restart clean (verify no leak); clean up test rooms.

## Completion

COMMIT BEFORE STATUS: DONE + append the diagg DONE callback.
