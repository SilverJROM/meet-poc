# Requirements Matrix — WK_0623

Contract for acceptance. No row may read VERIFIED until projcore independently validates it.
Status legend: `PLANNED` (designed, not built) · `IN-PROGRESS` · `BUILT` (impl claims done) · `VERIFIED` (projcore confirmed) · `BLOCKED`.

All rows below are **PLANNED** — implementation is gated behind JROM's post-call "go".

## Issue #1 — Transcription

| ID | Requirement | Acceptance evidence | Status |
|----|-------------|---------------------|--------|
| R1.1 | No phantom speaker. A 2-person call produces a transcript with exactly the 2 real participants — never a `?` / 3rd party. | Re-transcribe the existing per-person files (or a fresh 2-person call); merged transcript contains only the 2 owners; zero `?` labels. | VERIFIED (batch-B1a) |
| R1.2 | Per-person is the sole transcription source. Each per-person file's lines are all attributed to that file's owner; no per-word segment guessing. | Code: `speaker_for_ms` diarization removed/neutralized; unit/inspection shows owner-only labeling. | VERIFIED (batch-B1a) |
| R1.3 | Mixed webm is never transcribed but stays downloadable. | Mixed file still downloadable in UI; no transcript job runs against it. | VERIFIED (batch-B1a) |
| R1.4 | Timestamped, aggregated, non-overlapping merged transcript across all participants. | Merged transcript shows `[mm:ss] Name: text` ordered by time; lines from different people interleave correctly. | VERIFIED (batch-B1a) |
| R1.5 | Pluggable transcriber — local Whisper models selectable (small/medium/large-v3). | Host selects model; transcript records which model produced it. | VERIFIED (batch-B1b) |
| R1.6 | Pluggable transcriber — at least one real cloud STT vendor integrated behind the seam (not the inert stub). | With `MEET_STT_*` set, a real cloud transcription returns owner-labeled, timestamped lines for a per-person file. | VERIFIED (batch-B1b) |
| R1.7 | Bilingual: Tagalog + English accepted, including code-switching, on the chosen path(s). | Bilingual sample transcribes both languages without dropping one. | VERIFIED (batch-B1b) |
| R1.8 | Versioned transcription: host can add a new transcription (provider+model) for a meeting, keep multiple, delete one, and mark one primary — without destroying others. | UI: add → 2 versions coexist; delete one → other remains; primary selectable; storage keyed by (recording × provider × model). | VERIFIED (batch-B1b) |
| R1.9 | Fail-safe preserved: selecting a provider with no key/endpoint is a logged no-op, never errors the call/recording path. | Misconfigured provider → no crash, recording intact, clear log. | VERIFIED (batch-B1b) |
| R1.10 | International call path unaffected. | Real PH↔US call still connects + records + per-person transcribes; no media-path regression. | VERIFIED (live PH↔US call 2026-06-23: Peer2US audio+video bytesSent rising US→PH) |

## Issue #2 — Concealed superuser + admin powers

| ID | Requirement | Acceptance evidence | Status |
|----|-------------|---------------------|--------|
| R2.1 | Superuser tier exists, seeded for `silverjrom@gmail.com` only, not grantable via UI. | Migration adds `is_superuser`; only silverjrom seeded; no endpoint/UI sets it. | VERIFIED (batch-B2a) |
| R2.2 | Admin can create, delete, and toggle-admin on other users. | Admin session: create ✓, delete ✓, promote/demote ✓ via UI+API. | VERIFIED (batch-B2a) |
| R2.3 | Superuser can edit any user's username, email (cascade), and role; and reset passwords. | Superuser session performs each; email-edit cascades all FK tables; password reset lets the user log in with the new password. | VERIFIED (batch-B2a) |
| R2.4 | Admin CANNOT edit email/username/role-beyond-admin-toggle or reset passwords. | Those endpoints reject an admin (non-superuser) with 403. | VERIFIED (batch-B2a) |
| R2.5 | Concealment: `is_superuser` never sent to other users' clients; superuser shows as "Admin". | Network payload to a non-superuser admin contains no superuser flag; role column reads "Admin". | VERIFIED (batch-B2a) |
| R2.6 | Protection: superuser row greyed/disabled for everyone; backend hard-blocks any delete/demote/edit/reset targeting the superuser, regardless of caller. | UI greys the row; API rejects every destructive action vs superuser (even from another admin) with 403. | VERIFIED (batch-B2a) |
| R2.7 | Every god-mode mutation (self or others) requires a confirmation step. | UI shows confirm dialog before each role/email/username/password mutation. | VERIFIED (batch-B2b) |
| R2.8 | Self-lockout guards: superuser cannot drop own superuser status via UI; self email-change requires confirm. | Attempt to self-demote blocked; self email-change gated by confirm. | VERIFIED (batch-B2a) |
| R2.9 | No regression to existing auth/login/admin-create or room ownership. | Existing login + admin create-user still pass; rooms still owned correctly after any email edit. | VERIFIED (batch-B2b) |

## Issue #3 — Passwordless Telegram login (number-matching)

