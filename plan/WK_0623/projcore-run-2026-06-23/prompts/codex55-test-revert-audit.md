# Co-planner review — regression-guard / revert-sensitivity audit (WK_0623 commit 1fbc273)

**Reviewer:** codex55 (co-planner). **Repo:** ~/websites/meet-poc (you are in it). **Branch:** `main` @ 1fbc273.

## The question JROM is asking
For each of the 6 fixes shipped in 1fbc273, are the tests updated such that **reverting the production change would make at least one test go RED**? If a fix has NO test that would fail on revert, that is a **silent-regression gap** — flag it loudly. "Tests pass" is not the bar; "tests would catch a revert" is the bar.

## Method (per fix)
1. Read the production change file(s).
2. Identify the specific test(s) that lock the fixed behavior.
3. Mentally (or actually) revert the change and decide: does a test assert on the exact post-fix behavior such that it fails? Classify **revert-caught** as:
   - **YES** — a test asserts the new behavior directly; revert → red.
   - **WEAK** — only indirect/e2e coverage, or asserts a side-effect that could still pass after revert.
   - **NO** — no test exercises this path; revert is silent.
4. If WEAK/NO, name the missing assertion (one line: "add a test that asserts X when Y").

## The 6 fixes → suspected guard tests

| # | Fix | Production change | Guard test(s) to verify |
|---|-----|-------------------|-------------------------|
| 0 | **Auto-admit** (the real app bug) | `backend/src/modules/signaling/index.ts` — `autoAdmitAllowed` hoisted above the closed-room wait + added `&& !autoAdmitAllowed` to the wait condition (~L1036) | `backend/tests/signaling-auto-admit.test.ts` — "admits a non-owner guest into closed AGENTROOM when auto_admit=1" + "still sends non-owner guests to the waiting room when auto_admit=0" |
| 1 | **B1 transcription** (no phantom-?, owner-labeled, versioned) | `backend/scripts/transcribe.py` (speaker_for_ms removed; read_participant_owner + label_words_with_owner; mixed file → skip), `backend/src/modules/recording/openrouter-transcribe.ts` (versioned `<file>.transcript.<provider>-<model>.json`) | e2e: `b1c-transcript-versions`, `v3-fixb2-transcript`, `v3-fixb4-transcripts`, `v3-fixc8-transcriber-config`. **NOTE: there is NO backend unit test for transcribe.py — confirm and judge whether e2e is enough.** |
| 2 | **B2 superuser** god-mode | `backend/migrations/0015_superuser.sql`, `backend/src/modules/admin/guards.ts` (isSuperuserTargetBlocked, isSuperuserEmail, admin list returns `protected` not `is_superuser`) | `backend/tests/admin-superuser.test.ts` |
| 3 | **B3 passwordless TG** | `backend/migrations/0016_tg_passwordless.sql`, `backend/src/modules/telegram/tg-passwordless.ts` (number-match auth, vlk: prefix, webhook secret) | `backend/tests/tg-passwordless.test.ts` |
| 4 | **B4 cam-off background + initials** | `frontend/src/app/components/tile/tile.component.html`/`.ts` (camOffBackdropUrl backdrop + initials chip), signaling `RelayPeerBackground` | e2e: `b4-call-ui`, `e2e/tests/background-effects.spec.ts`, `rah14-render-smoke-b4b.spec.ts` |
| 5 | **B5 recording-lost-on-end** | `frontend/src/app/services/recorder.service.ts` (`flushRecordingForExit()` — stop→allSettled upload→clear pending flag; per-user codec fallback), `frontend/src/app/pages/room/room.page.ts` (5-min cap, beforeunload guard on isUploading) | `frontend/src/app/pages/room/room-recording.spec.ts`, `frontend/src/app/services/recorder-leaks.spec.ts`; e2e `b5-recording`, `v3-fixb3-recordings` |

## Deliverable
Write your verdict to: `plan/WK_0623/projcore-run-2026-06-23/validation/codex55-revert-audit.md`

Format: one table row per fix — `# | fix | guard test | revert-caught (YES/WEAK/NO) | missing assertion (if any)`. Then a short **Gaps** section listing every WEAK/NO with the exact one-line test to add. End with a single verdict line: `VERDICT: all-guarded` or `VERDICT: N gaps`.

Do not edit production or test code — this is a read-only audit. Just write the markdown verdict file.
