# Queue — projcore-run-2026-05-28 (fix-loop)

[DONE]       B1: Knock banner toast (R1, R2, R3, R4) — commit 70d7425
[DONE]       B2: Trim audio-publish poll + subscribe-stuck watchdog (R5, R6) — commit 26fc0d7
[DONE]       B3: Build + deploy DEV + 2-browser validate (ALL) — commit 981021a (4 specs PASS in 17.3s)

---

## Injection log (JROM chat-injected items)
_None yet._

## Surprise findings logged for JROM
- The B2 subscribe-stuck watchdog fires REPRODUCIBLY in Playwright (host+guest, every run). State at fire: `pcConnectionState=connected`, no `pc.ontrack` ever. Distinct from JROM's production CONNECTING report (where d216b499 diagnostics show eventual success). Watchdog will now expose this class of stuck-subscribe in real-user logs if it ever happens. Recommend separate diagnosis after meet-features run completes — DO NOT investigate this run.
