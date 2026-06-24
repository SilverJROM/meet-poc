<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B2b: Admin UI — god-mode controls (superuser-only) + greyed untouchable superuser row + confirm dialogs

Batch ID: batch-B2b
Plan: /home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/plan/B2-superuser.md
Branch: feat/recording-reliability-b5 (run branch — accumulate; no commit)
Requirements assigned: R2.7 R2.9 + UI surface of R2.3/R2.5/R2.6
North-star anchors: Issue #2, decision 2026-06-23-superuser-godmode.md (D2-3 concealment, D2-4 protection, D2-5 confirm).
Lifecycle: pre-live — Deferral OFF.

Estimated duration: SHORT — 30min. Effort: medium · validator=codex55 (UI-PROOF).

Context:
B2a shipped the superuser BACKEND (verified + red-teamed): is_superuser tier, requireSuperuser, admin delete/toggle-admin, superuser god-mode endpoints (edit username/email/role + reset-password), hard-block (admin→superuser=403), isSuperuser ONLY on own /api/me (never in /admin/users list). Now build the admin-page UI. JROM: superuser appears as a greyed "Admin" untouchable by anyone; god-mode controls only the superuser sees; confirm on every god-mode mutation.

Endpoints (B2a): DELETE /api/admin/users/:email · PATCH /api/admin/users/:email/role {isAdmin} · PATCH /api/admin/users/:email {displayName} · PATCH /api/admin/users/:email/email {newEmail} · POST /api/admin/users/:email/reset-password {newPassword}. Own superuser status: /api/me → user.isSuperuser (true only for the superuser's own session).

Expected (acceptance — implement ALL, FRONTEND admin page):
1. R2.6/R2.5 UI: in the Users table (frontend/src/app/pages/admin/*), render each user's ROLE as today ("Admin"/"User"). For a row that is the superuser, the UI cannot know is_superuser from the list (backend never sends it) — SO: derive "is this row untouchable?" by the backend 403 OR a safe signal. Simplest correct approach: the admin list does NOT expose superuser; render normally, and rely on the backend 403 + a graceful error. BETTER per JROM "greyed row": add a minimal backend signal SAFELY — the list MAY include a boolean `protected: true` (NOT the literal is_superuser, and only meaning "cannot be acted on") so the row can be greyed/disabled. Confirm with projcore at PROPOSED whether to add `protected` to the list payload (concealment-preserving) vs pure-403 handling. Greyed row = action controls disabled.
2. R2.3 UI (god-mode, superuser-only): when the CURRENT user is the superuser (/api/me isSuperuser===true), show extra controls on OTHER users' rows: Edit username, Edit email, Edit role, Reset password — wired to the B2a endpoints. Non-superuser admins see only today's controls (create) + the new delete/toggle-admin (R2.2).
3. R2.2 UI: admin gets Delete user + Toggle-admin controls (these call the B2a admin endpoints).
4. R2.7: EVERY god-mode mutation (edit username/email/role/reset-password, on self OR others) shows a CONFIRM dialog before firing. Delete also confirms.
5. R2.9: no regression — existing login, /api/me, admin create-user still work; greyed superuser row cannot be acted on (action attempts blocked client-side + 403 server-side).

Likely files:
- frontend/src/app/pages/admin/* (the admin users page ts/html/scss)
- frontend/src/app/services/* (admin/account service — add the 5 endpoint calls + isSuperuser from /api/me)
- (maybe) backend/src/modules/admin/index.ts ONLY IF adding the concealment-safe `protected: true` to the list (confirm at PROPOSED) — do NOT expose is_superuser.

Scope:
- Frontend-primary. The only allowed backend touch is the optional concealment-safe `protected` boolean on the list (NOT is_superuser) — confirm at PROPOSED.
- density-light, consistent with the existing admin page. No git commit. Build frontend green.
- UI-PROOF: rendered-DOM/screenshot showing (a) superuser row greyed/disabled, (b) god-mode controls present for a superuser session, (c) a confirm dialog on a god-mode action.

Plan handshake (MANDATORY): 1. Read brief + admin page + B2a endpoints. 2. PROPOSED (incl. the protected-vs-403 concealment decision). 3. tier. 4. STATUS: PROPOSED — <approach> · complexity · why. 5. WAIT for APPROVED-PLAN before coding. 6. REVISE→re-emit.
After APPROVED-PLAN: 7. Implement; build green; capture UI proof. 8. STATUS: DONE.

Required artifacts: batch-B2b/{scenarios,changes,review,test-report,independent-validation}.md + screenshots/ + decisions/<date>-<slug>.md (or "Autonomous decisions: none").

---

## Streaming-order mandate
Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below) — not the first sentence, the first TOOL CALL, BEFORE any prose tokens stream. Append first, prose after.

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B2b <STATE> "<note>"
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
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B2b[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <same short note>`. Callback file wins on mismatch.
