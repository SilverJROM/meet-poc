# B21c Test Report

Timestamp: 2026-06-04T19:09:33Z

## Commands
- PASS: `npx tsx frontend/src/app/services/recorder-leaks.spec.ts`
  - Output: `recorder-leaks: all assertions passed`
- PASS: `npx tsx frontend/src/app/pages/room/room-recording.spec.ts`
  - Output: `room-recording: all assertions passed`
- PASS: `npx tsx frontend/src/app/services/active-speaker-leaks.spec.ts`
  - Output: `active-speaker-leaks: all assertions passed`
- PASS: `npx ng build` from `frontend/`
  - Output location: `/home/agjrom/websites/meet-poc/frontend/dist/meet-poc-frontend`
  - Warnings observed: existing `DatePipe` unused warning, Stencil empty glob warning, and MediaPipe CommonJS optimization warning.
- PASS: `pm2 restart meet-poc-fe`
  - Result: `meet-poc-fe` id 61 restarted and online.

## Evidence Mapping
- REC5 stop/discard race: covered by new recorder-leaks assertions for stop-then-discard and discard-then-late-onstop cleanup/stop counts.
- REC6 zero-audio warning: covered by new recorder-leaks console.warn assertion.
- REC8 actual MIME: covered by pure resolver assertions plus blob/header assertions using fake recorder `audio/ogg; codecs=opus`.
- REC4 timeout: covered by code review against existing `withTimeout` helper reuse in the host toggle path; build confirms type correctness.
