# Meet-UI Run — Batch Queue

Codex session: `lkcdx-meet-v6` (v2.0). Branch: `fix/meet-conn-diag` (carries DR-1..25).

| # | Batch | Req | Status |
|---|---|---|---|
| 1 | mui — Meet-like UI restyle | DR-26 | **PASS + DEPLOYED** | b972c01 + 64ec2eb (iter1 test fixes). mui 4/4, b4-call-ui 8/8, gate 96/96, deployed live. JROM visual sign-off pending. |
| 2 | chat — ephemeral in-call chat | DR-27 | PENDING |
| 3 | diaglog — persistent per-call diagnostics log | DR-28 | PENDING |
| 4 | usfix — US connection fix | DR-8 cont. | GATED on DR-28 log data from a real US call |

Order (JROM): Meet UI → chat → diagnostics-log → US-fix. One batch at a time, v2.0 plan-handshake. Env-hygiene rule enforced.
