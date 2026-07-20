# P3-LIVE-11 PROPOSED plan

## Plan

Same pattern as P3-LIVE-09/10: copy `p3-live-10-smoke.ts` → `p3-live-11-smoke.ts`, unchanged
mechanism (`module-remap-source` on `.123`, PulseAudio null-sink on `.140`,
`speaker2ExtraQuery: 'e2eDisableAudioProcessing=1'`, `startRawRemoteStreamCapture`), distinct CDP
port (9343), evidence dir `validation/p3-live-11-evidence/`, `RUN_INDEX` env var for 8 sequential
invocations.

Run 8 times **sequentially**. Before each: `free -h`, BLOCKED if avail <2Gi. After each: inline
cleanup (room, remote chrome, tunnel, remap module) — zero leaks across P3-LIVE-08/09/10 (9
consecutive PASSes so far).

**Stop condition** (unchanged): if any run doesn't get both publish + `rms>0`, stop immediately,
report `STATUS:BLOCKED` with that run's evidence — no false-green.

## Evidence

`validation/p3-live-11-evidence/`: per-run `result.json` + WAV + `summary.md` table.

## Counter update

If all 8 PASS: `phase3-counter.md` → **17/25** (9 prior + 8 this batch), burn stays 0.

## Scope

Harness smoke only, no product/app code.

Awaiting APPROVED-PLAN before running.
