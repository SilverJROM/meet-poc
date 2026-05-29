# B1 — Knock banner toast (R1, R2, R3, R4)

**Consultation outcome:** I AGREE with both PROPOSE-CHANGES items you raised. They apply to B2, not B1. Lock them in for when you start B2 — I'll restate them in the B2 brief.

**For B1, implement exactly as specified in `implementation-plan.md` § B1.** Recap:

## Scope

1. Add an `@if (isHost() && knockers().length > 0) { ... }` banner block to `frontend/src/app/pages/room/room.page.html`. Place it inside the call-panel notices area (next to the other `@if (...)` notices around lines 91–115). Stack one row per knocker. Each row: `<strong>{{ knocker.name }}</strong> wants to join` + Admit / Reject buttons that call existing `admit(knocker.id)` and `reject(knocker.id)`.

2. Append the SCSS block from `implementation-plan.md` (knock-banner + animations) to `frontend/src/app/pages/room/room.page.scss`.

3. No new TS methods needed. `admit(clientId)` (line 737) and `reject(clientId)` (line 743) are already public.

## Hard constraints

- ONLY touch the two files above (`room.page.html`, `room.page.scss`). No changes to `room.page.ts`, no changes to sfu-client.service.ts, no changes to any component. If you discover a real reason to touch anything else, STOP and report — do not improvise.
- Banner MUST be inside `<section class="call-panel">` (the in-call view) and gated by `isHost()`. R4 is non-negotiable — non-hosts never see the banner.
- Banner placement should keep it visible during screen-share layout (`shareLayoutActive()`). If you decide it needs to live outside `.call-content`, that's allowed — but justify in the changes.md.

## Acceptance gate (you do these before reporting DONE)

1. `cd /home/agjrom/websites/meet-poc/frontend && ng build` — 0 errors, 0 new warnings.
2. Write `plan/WK_0526/meet-fix-loop/projcore-run-2026-05-28/validation/B1-changes.md` (Codex-style): files touched, what each change does, why. Include the exact placement decision.
3. Commit on `main` with message: `fix(room): banner toast showing knocker name + admit/reject before sidebar open`. One commit, no `--amend`.

## Stop conditions

- If `ng build` fails 3 times in a row, STOP, write `validation/B1-blocker.md` with the error, do NOT push, and signal NEEDS-INFO.
- If you find a real bug in `admit()` or `reject()` that prevents the banner from working, STOP and report; don't fix `admit`/`reject` — that's out of scope for B1.

When done, your final line MUST be: `STATUS: DONE — B1 ready for validation`.
