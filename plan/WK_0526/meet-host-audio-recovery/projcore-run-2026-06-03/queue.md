# queue.md — meet-host-audio-recovery (dynamic)

- [DONE] B1: Make remote voice actually play — kickstart audio element + auto-resume (no tap) (R1)
- [DONE] B2: Self-healing voice monitor on every device — detect silent-but-receiving and auto-fix (R2)

Notes: B1 = the immediate known-cause fix (Chromium #121673 kickstart + AudioContext auto-resume/keepalive). B2 = the durable self-healing watchdog (JROM directive). Autonomous via CODEX. Branch feat/host-audio-recovery-20260603 off master HEAD. complexity: high.
