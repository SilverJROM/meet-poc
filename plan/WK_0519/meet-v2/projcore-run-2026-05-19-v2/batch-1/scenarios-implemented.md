# v2-B1 Scenarios Implemented

| Scenario | Status | Test path | Evidence |
|---|---:|---|---|
| S1.1 Session opens on first WS join and is idempotent | PASS | `backend/tests/sessions-lifecycle.test.ts` | Owner WS join creates one open row with `admitted_peak=1`; guest knock reuses the same row. |
| S1.2 admitted_peak high-water mark | PASS | `backend/tests/sessions-lifecycle.test.ts` | Owner + guest reaches peak 2; after guest turnover, peak remains 2. |
| S1.3 host-end boundary | PASS for B1 scope | `backend/tests/sessions-lifecycle.test.ts` | `meeting-ended-by-host` remains a no-op in B1 and leaves sockets/session open; B2 will wire `host-end`. |
| S1.4 close on last peer leave | PASS | `backend/tests/sessions-lifecycle.test.ts` | Host leaves first, final admitted non-host leaves, row closes with `ended_reason='last-peer-left'`. |
| S1.5 close on host disconnect empty | PASS | `backend/tests/sessions-lifecycle.test.ts` | Owner joins alone then disconnects; row closes with `ended_reason='host-disconnect-empty'`. |
| S1.6 active sessions listing | PASS | `backend/tests/sessions-api.test.ts` | Authenticated owner receives only their 2 active sessions, excluding another owner. |
| S1.7 ended sessions junk filter | PASS | `backend/tests/sessions-api.test.ts` | Ended listing returns only sessions with `admitted_peak >= 1` and duration `>= 10000ms`. |
| S1.8 pagination | PASS | `backend/tests/sessions-api.test.ts` | 25 eligible ended rows return 20 on page 1 and 5 on page 2 with `total=25`. |
