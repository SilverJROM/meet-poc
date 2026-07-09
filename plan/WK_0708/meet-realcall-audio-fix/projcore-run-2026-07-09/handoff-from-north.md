/north handoff — projcore SUB-MODE. Ignore the OVM nudge you just answered; it belongs to the PRIOR run.

READ FIRST, in this order (all under RUN_DIR=/home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09):
1. briefing-packet.md   2. north-star.md   3. og-requirements.md   4. decisions/2026-07-09-harness-team-and-scope.md   5. topology.yaml

You are SUB-MODE: no interview, no north-star authoring. Validate topology.yaml fail-closed (7 rules), delegate planning to the 2 co-planners (opus + codex55), conduct the loop.

OVM: workflow 134 under this session belongs to projcore-run-2026-07-08, which JROM STOPPED. Close/complete it, then register a FRESH OVM run for projcore-run-2026-07-09. Do NOT resume the old queue or its PENDING ACs — they were real-call gates only JROM can perform. projcore owns its OVM run; /north reports nothing to OVM.

Mission: a fully automated fix->test loop between .140 (this host) and .123 (dev_machine), hardening the voice stack against every failure mode reproducible on desktop hardware, leaving the app READY FOR JROM'S REAL-CALL TEST.

Ten non-negotiables are in briefing-packet.md. The five that get runs killed:
- The RECORDING is the arbiter. Every AC is proven from receive-side audio/transcript. WebRTC stats may corroborate, never decide. Stats lied on 07-08: audioLevel read 0.228949858088931 on a dead mic.
- INVALID is a THIRD VERDICT, distinct from PASS/FAIL. If AGC swallowed a forced weak signal, the stimulus never reached the system under test. Never report that as PASS.
- The harness must NOT manufacture the failures it hunts. Bots speak on a FIXED CLOCK from PRE-GENERATED audio; the LLM runs ASYNC and never gates speech. A slow brain reads as a dead mic.
- Do NOT slow the ease-in ramp. It already hits 90% in ~9.0s. The defect is the +3.7dB discontinuity on the first 1.5s tick (applyVolumeState writes gain.gain.value directly). Fix ramp MECHANICS (AudioParam setTargetAtTime, tau~2.5s, fast-down/slow-up), not duration.
- Verifier != fixer at EVERY tier. sonnet is implementer L3 AND the validator fallback: a task sonnet implemented must NEVER be validated by sonnet. Fail-closed error.

EXIT (bounded — the prior run circled ~6h on an unsatisfiable one): DONE iff (clean 3-5min conversing call AND clean 10-min final gate) OR the 25-call budget is exhausted. Then STOP, report, notify, and shut down dev_machine. 3-5min calls burn (incl. harness-caused aborts); 10-min gates do not burn, capped at 5. NO gate waits on JROM. Completion wording is "ready for JROM's real-call test" — never a bare "fixed".

GUARDRAILS: no merge to main. Fix locally; SG is confirmation-only, never iterated on. Delete only harness-created sessions/rooms by IDs captured at creation — NEVER session 652c1475 (the only real evidence of the actual bug), NEVER room TEST_ROOM01 (testroom01001), no wildcard sweeps. Do not touch client prod server 139.180.129.185. Peer2's machine is offline. Android emulation: answered and skipped (D22).

CONSERVE: codex55 is at ~4% weekly headroom. Ration it; validator L1/L2 falls open to sonnet and the report must SAY SO (cross-provider independence lost). spark draws its OWN bucket (~92% headroom) — agent-usage.sh's rungs.spark is buggy, read raw.codex.spark_*. implementer.L1 is an A/B ALTERNATION (spark -> grokcompose -> spark, start with spark); record per-task model + outcome in progress.md for JROM's comparison. If spark empties, report the comparison as TRUNCATED, not a verdict. Red-team: budget by default, elite only after a fix has failed twice.

ENV IS ALREADY PROVISIONED — do not reinstall. dev_machine 192.168.254.123 (wake: python3 /home/agjrom/websites/local_dev/wake-123.py; it is currently UP): llama.cpp at ~/llama.cpp-src/build/bin, models Qwen2.5-{0.5B,1.5B,3B}-Instruct-Q4_K_M.gguf in ~/agent-gateway/models/, and ~/voicesim/{bin/whisper-cli, models/ggml-base.en.bin, piper/piper, voices/en_US-amy-medium.onnx}. piper->whisper round-trip verified verbatim in 772ms. llama throughput is UNMEASURED (llama-cli hung; use the HTTP server on :8080). Playwright Chromium, Xvfb, PipeWire, ffmpeg, node 24 present. Guide: /home/agjrom/websites/local_dev/dev_machine.md.

Branch: batch-01-diagnosis-2026-07-08 (consolidated main + fix 856104f). FE changes need `ng build` to be live on https://voice.silverjrom.app.

Child sessions MUST use the reserved prefix: x-01_<function>_<model>_meet. This session (lkvcgrok) is JROM's deliberate exception because OVM keys the run to it.

Strategy gap? Write RUN_DIR/callbacks.md and KEEP WORKING — /north is not tmux-addressable and polls on a 45-60min check-in. Do not block on /north. Notify JROM only on DONE or BLOCKED/URGENT.

Start now: validate the contract, close the stale OVM run + register the new one, spawn the co-planners, produce an ATOMIC plan.md (<30min tasks), post STATUS: PROPOSED for the Phase 0.5 handshake.
