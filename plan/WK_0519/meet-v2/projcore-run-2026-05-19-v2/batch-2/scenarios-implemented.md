# v2-B2 Scenarios Implemented

| Scenario | Status | Test path | Evidence |
|---|---:|---|---|
| S2.1 `/upload` requires session cookie | PASS | `backend/tests/recording.test.ts` | No-cookie upload returns `401 {error:'unauthorized'}`. |
| S2.2 `/upload` non-host returns 403 | PASS | `backend/tests/recording.test.ts` | Authed non-owner upload to JROM room returns `403 {error:'forbidden'}`. |
| S2.3 `/upload` requires open meeting session | PASS | `backend/tests/recording.test.ts` | Owner upload without open session returns `409` and writes no file. |
| S2.4 `/upload` embeds session id in filename | PASS | `backend/tests/recording.test.ts` | Owner upload with open session writes `<ts>_<sessionId>_<roomId>_<slug>_<rand>.webm`. |
| S2.5 recording started/stopped broadcast | PASS | `backend/tests/signaling-host-actions.test.ts` | Host and guest both receive `recording-started/stopped` with host `clientId` and `sessionId`. |
| S2.6 host ends meeting | PASS | `backend/tests/signaling-host-actions.test.ts`, `backend/tests/sessions-lifecycle.test.ts` | Session closes with `host-end`; admitted peers receive `meeting-ended`; pending knocker receives `rejected`; live room is removed. |
| S2.7 mute-target direct request | PASS | `backend/tests/signaling-host-actions.test.ts` | Only targeted guest receives `mute-request {from:<host>}`. |
| S2.8 remove-peer hard kick | PASS | `backend/tests/signaling-host-actions.test.ts` | Target receives `peer-removed`, socket closes, remaining admitted peers receive `peer-left`. |
| S2.9 non-host host commands dropped | PASS | `backend/tests/signaling-host-actions.test.ts` | Non-host commands produce info logs, no broadcasts, open session remains open. |
