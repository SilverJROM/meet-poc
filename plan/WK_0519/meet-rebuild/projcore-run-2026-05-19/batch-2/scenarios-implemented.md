# Scenarios Implemented — B2

| Scenario | Status | Test file | Evidence |
|---|---:|---|---|
| S2.1 authenticated create room | PASS | `backend/tests/rooms.test.ts` | Supertest POST `/api/rooms` returns `{room}` with owner email and 12-hex id. |
| S2.2 unauthenticated create rejected | PASS | `backend/tests/rooms.test.ts` | POST `/api/rooms` without cookie returns 401 `{error:'unauthorized'}`. |
| S2.3 list own rooms newest-first | PASS | `backend/tests/rooms.test.ts` | Direct DB fixtures prove only owned rooms return in descending `createdAt`. |
| S2.4 delete own / forbid other | PASS | `backend/tests/rooms.test.ts` | DELETE own returns `{ok:true}`, other owner returns 403, missing returns 404. |
| S2.5 public exists endpoint | PASS | `backend/tests/rooms.test.ts` | GET `/api/rooms/:id/exists` returns title for existing room and `{exists:false}` for missing. |
| S2.6 owner auto-admit | PASS | `backend/tests/signaling-auto-admit.test.ts` | Real WS owner receives `{type:'admitted', clientId, peers:[], roomTitle, isOwner:true}`. |
| S2.7 guest knock then admit | PASS | `backend/tests/signaling-knock-admit.test.ts` | Guest receives `knocking`, owner receives `knock`, then guest admitted and owner gets `peer-joined`. |
| S2.8 reject closes guest | PASS | `backend/tests/signaling-knock-admit.test.ts` | Guest receives `{type:'rejected', reason:'no'}`, socket closes, owner receives `knock-cancelled`. |
| S2.9 signal relay | PASS | `backend/tests/signaling-signal-relay.test.ts` | Owner signal reaches admitted guest as `{type:'signal', from, data}`. |
| S2.10 peer-left | PASS | `backend/tests/signaling-peer-left.test.ts` | Closing admitted guest socket sends `{type:'peer-left', clientId}` to owner. |
| S2.11 room full | PASS | `backend/tests/signaling-room-full.test.ts` | 9th owner socket receives `{type:'error', error:'room full (max 8)'}` and closes. |
| S2.12 wire format identity | PASS | `backend/tests/signaling-wire-format.test.ts` | Test asserts exact object key order/shapes for legacy protocol messages. |
