# codex55 revert-sensitivity audit

| # | fix | guard test | revert-caught (YES/WEAK/NO) | missing assertion (if any) |
|---|-----|------------|------------------------------|----------------------------|
| 0 | Auto-admit | `backend/tests/signaling-auto-admit.test.ts` asserts a non-owner guest joining closed AGENTROOM with `auto_admit=1` receives `type: admitted`, and a normal closed room still receives `type: waiting-room`. | YES |  |
| 1 | B1 transcription | `backend/tests/recording.test.ts` covers mixed recording rejection, session queueing only per-user recordings, named transcript merge with zero `?`, OpenRouter owner labeling, and versioned transcript APIs. `e2e/tests/b1c-transcript-versions/transcript-versions.spec.ts` covers the versions panel. `backend/scripts/test_owner_labeling.py` directly checks Python owner labeling, but it is outside `backend/tests` and is not wired into `backend/package.json`'s `test` script. | WEAK | Add a CI-wired test that runs `backend/scripts/transcribe.py` against a mocked/fake per-user audio transcription path and asserts it skips mixed recordings and writes `<file>.transcript.local-<model>.json` with owner labels and no `?`. |
| 2 | B2 superuser god-mode | `backend/tests/admin-superuser.test.ts` asserts the seeded superuser bit, `/api/me`-only exposure, protected admin-list row, 403s for admin targeting superuser delete/role/edit/email/reset, mixed-case/space-padded targeting, and superuser self/other allowed paths. | YES |  |
| 3 | B3 passwordless TG | `backend/tests/tg-passwordless.test.ts` asserts challenge creation/rate limiting, `vlk:` inline keyboard callbacks, number-match approve/deny/consume behavior, foreign-user rejection, webhook secret gate, status/complete, and activation settings/enroll/verify/disable flows. | YES |  |
| 4 | B4 cam-off background + initials | Candidate guards are `e2e/tests/b4-call-ui/controls.spec.ts`, `e2e/tests/background-effects.spec.ts`, and `e2e/tests/rah14-render-smoke-b4b.spec.ts`. They cover camera toggling, blur stream replacement, and diagnostics render smoke, but none asserts a camera-off tile renders the selected image background, `.initials-chip`, or remote `media-state.background` relay. | NO | Add a UI/e2e test that selects an image background, turns camera off, and asserts the tile renders `.camera-off-avatar.has-bg-image` with `background-image` and `.initials-chip`; include a remote peer assertion for relayed `media-state.background`. |
| 5 | B5 recording-lost-on-end | `e2e/tests/b5-recording/record-host-leave-upload.spec.ts` delays the primary `/upload`, exits via both close-room and leave paths, then asserts a new recording file exists and appears on `/app/recordings`. The plain leave path would fail on revert because old `justLeave()` did not flush/upload before leaving. | YES |  |

## Gaps

- B1 transcription: Add a CI-wired test that runs `backend/scripts/transcribe.py` against a mocked/fake per-user audio transcription path and asserts it skips mixed recordings and writes `<file>.transcript.local-<model>.json` with owner labels and no `?`.
- B4 cam-off background + initials: Add a UI/e2e test that selects an image background, turns camera off, and asserts the tile renders `.camera-off-avatar.has-bg-image` with `background-image` and `.initials-chip`; include a remote peer assertion for relayed `media-state.background`.

VERDICT: 2 gaps