| ID | Requirement | Acceptance evidence | Status |
|----|-------------|---------------------|--------|
| R3.1 | Telegram icon on login; entering email + clicking it shows a 2-digit number on screen. | UI renders icon; click with valid eligible email shows displayNumber. | VERIFIED (batch-B3a) |
| R3.2 | The matching number + 2 decoys are pushed to the user's linked Telegram as 3 inline buttons. | Telegram message arrives with 3 buttons; one equals the on-screen number. | VERIFIED (batch-B3a) |
| R3.3 | Tapping the correct number logs the user in with no password; tapping wrong kills the challenge. | Correct tap → session issued (cookie), redirected in; wrong tap → denied, no login. | VERIFIED (batch-B3a) |
| R3.4 | On resolution the challenge message is rewritten (buttons removed) — "✅ Signed in" / "❌ denied". | Telegram message updates; buttons gone; cannot re-tap. | VERIFIED (batch-B3a) |
| R3.5 | Only linked + activated accounts can use it; otherwise the icon shows "must activate passwordless login in the app". | Unlinked/not-activated email → not-enabled message, no number, no send. | VERIFIED (batch-B3b) |
| R3.6 | Activation is test-before-activate in Settings (one successful number-match required); disable requires reauth. | Enroll → test round → activate only after a correct tap; disable asks for password. | VERIFIED (batch-B3b) |
| R3.7 | Anti-abuse replicated: 2min challenge TTL, single-use, one-wrong-tap-kills, per-challenge/user/email+IP rate caps, deferred send, constant-time eligibility. | Tests cover expiry, single-use, wrong-tap, caps; eligibility shape/timing identical for ineligible. | VERIFIED (batch-B3a) |
| R3.8 | Webhook security: constant-time secret-token check + callback `from.id` == linked telegram_user_id; meet-poc-owned callback prefix. | Forged/missing secret → 401; foreign from.id → silently ignored; prefix `vlk:`. | VERIFIED (batch-B3a) |
| R3.9 | No regression to existing Telegram link flow, mini-app auto-login, or password login. | `/link`, mini-app initData login, and password login all still work. | VERIFIED (batch-B3b) |
| R3.10 | International reachability unaffected (login works PH↔US). | Real or faithful-shape check from non-local network. | VERIFIED (live call: voice.silverjrom.app 200 + media from US egress 100.16.57.177) |

## Issue #4 — Camera-off background + initials

| ID | Requirement | Acceptance evidence | Status |
|----|-------------|---------------------|--------|
| R4.1 | When cam is off AND an image background is set, the tile backdrop shows that background image (not the solid avatar color). | Toggle cam off with a background → tile shows the background image. | VERIFIED (batch-B4) |
| R4.2 | Initials ('JO') render on the upper side of the tile, legible over the image. | Visual: initials top-left with contrast scrim/chip. | VERIFIED (batch-B4) |
| R4.3 | Fallback: no image background (blur/none) → current centered solid-color avatar unchanged. | Cam off with no bg → today's avatar. | VERIFIED (batch-B4) |
| R4.4 | Other participants also see the user's background + initials when that user's cam is off (Scope B, locked). | Second client sees peer's bg+initials on cam-off. | VERIFIED (batch-B4) |
| R4.5 | No regression to live video, background compositing while cam on, or other overlays (mic/host/quality). | Cam on still composites bg; overlays intact. | VERIFIED (batch-B4) |

## Issue #5 — Recording reliability (lost on call end)

| ID | Requirement | Acceptance evidence | Status |
|----|-------------|---------------------|--------|
| R5.1 | A real-length recording (≥20 min / ≥20 MB) that is stopped by ending/leaving the call is reliably saved. | Host records a long call, ends → `[rec] saved` logged + file on disk + visible in Library. | VERIFIED (batch-B5) |
| R5.2 | Page teardown (close-room / leave / navigate / tab close) does not abort an in-flight recording upload. | Upload completes before teardown, or teardown is blocked until it does. | VERIFIED (batch-B5 iter1) |
| R5.3 | The 8s upload timeout no longer truncates large uploads (timeout only guards MediaRecorder stop, not the upload). | Large upload finishes; no premature "upload timed out". | VERIFIED (batch-B5 iter1) |
| R5.4 | Per-user recordings are saved with the same reliability (not fire-and-forget through teardown). | Per-user webms + participant.json present after a long ended call. | VERIFIED (batch-B5) |
| R5.5 | If a recording cannot be saved, the host is told clearly at end-of-call (not a transient status line). | Forced-fail path surfaces a host notice (reuse leave-dialog/callIssues). | VERIFIED (batch-B5) |
| R5.6 | Post-session reconciliation/check: `recording-state started` with no saved file is flagged (log + notice). | Simulated loss → flagged, never silent. | VERIFIED (batch-B5) |
| R5.7 | No regression: short recordings + the existing save path still work; international call path unaffected. | Short record saves; PH↔US unaffected. | VERIFIED (batch-B5) |

## Follow-up — Regression-guard coverage (2026-06-24, impl=codex55, validate=sonnet)

Closes the 2 silent-regression gaps from `validation/codex55-revert-audit.md`: every guard proven RED-on-revert by the independent validator (`validation/sonnet-gap-closure-verdict.md`), zero production edits left behind.

| ID | Requirement | Acceptance evidence | Status |
|----|-------------|---------------------|--------|
| RG1 | Reverting the transcript phantom-`?` / mixed-skip / versioned-sidecar fix in `transcribe.py` fails the build (Python guard now CI-wired into `npm test -w backend`). | `transcribe-python.test.ts` runs `test_owner_labeling.py` (4 sub-tests); sabotage (`name="?"`) → RED at `transcribe-python.test.ts:24` / `assertNotIn("?", names)`. | VERIFIED (gap-closure) |
| RG2 | Reverting the cam-off image-background + initials-chip tile render fails the build. | `tile.component.spec.ts` (local + remote-relayed paths); removing `has-bg-image` → RED at spec `:52,:73`. | VERIFIED (gap-closure) |
| RG3 | Reverting the `media-state.background` relay fails the build. | `signaling-background-relay.test.ts`; stripping the `background` spread → RED at `:36` (`toMatchObject` missing key). | VERIFIED (gap-closure) |
