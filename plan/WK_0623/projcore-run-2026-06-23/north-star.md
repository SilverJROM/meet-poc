# North Star — WK_0623 projcore run

> Append-only anchor. Every decision in this run must serve this. Created 2026-06-23 (Asia/Manila).
> **Status of this run: PLANNING ONLY.** No implementation, no app/code/config/DB changes until JROM
> explicitly says "go" (gate: after his live call on 2026-06-23). Read + investigate is permitted; writes
> are restricted to docs under `plan/WK_0623/`.

## Mission

Harden the **current** meet-poc app (Angular FE + Node/Express BE, live on voice.silverjrom.app)
based on real-call pain. This run is **current-app only** — NOT the CFBASE Cloudflare rewrite
(that lives in `plan/CFBASE/` and is a separate horizon).

## Sacred constraints (never regress)

1. **International call path stays sacred.** PH↔US must keep working exactly as it does today. The media
   path (Cloudflare Calls SFU + TURN) never transits the backend; nothing in this run touches it.
2. **Real-call acceptance.** "Fixed" = a real human live call proves it, not a synthetic/green test.
   Red-team for real-call fidelity before declaring DONE.
3. **No secrets in chat / code.** All third-party API keys live in `.env`, sourced never echoed.
4. **Don't touch** TEST_ROOM01 (`testroom01001`) or AGENTROOM. Clean up any validator-created rooms.
5. **Verifier ≠ fixer.** projcore independently validates every batch before go/no-go. `req-matrix.md`
   is the contract; final acceptance only when every row reads VERIFIED.

## Issues in scope (fed one at a time by JROM — append as they arrive)

### Issue #1 — Transcription quality + phantom-speaker + pluggable/versioned transcribers
Real-call pain (JROM + Peer2 call, 2026-06-23). See `decisions/2026-06-23-transcription-architecture.md`
and `plan/B1-transcription.md`. Summary of the locked intent:
- **Phantom 3rd speaker** (`?`) appeared on a 2-person call → eliminate by making per-person tracks the
  **sole** transcription source; retire the mixed-file active-speaker diarization that invents `?`.
- **Per-person, timestamped, aggregated** transcript — already partially built; make it the only path.
- **Better/pluggable transcriber** — support **both** local (bigger Whisper) and cloud STT providers,
  host-selectable. Must handle **Tagalog + English code-switching**.
- **Versioned transcription** — host can add a new transcription (choose model/provider), keep multiple
  per meeting, delete one, and pick the best. Never overwrite blindly.

### Issue #2 — Concealed superuser ("god mode") + complete the admin powers
JROM wants a superuser tier (just him, `silverjrom@gmail.com`) with god mode: edit any user's role,
email, username, and reset passwords. Regular admins get add/delete users + promote-to-admin only.
**Concealment + protection:** the superuser appears as **"Admin"** in the role column but his row is
**greyed/disabled** — untouchable by anyone (backend hard-blocks all destructive/edit actions against
him). All god-mode mutations (self or others) require a **confirmation step**. The single `is_admin`
flag today has no superuser tier, and delete/edit/role-toggle/password-reset don't exist yet.
See `decisions/2026-06-23-superuser-godmode.md`, `plan/B2-superuser.md`, req-matrix R2.*.

### Issue #3 — Passwordless Telegram login (number-matching)
A Telegram icon on the login screen → shows a number on screen + pushes that number plus 2 decoys to the
user's linked Telegram as 3 inline buttons → user taps the matching number → previous message is rewritten
(buttons removed) → user is logged in without a password. Only for accounts that have Telegram **linked
AND** passwordless login **activated** in settings; otherwise the icon shows "you must activate
passwordless login in the app." Proven, code-verified pattern lifted from lokalcamp (R9) and adapted from
its CF-Workers/D1/GraphQL stack to meet-poc's Express/SQLite/REST stack.
See `decisions/2026-06-23-passwordless-telegram-login.md`, `plan/B3-passwordless-tg-login.md`, req-matrix R3.*.

### Issue #4 — Camera-off tile keeps the virtual background + shows initials
When a user turns off/hides their camera while a virtual background is set, the tile should keep showing
the **background image** (not drop to a plain solid-color avatar) with the user's **abbreviated initials
('JO')** moved to the **upper side** of the tile. Fallback to the current avatar when no image background
(blur/none) is set. See `decisions/2026-06-23-camoff-background-avatar.md`, `plan/B4-camoff-background.md`,
req-matrix R4.*. **Scope = B (JROM 2026-06-23): all participants see the user's background + initials when
that user's cam is off — broadcast the background choice over signaling; built-in backgrounds first, custom
remote-display as follow-on.**

### Issue #5 — Recording lost on call end (8s upload timeout + teardown abort) — REAL-CALL BUG
JROM's ~31-min real recording (room a78ae0bd02b6 "ReceiptBOT", 2026-06-23) was lost. Confirmed via logs
(`recording-state started`+`stopped` present, zero `[rec] saved`) and DB (session 01:54→02:49 UTC). Root
cause: the finished-recording upload has an **8-second timeout** (`room.page.ts:1433`) that a real
(large, ~25MB+) recording cannot meet on a normal/international link; stopping-by-ending-the-call then tears
the page down (~1s after) and **aborts the in-flight upload** → server never saves it. Short test recordings
(<8s upload) survive — synthetic-passes/real-fails. Per-user uploads (fire-and-forget) lost the same way.
See `decisions/2026-06-23-recording-upload-loss.md`, `plan/B5-recording-reliability.md`, req-matrix R5.*.
JROM directive: **investigate + feedback first, no hot-patch.** Fix when go.

### Issue #6 — (awaiting JROM)

## Definition of done (run-level)
Every in-scope issue's `req-matrix.md` rows = VERIFIED via independent projcore validation, with at least
one real-call (or faithful real-shape) confirmation for anything on the live call path.

## MANDATORY run-level capstone (JROM, 2026-06-23)
After ALL fixes land, run a **full end-to-end call including Peer2's remote machine** to prove **no
regressions** — exercise the international PH↔US path + all touched features in one real call:
recording (B5: long call → leave → recording actually saved + per-user files), transcription (B1: per-person,
no phantom), superuser/admin (B2), cam-off background (B4), and passwordless TG login (B3) if shipped.
This Peer2-machine e2e is a HARD gate — the run is not "done" until it passes. Drive Peer2-side via the
JohnnyOne relay per memory [[project_johnnyone_peer2_codex]]; VPN-on-desktop per [[project_meet_intl_call_verification]].
