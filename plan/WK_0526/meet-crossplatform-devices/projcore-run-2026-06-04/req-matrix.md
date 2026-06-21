# req-matrix.md — meet-crossplatform-devices

| Req | Batch | Acceptance (short) | Status | Evidence |
|-----|-------|--------------------|--------|----------|
| R1.1 | B1 | exact-deviceId OverconstrainedError ⇒ retry without exact (cam+mic) | PENDING | unit |
| R1.2 | B1 | all acquire paths covered (preflight/reacquire/toggle/replace) | PENDING | unit+review |
| R1.3 | B1 | in-call camera enable works on non-matching device (opens+publishes) | PENDING | review+LIVE |
| R1.4 | B1 | exact match unchanged; no regression to mac path/selection | PENDING | unit+manual |
| R2.1 | B2 | payload captures platform/UA + device ids + gUM error name | PENDING | unit+manual |
| R2.2 | B2 | queryable per participant; idempotent migration; gated | PENDING | test |

Live (JROM seat): real Android / PC-with-external-cam-mic camera+mic open. Fake-media CANNOT prove R1 (no OverconstrainedError headless).
