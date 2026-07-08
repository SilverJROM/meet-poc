# Requirements Coverage Matrix

| Req# | Requirement | Batch | Evidence | Status |
| --- | --- | --- | --- | --- |
| R1 | Persistent mic-silence self-heal: red-team + retry-cadence regression proof | B1 | redteam/B1-mic-silence-retry/synthesis-CR4.md; validation/dev_machine-B1/dev_machine-report.md; validation/three-machine-live/three-machine-result-1783297297305.json | VERIFIED |
| R2 | Audio codec/bitrate hardening: Opus floor/ceiling + RED/FEC where supported | B2 | `npm run build`; `npx tsx frontend/src/app/services/sfu-client.spec.ts`; `validation/three-machine-live/three-machine-result-1783297297305.json` | VERIFIED |
| R3 | Reconnect resilience: shorter audio gap after drop without WS regression | B3 | `npx tsx frontend/src/app/services/sfu-client.spec.ts`; `npm test -w backend`; final 3-machine gate | VERIFIED |
| R4 | Host-facing silent/reconnecting participant indicator | B4 | existing tile host audio-health path; `npx tsx frontend/src/app/pages/room/room-decisions.spec.ts`; final 3-machine gate | VERIFIED |
| R5 | Per-voice volume balancer/normalizer | B5 | `npx tsx frontend/src/app/services/remote-audio.service.spec.ts`; final 3-machine gate | VERIFIED |
| R6 | Room password + admission policy | B6 | `npm test -w backend -- tests/signaling-auto-admit.test.ts`; `npm test -w backend` | VERIFIED |
| R7 | Production-build Ionicons dynamic icon-name error | B7 | `npm run build`; Playwright production smoke on `https://voice.silverjrom.app/login` with zero console/page errors | VERIFIED |
| R8 | Transcript/recordings library grouping deploy verification | B8 | Playwright production smoke on `https://voice.silverjrom.app/app/transcripts`: grouped meeting cards with date/time and file counts | VERIFIED |
| R9 | Preflight mic/speaker prerequisite behavior | B9 | `npx tsx frontend/src/app/pages/room/room-decisions.spec.ts`; final 3-machine gate | VERIFIED |
| R10 | Pre-existing e2e fixture rot | B10 | restored `window.__meetDebug.senderSnapshot`; exact sign-in fixture already present; `npx tsx frontend/src/app/services/sfu-client.spec.ts`; `npm run build` | VERIFIED |

Statuses: ASSIGNED -> IN-PROGRESS -> CLAIMED -> VERIFIED (or FAIL).
