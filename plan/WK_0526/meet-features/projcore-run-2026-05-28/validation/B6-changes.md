# B6 Changes

## Files Touched
- `frontend/src/app/components/participant-sidebar/participant-sidebar.component.html`
- `frontend/src/app/components/participant-sidebar/participant-sidebar.component.scss`
- `frontend/src/app/pages/room/room.page.scss`
- `plan/WK_0526/meet-features/projcore-run-2026-05-28/validation/B6-changes.md`

## What Changed
- Polished the participant sidebar `Waiting to join` section with a count badge, centered empty state, card-style knocker rows, CSS-only avatar initials, and nth-child avatar color cycling.
- Changed the waiting-row reject button copy from `Reject` to `Deny` while preserving the same reject event binding.
- Added a 150ms slide/fade entry animation for waiting rows.
- Polished the existing room knock banner SCSS with a stronger shadow and one-shot pulse-glow animation.

## Before/After Layout Notes
- Before: waiting users rendered as a simple inline name plus Admit/Reject buttons.
- After: waiting users render as compact cards with a 36px avatar, bold name, and Admit/Deny action group.
- Before: the empty waiting state was plain text.
- After: the empty waiting state is centered in a light dashed panel with a CSS clock glyph.
- The knock banner keeps its existing markup, position, and button labels; B6 only adjusts visual treatment.

## Preserved Event Wiring
- Sidebar close backdrop still uses `(click)="close.emit()"`.
- Participant in-call actions are unchanged: `toggleMenu(peer.id)`, `mutePeer(peer.id)`, and `removePeer(peer.id)` remain intact.
- Waiting Admit still uses `(click)="admit.emit(knocker.id)"`.
- Waiting Deny still uses the existing `(click)="reject.emit(knocker.id)"`.
- Mobile section tabs and sheet handle markup remain unchanged.

## Self-Verification
- Command: `cd /home/agjrom/websites/meet-poc/backend && npm run build`
- Result: PASS. TypeScript build completed with 0 errors.
- Command: `cd /home/agjrom/websites/meet-poc/frontend && ng build`
- Result: PASS. Angular build completed with 0 errors. It emitted the existing Stencil `empty-glob` warning from `node_modules/@stencil/core/internal/client/index.js`; no B6-specific warning was emitted.
- Command: `git diff --check -- frontend/src/app/components/participant-sidebar/participant-sidebar.component.html frontend/src/app/components/participant-sidebar/participant-sidebar.component.scss frontend/src/app/pages/room/room.page.scss`
- Result: PASS. No whitespace errors.

## Manual Code Review
- Confirmed no TypeScript files were changed.
- Confirmed room page HTML and knock-banner markup were not changed.
- Confirmed in-call tiles, controls bar, chat, leave dialog, share stage, participant kebab menu, mobile tabs, and sheet behavior files were not changed.
- Banner avatar was intentionally skipped to avoid changing room page markup; sidebar avatars are implemented via template initials and SCSS-only color cycling.
