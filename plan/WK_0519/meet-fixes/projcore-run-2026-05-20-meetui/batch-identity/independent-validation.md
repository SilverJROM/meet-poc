# DR-37 Independent Validation

## Requirement
Persistent per-browser caller identity. Same browser must map to the same participantId across socket drops and full page reloads, independent of the short-lived DR-31 reconnect token. Unknown clientKey remains a new participant. No DR-39 auto-admit policy in this batch.

## Validation
- Client generates and stores `meet-poc.clientKey` in localStorage and sends it in WS join.
- Server sanitizes the key, stores a meeting-lifetime room-scoped identity map, and reuses participantId from that map.
- Active/reconnecting clientKey matches enter the existing DR-31 resume branch and emit `peer-resumed`.
- Fully expired reconnecting peers rejoin through normal knocking/admit but retain the original participantId.
- Unknown clientKeys receive distinct participantIds.

## Evidence Quality Gate
- Q1 Scenario coverage: PASS. Backend covers active resume, expired-grace durable reuse, and unknown key. E2E covers browser reload/rejoin.
- Q2 Proof at right level: PASS. Backend validates signaling mechanics; Playwright validates browser localStorage plus UI peer identity.
- Q3 Screenshot accuracy: PASS. Screenshot captured after reload/rejoin same identity.
- Q4 Scenario-to-test consistency: PASS. Scenarios map directly to backend and E2E tests.
- Q5 Requirement closure: PASS for DR-37 foundation. DR-38/DR-39 remain explicitly out of scope.

## Verdict
VERIFIED for DR-37 foundation.
