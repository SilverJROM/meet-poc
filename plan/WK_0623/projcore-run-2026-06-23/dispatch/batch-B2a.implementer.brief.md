<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B2a: Concealed superuser — BACKEND (tier + middleware + admin/superuser endpoints + concealment + hard-block)

Batch ID: batch-B2a
Plan: /home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/plan/B2-superuser.md
Branch: feat/recording-reliability-b5 (run branch — accumulate; no commit)
Requirements assigned: R2.1 R2.2 R2.3 R2.4 R2.5 R2.6 R2.8 (R2.7 confirm + R2.9-UI are the B2b frontend slice)
North-star anchors: Issue #2, decision 2026-06-23-superuser-godmode.md (D2-1..D2-7).
Lifecycle: pre-live — Deferral OFF. Uncertainty = STATUS: NEEDS-INFO.

Estimated duration: SHORT/atomic-ish — 30min. Effort tier (PROJCORE-PROPOSED): high · validator=codex55 · RED-TEAM flagged (security). Why: auth/RBAC boundary + concealment + hard-block — correctness critical.

Context:
Today users have a single `is_admin` flag (migration 0010). Admin endpoints (`backend/src/modules/admin/index.ts`) only LIST + CREATE users + diagnostics toggle — no delete/edit/role/reset. JROM wants a concealed SUPERUSER (just him, silverjrom@gmail.com) with god mode, appearing as a greyed "Admin" untouchable by anyone. Email-rename cascade ALREADY EXISTS in `backend/src/modules/account/store.ts` (changeEmail — updates sessions/rooms/questions/llm_settings/meeting_sessions/diagnostics/telegram_links/user_backgrounds then deletes old row) — REUSE it.

Requirements (verbatim, BACKEND portions):
"R2.1 Superuser tier seeded for silverjrom@gmail.com only, not grantable via UI. R2.2 Admin can create, delete, and toggle-admin on other users. R2.3 Superuser can edit any user's username, email (cascade), role; and reset passwords. R2.4 Admin CANNOT edit email/username/role-beyond-admin-toggle or reset passwords (403). R2.5 Concealment: is_superuser never sent to other users' clients; superuser shows as Admin. R2.6 Protection: backend hard-blocks any delete/demote/edit/reset targeting the superuser, regardless of caller (403). R2.8 Self-lockout guards: superuser cannot drop own superuser status via API; self email-change allowed (with confirm in UI)."

Expected (acceptance — implement ALL, BACKEND):
1. R2.1: migration `backend/migrations/0015_room_*`-style → `0015_superuser.sql`: `ALTER TABLE users ADD COLUMN is_superuser INTEGER NOT NULL DEFAULT 0;` + `UPDATE users SET is_superuser=1 WHERE email='silverjrom@gmail.com';`. No endpoint/UI grants it.
2. `requireSuperuser` middleware in `backend/src/modules/auth/middleware.ts` (alongside requireAdmin).
3. R2.5: surface `isSuperuser` ONLY on the REQUESTER's own session user (auth/sessions.ts → /auth/me), NEVER in the `/admin/users` LIST payload (that stays isAdmin-only; superuser shows as Admin).
4. R2.2: `DELETE /admin/users/:email` (requireAdmin) + `PATCH /admin/users/:email/role {isAdmin}` (requireAdmin) — BOTH with a hard guard: if target is_superuser → 403 (R2.6). Respect FK cleanup (delete dependent rows before the user; mirror the throwaway-room delete-order: meeting_sessions for owned rooms first).
5. R2.3 (requireSuperuser): `PATCH /admin/users/:email {displayName}` (username), `PATCH /admin/users/:email/email {newEmail}` (reuse account changeEmail cascade), `PATCH /admin/users/:email/role` superuser-variant if needed, `POST /admin/users/:email/reset-password {newPassword}` (hashPassword).
6. R2.4: the superuser-only endpoints reject a non-superuser admin with 403.
7. R2.6 (hard-block, defense in depth): EVERY destructive/edit endpoint targeting a superuser returns 403 regardless of caller (even another admin) — a single shared guard helper `assertTargetNotSuperuser` (except the superuser acting on himself).
8. R2.8: superuser cannot remove his OWN is_superuser via any endpoint (block); self email-change allowed.

Likely files:
- backend/migrations/0015_superuser.sql (new)
- backend/src/modules/auth/middleware.ts (requireSuperuser)
- backend/src/modules/auth/sessions.ts (isSuperuser on own session user only)
- backend/src/modules/admin/index.ts (delete/toggle-admin + superuser edit/reset endpoints + guards)
- backend/src/modules/account/store.ts (reuse changeEmail)
- backend tests (admin.test.ts or new spec) — MUST cover: admin delete/toggle OK on normal user; admin→superuser-target = 403 (every action); admin→superuser edit/reset = 403; superuser edit username/email/role/reset OK; isSuperuser absent from /admin/users list, present on own /auth/me; self-demote blocked.

Scope:
- BACKEND ONLY (B2b = the admin UI greyed row + confirm dialogs). 
- Do NOT change the recording/transcription paths. No git commit. Tight diff. Typecheck.
- SECURITY-CRITICAL: the hard-block must be server-side (not just relying on UI greying). Assert the OUTCOME (403 status) in tests, not just that a call fired.

Plan handshake (MANDATORY): 1. Read brief + admin/middleware/sessions/account files. 2. PROPOSED: mechanism + files + risks + estimate. 3. Confirm/counter tier. 4. End STATUS: PROPOSED — <approach> · complexity: <x> · why: <one line>. 5. Wait APPROVED-PLAN. 6. REVISE→re-emit.
After APPROVED-PLAN: 7. Implement; run the migration; typecheck; run the auth/RBAC tests. 8. STATUS: DONE when green.

Required artifacts: batch-B2a/{scenarios,changes,review,test-report,independent-validation}.md + decisions/<date>-<slug>.md (or "Autonomous decisions: none").

---

## Streaming-order mandate
Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below) — not the first sentence, the first TOOL CALL, BEFORE any prose tokens stream. Append first, prose after.

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B2a <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states:   WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO

NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B2a[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <same short note>`. Callback file wins on mismatch.
