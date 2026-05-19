# M-B5 Scenarios Implemented

| Scenario | Status | Evidence |
|---|---|---|
| S6.2 MediaRecorder mime fallback | PASS | Fake MediaRecorder e2e asserts `audio/mp4` selected when webm unsupported |
| S6.2 uploaded extension matches codec | PASS | E2E asserts upload filename `.mp4`; backend test covers `X-Ext: mp4` |
| S6.6 iOS recorder timeslice | PASS | iPhone UA e2e asserts `lastRecorderTimeslice === null` and fake recorder received no timeslice |
| S6.7 graceful landscape orientation | PASS | 844x390 e2e asserts call controls and lobby preview fit visible viewport |
| R6.3 backend mp4/aac compatibility | PASS | Backend list/parse/download accepts mp4/aac; targeted mp4 test |
| R8.1 Run 1 desktop regression | PASS | 40/40 Playwright regression |
| M-B4 regression | PASS | 4/4 M-B4 Playwright regression |

## Deferred By Contract

Fullscreen helper remains deferred to v3.5. No fullscreen helper or tap-to-focus behavior was added.
