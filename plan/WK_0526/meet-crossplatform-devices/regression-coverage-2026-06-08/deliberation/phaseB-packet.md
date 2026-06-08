# PHASE B DELIBERATION — test-harness design + known-issue research (single focused round)
# (Budget-aware: be concise, evidence-dense, no filler.)
## Inputs (read)
- ../archaeology/signatures.md — the 12 DISTINCT historical failure signatures mined from 48 real calls.
- The shipped fix: ../../projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/consensus-r4-registry.md (per-publisher registry + diagnostics).
## Goal
Produce a concrete plan to (A) RECREATE each historical signature as a test that asserts the CURRENT app handles it, and (B) add researched known-issue scenarios. Two test tiers:
- T1 telemetry-REPLAY: feed a real session's exact getStats sequence (from the DB) into the playout/watchdog/subscribe DECISION logic + diagnostics, assert correct outcome. Deterministic, cheap. Map EACH of the 12 signatures to a T1 test.
- T2 real-browser: Chrome `--use-file-for-fake-audio-capture=<wav>` (real audio) + PulseAudio `module-null-sink` (>=2 output devices, host selects non-default) + `parecord` on the null-sink to PROVE audio reached the selected device. Multi-context (mobile-emulated + desktop). For the CRITICAL audio/video/record paths.
## Your task (each panelist, ONE pass)
1. For EACH of the 12 signatures: which tier (T1/T2/both), what to inject, what to ASSERT (the outcome that proves the app now handles it). Be specific.
2. RESEARCH (if you have web access — codex/sonnet): known WebRTC / Cloudflare-Calls-SFU / cross-platform audio-video-record failure modes NOT in our 12 (e.g. Chrome setSinkId quirks, autoplay policies, iOS Safari WebRTC, Android Chrome backgrounding, devicechange races, simulcast/RID, ICE/TURN, opus DTX, AEC, MediaRecorder gaps, renegotiation glare). List the top ~8-12 with a 1-line test idea each + source. If no web access, propose from knowledge + mark [from-knowledge].
3. Harness feasibility: exact tooling commands for T2 (Chrome flags, pulseaudio null-sink setup, parecord, Playwright multi-context). Any blocker on THIS Linux box?
## Output: write ../deliberation/phaseB-<role>.md
```
## T1 telemetry-replay plan (per signature: inject → assert)
## T2 real-browser plan (per critical path: setup → assert, incl parecord proof)
## Researched known-issues (top ~8-12: name | 1-line test | source | severity talk/record/see)
## Harness tooling commands + any blocker
```
Be concise. Evidence/commands over prose.
