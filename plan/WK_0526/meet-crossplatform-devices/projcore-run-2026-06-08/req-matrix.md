# Requirements coverage matrix — projcore-run-2026-06-08

| Req# | Requirement (first 80 chars)                                                   | Batch | Evidence                                  | Status      |
|------|--------------------------------------------------------------------------------|-------|-------------------------------------------|-------------|
| R1   | Host hears every remote participant's audio on a real intl/cross-platform call  | IMPL-1..CR | validation/* + 13-lens code red-team PASS | CODE-VERIFIED (real-call pending) |
| R2   | Host receives audio from ALL concurrent remote publishers, not one at a time    | IMPL-1/2/5 | reclaim-safe mid-guard + 2-pub tests; CR PASS | CODE-VERIFIED (real-call pending) |
| R3   | Inbound-audio playout observability (audioLevel/energy + playout state)         | IMPL-3..CR | media-playout + per-publisher blockedReason/sink diag | CODE-VERIFIED (real-call pending) |

GATE: 13-lens code red-team, CRITICAL 3/3 PASS. Final VERIFIED on JROM real US<->PH call.
Security: clientKey credential stripped (store+read), backend 15/15. Recorder audio-only = by-design (JROM-accepted). Pre-existing signaling-reconnect red = separate ticket. Zero regressions (FE 25/25, ng build green).
