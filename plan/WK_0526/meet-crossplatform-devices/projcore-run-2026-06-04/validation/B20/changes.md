# B20 Changes

## User Report
Verbatim batch scope:
- UX1: guest back-link dead-ends at `/login` on not-found/rejected/error panels; make conditional like the lobby link.
- UX2: chat Shift+Enter must insert newline, not submit.
- D1: `joinRouteMode` guest in a protected room must get the password prompt after entering name; `continueAsGuest` currently skips it.
- CMP1: camera and speaker device selects still use select-level `[value]` and snap back; switch to per-option `[selected]` like the mic.

## Root Cause
- UX1: the three terminal room-state panels hardcoded `routerLink="/app/rooms"`, which is protected and redirects guests to login.
- UX2: `(keydown.enter)` called `sendChat($event)` directly, and `sendChat()` unconditionally prevented default, so Shift+Enter and IME composition Enter submitted instead of preserving textarea behavior.
- D1: `bootstrap()` opened the guest-name overlay and returned before the password check; `continueAsGuest()` then went straight to lobby device check with no protected-room gate.
- CMP1: camera and speaker selects still bound selected value at the `<select>` level, while the mic fix already used per-option `[selected]`, avoiding reopen desync.

## Per-File WHY
- `frontend/src/app/pages/room/room.page.html`: terminal panel links now use the same signed-in/guest route and label condition as the lobby back link; chat Enter now routes through `handleChatEnter`.
- `frontend/src/app/pages/room/room.page.ts`: captures protected-room join metadata in dedicated RoomPage signals, not the in-call owner/host signals; `continueAsGuest()` opens the existing password prompt before lobby device check when required; Enter handling uses a pure decision helper.
- `frontend/src/app/pages/room/room-decisions.ts`: holds testable pure decisions for chat submit and guest password prompting.
- `frontend/src/app/pages/room/room-decisions.spec.ts`: proves the approved Enter, IME, and password-prompt branches with `npx tsx`.
- `frontend/src/app/components/device-dialog/device-dialog.component.html`: camera and speaker selects now match the mic per-option selected pattern; the speaker system-default option remains selected when no output is chosen.

## Proof Notes
- Unit-proven: UX2 submit decision, IME non-submit guards, and D1 guest-password prompt decision.
- Build-proven: Angular template/type integration for UX1, UX2, D1, and CMP1.
- Visual/manual only: UX1 link rendering and CMP1 select reopen state were not screenshot-captured in this batch; they are template-only bindings validated by diff review and `npx ng build`.
- Autonomous decisions: none.
