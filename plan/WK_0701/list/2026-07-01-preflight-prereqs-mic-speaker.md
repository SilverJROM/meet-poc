---
date: 2026-07-01
type: bug (pre-existing, out-of-scope)
status: surfaced-not-fixed
agent: projcore
qa_verification: room-decisions.spec.ts line ~434 fails deterministically
---
# Pre-existing preflight-prereqs test failure (unrelated to SFU self-heal)

Discovered during WK_0701 SFU self-heal run. `room-decisions.spec.ts` L434 fails:
`missingPreflightPrereqs({hasMicAccess:false, micVerified:false, speakerTested:false})` returns `['mic']`
but the test expects `['mic','speaker']` ("R1: no mic access → mic blocked + speaker untested").

Present at base e9aedff — NOT caused by this run. These frontend node:assert specs are not in the root
`npm test` (backend-only), so it has been silently red. Either the test expectation is stale (a prior
refactor made missingPreflightPrereqs mic-only) or production should flag speaker-untested. This is a
preflight-gate PRODUCT decision, outside R1-R6 scope — surfaced for JROM, not fixed autonomously.
