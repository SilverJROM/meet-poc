Batch-20: Polish the join/in-call UX to Zoom/Meet feel (UX1, UX2, D1, CMP1)

Batch ID: batch-20
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (B19 committed @ 8b4ae24). Commit B20 on top (NOT a 3-agent batch — projcore validates solo, but still: build/tests green + validation artifacts before projcore commits; you may commit after STATUS: DONE only if projcore says so — default: do NOT commit, projcore commits).
Read FIRST: north-star.md, findings.md (UX1 line 171, UX2 line 172, D1 line 96, CMP1 line 214).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): LOW-MEDIUM. Confirm/counter at PROPOSED.

## IMPORTANT — projcore already re-verified the CURRENT state (do not re-derive; confirm):
- **R9-S1/S2 are ALREADY DONE** by B14 (`local-media-recovery.ts` `localAudioRecoveryTerminalMessage` already branches permission-denied/in-use/no-mic/unknown). DO NOT touch them. They are excluded from B20.
- The lobby back-link (room.page.html ~523) already uses the conditional `[routerLink]`. The 3 in UX1 below do NOT.

## North-star tie-in
Zoom/Meet feel = no dead-ends, chat behaves like every other chat, device pickers don't snap back, and a guest invited to a protected room can actually get in. Four real, confirmed bugs.

## THE FINDINGS (confirmed by fan-out; current sites re-verified by projcore)
- **UX1 (HIGH) — guest back-link dead-ends at /login.** `frontend/src/app/pages/room/room.page.html` lines ~64, ~70, ~76 (the `not-found`, `rejected`, `error` state panels) each have `<a class="secondary-btn" routerLink="/app/rooms">Back to rooms</a>`. `/app/rooms` requires auth, so a GUEST hitting these states dead-ends at /login. Fix: mirror the already-fixed lobby link (~523) — `[routerLink]="auth.user() ? '/app/rooms' : '/'"` and conditional label `{{ auth.user() ? 'Back to rooms' : 'Back to home' }}`. All 3 panels.
- **UX2 (HIGH) — chat Shift+Enter can't insert a newline.** `room.page.html` ~line 354 binds `(keydown.enter)="sendChat($event)"` on the chat `<textarea>`, and `sendChat()` (room.page.ts ~1327) calls `event?.preventDefault()` unconditionally → Shift+Enter ALWAYS submits, never inserts a newline (parity bug vs every chat app). Fix: Shift+Enter must insert a newline (default textarea behavior) and only plain Enter submits. Prefer a tiny pure, testable decision (e.g. `shouldSubmitChat(event): boolean` = Enter && !shiftKey && !isComposing) wired so Shift+Enter falls through to the textarea. Don't break plain-Enter submit or the form (submit) handler.
- **D1 (HIGH) — protected-room guest via /join never gets the password prompt.** `room.page.ts` `bootstrap()`: for the `this.joinRouteMode && !user` path the guest-name overlay opens and bootstrap RETURNS (~752) BEFORE the password check (~755). Then `continueAsGuest()` (~768) goes straight to `prepareLobbyDeviceCheck()` WITHOUT checking `passwordRequired` → a guest invited to a password-protected room enters their name then dead-ends at signaling instead of being asked for the password. (The signed-in / non-joinRoute path at ~755 already prompts correctly.) Fix: capture `info.passwordRequired` (and isOwner) into a signal during bootstrap; in `continueAsGuest()`, after setting the name, if `passwordRequired && !isOwner && !verifiedRoomPassword` → open `passwordPromptOpen` (the existing `submitRoomPassword()` then proceeds to `prepareLobbyDeviceCheck()`), else `prepareLobbyDeviceCheck()` as today. Reuse the existing password-prompt machinery; don't build a new one.
- **CMP1 (HIGH) — camera + speaker selects snap back on reopen.** `frontend/src/app/components/device-dialog/device-dialog.component.html`: the MIC select (~61-63) correctly uses `(change)` + per-option `[selected]="device.deviceId === selectedAudioId()"` (the B2 fix). But the CAMERA select (~70) and SPEAKER select (~79) still set `[value]="selectedVideoId()"` / `[value]="selectedAudioOutputId()"` on the `<select>` with per-option only `[value]` — the [value]-on-select pattern desyncs/snaps-back on reopen. Fix: make camera + speaker match the mic pattern — remove `[value]` from the `<select>`, add per-option `[selected]="device.deviceId === selectedVideoId()"` (camera) / `[selected]="device.deviceId === selectedAudioOutputId()"` (speaker). Keep the speaker "System default" empty-state option + its [selected] when none chosen. No change to onVideoChange/onAudioOutputChange handlers.

## Required fix (acceptance)
1. UX1: a guest on not-found/rejected/error sees a working "Back to home" → `/` (signed-in still → /app/rooms). No /login dead-end.
2. UX2: Shift+Enter inserts a newline in chat; plain Enter still sends; the (submit) path still works.
3. D1: a guest invited to a password-protected room via /join is prompted for the password after entering their name and can join on the correct password; wrong/no password does not dead-end at signaling. Owner + signed-in paths unchanged.
4. CMP1: reopening the device dialog shows the camera + speaker selects reflecting the actual selected device (no snap-back); changing them still works.
5. No regression: signed-in join, open-room guest join, lobby device check, mic select (already fixed), in-call chat send, the existing password verify flow (/join page stash), B16 relay-unavailable lobby warning, B18 recording.

## Scope guards (MANDATORY — bypass mode)
- B20 ONLY (UX1/UX2/D1/CMP1). Touch: room.page.html (UX1 links + UX2 keydown binding), room.page.ts (UX2 decision + D1 bootstrap/continueAsGuest password capture+check), device-dialog.component.html (CMP1 camera+speaker selects; .ts only if a tiny binding needs it). Plus tests.
- Do NOT touch: R9-S1/S2 (done), SFU/signaling/ice-config/recorder/leak/transport code, media acquisition, the mic select, the lobby relay-unavailable warning.
- Prefer pure testable seams for the logic bits (UX2 shouldSubmitChat, D1 should-prompt-password decision). Template-only changes (UX1, CMP1) proven by ng build + a brief screenshot/manual note.

## Deterministic proof
- Unit specs (npx tsx): UX2 `shouldSubmitChat` (Enter→true, Shift+Enter→false, composing→false); D1 a pure decision e.g. `shouldPromptGuestPassword({passwordRequired,isOwner,verifiedPassword})`.
- `npx ng build` green. Deploy DEV (`pm2 restart meet-poc-fe`). Optional Playwright/screenshot for UX1 guest back-link + CMP1 reopen if quick; else state manual-verify items honestly.
- BE HONEST in changes.md about what's unit-proven vs visual/manual.

## Plan handshake (MANDATORY)
1. Read brief + the 4 sites (room.page.html 64/70/76 + 354; room.page.ts sendChat + bootstrap/continueAsGuest ~700-800; device-dialog.component.html camera/speaker selects).
2. Reply PROPOSED: the UX2 decision + binding, the D1 signal+continueAsGuest change, the UX1 + CMP1 template edits, test plan, files, risks, estimate, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green → tests → deploy DEV → STATUS: DONE. Do NOT commit (projcore validates + commits).

## Artifacts (under <run-dir>/validation/B20/)
scenarios.md, changes.md (Root Cause per finding + per-file WHY + honest unit-vs-visual note), review.md, test-report.md, screenshots/ (if captured), independent-validation.md. decisions/ entry if any UX choice is non-obvious.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-20 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
