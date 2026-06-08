---
date: 2026-06-08
type: pre-existing-test-failure
status: surfaced (NOT caused by the remote-audio/clientKey work)
agent: projcore
qa_verification: confirmed via git-stash baseline run
---
## Finding
`backend/tests/signaling-reconnect.test.ts > terminates a heartbeat-stale admitted socket as a drop that
can resume by clientKey` FAILS (1 failed | 11 passed), both in the full suite AND in isolation.
## Proof it's PRE-EXISTING (not this run's regression)
- Our diff did NOT touch backend/src/modules/signaling/ (git diff --stat empty).
- Ran the test on the CLEAN BASELINE (git stash our changes) → STILL FAILS identically. So it predates this run.
## Recommendation
Separate ticket — it's a reconnect-by-clientKey signaling test that's red on baseline. Worth investigating
whether the reconnect feature or the test is broken, but ORTHOGONAL to the host-audio fix. Do not block the
audio fix on it.
