# Batch B2a — Scenarios (R2 partial: recovery coordinator + epoch guard + rungs 1-2)

| ID | Scenario | Expected | Status |
|----|----------|----------|--------|
| S1 | Forced `/api/sfu/tracks` 406, same-session retry (rung 1) | 3 same-session attempts, `subscribe-retry` event per attempt, `forceRenegotiation:false` | ✅ tsx |
| S2 | Rung 1 exhausts | Escalates to rung 2 — forced renegotiated subscribe, `forceRenegotiation:true` | ✅ tsx |
| S3 | Rung 2 exhausts (2 attempts) | `needs-rejoin` diagnostics event fires exactly once; publisher still `advertised-not-subscribed` | ✅ tsx |
| S4 | Post rung-2-exhaustion, ~30s low-frequency continuation | Keeps issuing subscribe POSTs + `throttled` events — **no permanent latch**, guard not left stuck | ✅ tsx |
| S5 | Transport-error (non-406) subscribe failure | Same rung1→rung2→needs-rejoin→low-freq ladder as S1-S4 | ✅ tsx |
| S6 | Coordinator attempt-count/flag shape | Exact rung sequence `retry:1,2,3 → renegotiate:1,2 → needs-rejoin:3`; POST `forceRenegotiation` flags `[F,F,F,F,T,T]` | ✅ tsx |
| S7 | Epoch guard: subscribe POST in flight when a local reset/rejoin bumps `recoveryEpoch` | Stale response resolves but does NOT bind (`subscribedTracks` stays empty) | ✅ tsx |
| S8 | 406 evidence still recorded through escalation | `lastSubscribeFailureEvidence` retains httpStatus/errorCode fields at `needs-rejoin` | ✅ tsx |

**Flip from B1 (intentional):** B1's `BUG-REPRO-R1-406-subscribe-cap-give-up` /
`BUG-REPRO-R1-advertised-not-subscribed-stuck-give-up` asserted the OLD give-up outcome (guard latched, zero
further POSTs). B2a rewrites those same test blocks (renamed `-escalates`) to assert the NEW escalation
outcome — this is the required flip called out in B1's test-report.md.

**Out of scope for B2a (approved carve-out):** mid-call-subscribe-retry and live-mid-conflict-retry keep
their pre-existing flat-cap behavior (only gained the epoch-guard bind-check). Rung 3 (full local SFU
rejoin, consuming the `needs-rejoin` marker) is B2b.
