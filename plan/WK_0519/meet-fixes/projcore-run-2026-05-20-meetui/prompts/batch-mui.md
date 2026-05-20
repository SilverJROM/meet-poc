Batch-MUI: Google-Meet-LIKE UI restyle (DR-26)

Batch ID: mui
Requirement: DR-26 (full text in plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/og-requirements.md)
Branch: continue on fix/meet-conn-diag.

**Protocol: projcore v2.0.** Plan handshake first (PROPOSED → APPROVED-PLAN → code). Append `[projcore callback] mui <STATE> <note>` to plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/callbacks.md as the final action of each STATUS reply. End with `STATUS: <verb> — <reason>`.
**ENV-HYGIENE (incident 2026-05-20):** never leave MEET_DB_PATH/MEET_RECORDINGS_DIR exported on a live pm2 restart; clean `pm2 start ecosystem.config.js`; verify no /tmp leak.

## ⚖️ IP rule (binding)

Build a Meet-**LIKE** layout using OUR OWN / standard open-source icons (e.g., the icon set already in the app, or Ionicons/Material-style). Match Meet's ARRANGEMENT + FEEL ~80-90%. Do NOT copy Google's proprietary icon artwork, logos, or brand assets. The reference `tmp/google_meet.png` is for layout/arrangement guidance only.

## DR-26 — restyle only (NO new features)

Restyle the in-call screen to feel like Meet:
- **Bottom center control bar:** dark rounded icon buttons — mic toggle (RED when muted), camera toggle (RED when off), present/share-screen, settings, diagnostics, leave (red/distinct). Device-select chevrons next to mic/camera where we already support device selection.
- **Bottom corners:** left = meeting name/code + clock; right = info, chat, participants/people icons (chat icon can be a placeholder until DR-27 wires it).
- **Video tiles:** rounded corners, name label bottom-left, muted-mic indicator top-right, camera-off → avatar/initials on a colored/gradient background, active-speaker outline.
- **Share-screen layout:** presenter content big in the main area + participant tiles in a strip (DR-4/FIXC3 already does this — restyle to match Meet).
- Keep ALL existing functionality wired: mic/cam/share/leave/settings/diagnostics/force-relay/audio-only toggle/participant sidebar/waiting-room/quick-join. This is a RE-SKIN, not a rewrite.
- Theme: propose soft-light vs Meet-like dark for the CALL surface in PROPOSED (the rest of the app is soft-light; the call surface could go dark to match Meet — your recommendation).
- NO new features: no reactions/emoji, no raise-hand, no captions/CC.

## Observed (confirm by reading)

- `frontend/src/app/components/controls-bar/controls-bar.component.{ts,html,scss}` — current control bar (FIXC + diagnostics + force-relay + audio-only). Restyle to Meet-like.
- `frontend/src/app/components/tile/tile.component.{ts,html,scss}` — video tiles. Restyle.
- `frontend/src/app/pages/room/room.page.{html,scss}` — call layout, top bar, share strip, bottom corners.
- `frontend/src/app/components/participant-sidebar/*` — people panel.
- Existing icon usage (ion-icon / the global stroke-width rule from the soft-light theme work).

## Scope

- DR-26 restyle only. Do NOT add features, do NOT change call/signaling/media logic, do NOT regress DR-1..25.
- Keep every existing control functional after the restyle (verify mic/cam/share/leave/settings/diagnostics/force-relay/audio-only all still work).

## Plan handshake (MANDATORY)

STATUS: PROPOSED with: the restyle plan per area (control bar, tiles, share, bottom corners, top bar), the icon source you'll use (confirm own/standard, not Google's assets), the theme recommendation (light vs dark call surface), which files, how you preserve all existing wiring, risks. Append callback. Wait for APPROVED-PLAN.

## Tests

- Playwright: control bar shows restyled buttons; mute → mic button red state; camera-off → camera button red + tile shows avatar; active-speaker outline; share layout presenter+strip; assert each existing control still triggers its action (mic/cam/share/leave/settings/diagnostics/force-relay/audio-only).
- Run 1 + diag regression on a clean DB (don't regress existing e2e — they assert on control/tile selectors; update selectors honestly if the restyle renames them).

## Required artifacts at plan/.../batch-mui/

changes.md, scenarios.md, review.md, test-report.md, screenshots/{call-controls.png, tiles-states.png, share-layout.png}, independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

Backend+frontend build PASS; tests PASS; new/updated e2e PASS; gate PASS on clean DB; pm2 restart clean (verify no leak); clean up test rooms.

## Completion

COMMIT BEFORE STATUS: DONE + append the mui DONE callback.
