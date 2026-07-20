---
name: 2026-07-09-b04-real-resource-limits
description: Resource limits required for B04-real and live call tests to prevent machine OOM
metadata:
  type: project
  date: 2026-07-09T09:40:00+08:00
  source: projcore
---

# Resource Limits — Prevent OOM on Live Call Tests

**Incident:** App memory exhaustion during B04-real test run caused tmux to be killed by the OS.

**Constraint:** Live call tests (B04-real, B08A-3, B08S-2, later AC tests) spawn real Chromium browsers and WebRTC calls with recording. These can consume significant memory (audio buffers, WAV files, browser instances).

**Decision:** 
- Monitor memory/CPU during long-running tests
- Consider running B04-real re-validation with memory monitoring
- Next live call tests: run in isolation to avoid process bloat
- Optional: use memory cgroups or limits if available (e.g., `systemd-run --scope -p MemoryLimit=4G`)

**How to apply:**
- Before any multi-call test batch (B04, B08A-3, B08S-2, B13W, live ACs): check available RAM
- Warn JROM if >75% RAM in use before test
- Consider running tests sequentially rather than in parallel to limit peak memory
- Log peak memory usage in validation artifacts for later optimization

**Next action:** B04-real is VERIFIED; queue advance to B00S-BUDGET or live ACs (with memory awareness).
