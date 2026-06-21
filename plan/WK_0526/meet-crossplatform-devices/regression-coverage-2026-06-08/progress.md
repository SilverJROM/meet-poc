# progress — Regression-Coverage Mission
PA done (12 signatures). PB done (5-model panel: harness plan + ~15 researched issues). PC dispatching (build T1 + unit scenarios).
[overmind] 2026-06-08T10:06:10+00:00 sync OK current='' tasks=0
PC build dispatched 2026-06-08T10:06:43Z
[overmind] 2026-06-08T10:06:43+00:00 sync OK current='' tasks=0
[overmind] 2026-06-08T10:07:05+00:00 sync OK current='' tasks=0
synced 2026-06-08T10:07:32Z
[overmind] 2026-06-08T10:07:33+00:00 sync OK current='Build the harness and recreate every past and known failure as a runnable test' tasks=5

## P3 (Phase C) DONE @ 2026-06-08T10:18:40Z
Built remote-audio-telemetry-replay.spec.ts + static fixtures from REAL calls. Replay of H1-H12:
- 9 PASS (H3-H11: relay, packet-loss, subscribe-stuck, ws-reconnect, one-at-a-time[registry], high-RTT, outbound-0, pc-failed, publish-error all handled).
- 3 FAIL = real gaps (ISSUES.md): H1 null-energy no-recovery, H2 concealment-false-silent, H12 audioLevel-0 no-recovery.
H1/H12 root: CR-fix-2/4 energy-gate suppresses watchdog when inbound audioLevel/energy is null/0 (Chrome 113+ moved them to media-playout) — defeats the post-play-stall safety net for the EXACT JROM shape → path back to silent-no-banner.
## P4 (Phase D) STARTING: fix the 3 (energy-gate fallback + concealment classifier) — keep CR-fix-2 false-positive protection.
[overmind] 2026-06-08T10:18:40+00:00 sync OK current='Build the harness and recreate every past and known failure as a runnable test' tasks=5
P5 done 2026-06-08T10:25:55Z
[overmind] 2026-06-08T10:25:55+00:00 sync OK current='' tasks=5
[overmind] 2026-06-09T23:13:10+00:00 complete OK
[overmind] 2026-06-10T00:00:26+00:00 complete OK
