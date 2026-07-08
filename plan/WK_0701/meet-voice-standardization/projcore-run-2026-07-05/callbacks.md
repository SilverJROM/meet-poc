# callbacks.md — projcore-run-2026-07-05
[projcore DISPATCH] implementer batch-B1 DISPATCH-batch-B1-implementer-430299-1783289486
[projcore callback] implementer batch-B1 STATUS: PROPOSED — Gate consumption only on eligible sweep; clear stale silence window; fix banner ownership; adapter tests for blocked paths
[projcore ACK] implementer batch-B1 RECEIVED PROPOSED 2026-07-05T22:12:17Z
[projcore approval] implementer batch-B1 APPROVED-PLAN — proceed at tier=high, mode=Grok high; implement pure guard wrapper plus call-site rewire, stale-window cleanup, and targeted no-consumption/banner tests
[projcore DISPATCH] implementer batch-B1-cr2 DISPATCH-batch-B1-cr2-implementer-435119-1783289925
[projcore callback] implementer batch-B1-cr2 STATUS: PROPOSED — Delegate re-arm paths through nextSweepGate even when blocked; blocked silent preserves exhausted; 4 targeted tests
[projcore ACK] implementer batch-B1-cr2 RECEIVED PROPOSED 2026-07-05T22:19:22Z
[projcore approval] implementer batch-B1-cr2 APPROVED-PLAN — proceed at tier=medium, mode=Grok medium; delegate non-consuming re-arm/reset paths, preserve blocked exhausted reporting, and add CR2 tests
