# Meet-UI Run — Batch Queue

Codex session: `lkcdx-meet-v6` (v2.0). Branch: `fix/meet-conn-diag` (carries DR-1..25).

| # | Batch | Req | Status |
|---|---|---|---|
| 1 | mui — Meet-like UI restyle | DR-26 | **PASS + DEPLOYED** | b972c01 + 64ec2eb (iter1 test fixes). mui 4/4, b4-call-ui 8/8, gate 96/96, deployed live. JROM visual sign-off pending. |
| 2 | chat — ephemeral in-call chat | DR-27 | **PASS + DEPLOYED** | fd59ca9. e2e 1/1, backend 117/1-skip, XSS-safe, server-auth sender, deployed. |
| 3 | diaglog — persistent per-call diagnostics log | DR-28 | IN_PROGRESS |
| 4 | usfix — US connection fix | DR-8 cont. | GATED on DR-28 log data from a real US call |
| 5 | extdev — external mic/camera fix | DR-29 | PENDING. Added 2026-05-20. Device-acquisition family (with DR-25). Needs failure-mode clarification at dispatch. |

Order (JROM): Meet UI → chat → diagnostics-log → US-fix. One batch at a time, v2.0 plan-handshake. Env-hygiene rule enforced.
