# Queue — WK_0623 projcore run

Dynamic queue (§1.4b). Tasklist below is overmind-parseable (`- <id> [status] — <friendly label>`).
Build order: B5 → B1 → B2 → B4 → B3 (B5 first = silent recording data loss).

- B5 [done] — Make sure recordings actually save when the host ends a long call
- B1 [done] — Fix transcript quality and let hosts pick/compare transcription models
- B2 [done] — Give the owner a hidden super-admin with full control over users
- B4 [done] — Keep your background and initials showing when your camera is off
- B3 [done] — Let people sign in with a Telegram tap instead of a password

## Follow-up: regression-guard gap closure (2026-06-24) — impl=codex55, validate=sonnet
Source: `validation/codex55-revert-audit.md` (2 gaps where reverting a fix would NOT be caught by tests).
- G1 [done] — Add a CI-wired test so reverting the transcript phantom-? fix fails the build
- G2 [done] — Add a test so removing the cam-off background + initials render fails the build
- G3 [done] — Independent validator proves each guard goes RED when its fix is reverted

## Batch → docs map (engineering detail; labels above stay user-POV)
| ID | Issue | Decision / plan / req | Complexity |
|----|-------|----------------------|------------|
| B5 | Recording lost on call end (timeout + teardown abort) — HIGH | `decisions/2026-06-23-recording-upload-loss.md`, `plan/B5-recording-reliability.md`, R5.* | complex (Sonnet impl) |
| B1 | Transcription quality / phantom-`?` / OpenRouter + versioned models | `decisions/2026-06-23-transcription-architecture.md`, `plan/B1-transcription.md`, R1.* | medium (grok composer) |
| B2 | Concealed superuser god-mode + admin powers | `decisions/2026-06-23-superuser-godmode.md`, `plan/B2-superuser.md`, R2.* | medium (grok composer) |
| B4 | Cam-off tile keeps virtual background + initials (scope B) | `decisions/2026-06-23-camoff-background-avatar.md`, `plan/B4-camoff-background.md`, R4.* | medium (grok composer) |
| B3 | Passwordless Telegram login (number-matching) | `decisions/2026-06-23-passwordless-telegram-login.md`, `plan/B3-passwordless-tg-login.md`, R3.* | complex (Sonnet impl); own sub-run, T0 webhook spike |

## Run-level MANDATE
Full Peer2-machine e2e (no international regression) after all fixes — HARD gate (north-star).

## Open decisions — RESOLVED (2026-06-23)
- B1 cloud STT = OpenRouter (one key, many models); local Whisper free default; per-transcription model selector.
- B3 email-first trigger ✅; settings toggle always-shown + reports status ✅; lokalcamp params inherited ✅;
  webhook = `/telegram/webhook` exists, only callback_query + secret-token gaps remain.
- B4 scope = B (everyone sees it).
- B5 = phased (Phase 1 Option B hardened-teardown now; Phase 2 Option A chunked durability scheduled).

## Pending JROM inputs (non-blocking)
- `OPENROUTER_API_KEY` for B1 cloud models (optional — local works free).
