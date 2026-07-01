# Batch B1 — Scenarios (R1 reproduction harness)

| ID | Scenario | Expected (today = BUG-REPRO pass) | Status |
|----|----------|-----------------------------------|--------|
| S1 | Backend fault inject: matching `participantId` + `trackName` on `POST /api/sfu/tracks` | 406 synthetic body; Cloudflare `fetch` not called | ✅ vitest |
| S2 | Backend fault inject: non-matching participant | Normal CF passthrough (stubbed 200) | ✅ vitest |
| S3 | BUG-REPRO-R1-406: client exhausts subscribe retry cap on repeated 406 | Outcome: `advertised-not-subscribed`, guard latched, no further POST after cap | ✅ tsx (fails desired behavior) |
| S4 | BUG-REPRO-R1-stuck: transport errors exhaust same cap | Same terminal give-up outcome as S3 | ✅ tsx (fails desired behavior) |
| S5 | BUG-REPRO-R1-406-evidence: 406 fields recorded | `httpStatus`, `errorCode`, cfSessionIds, track names, `pcSignalingState`; not GUM | ✅ tsx |
| S6 | BUG-REPRO-R1-mark-stalled: watchdog attempt cap | `mark-stalled` latches; polled ticks stay `mark-stalled`, never `recover` | ✅ tsx (fails desired behavior) |
| S7 | BUG-REPRO-R1-epoch-guard contract | Stale epoch / cfSession drift → `shouldBindSubscribeResponse === false` | ✅ tsx |

**Failing-by-design note:** S3, S4, S6 document current give-up. They must **fail** once B2/B3 land self-heal escalation (intentional flip).