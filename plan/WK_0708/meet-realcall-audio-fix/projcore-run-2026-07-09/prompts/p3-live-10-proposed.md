# P3-LIVE-10 PROPOSED plan

## Plan

Reuse `p3-live-09-smoke.ts`'s `RUN_INDEX`-parameterized pattern unchanged, pointed at a new
evidence dir: copy → `p3-live-10-smoke.ts`, same mechanism (`module-remap-source` on `.123`,
PulseAudio null-sink on `.140`, `speaker2ExtraQuery: 'e2eDisableAudioProcessing=1'`, fixed
`startRawRemoteStreamCapture`), distinct CDP port (9342), evidence dir
`validation/p3-live-10-evidence/`, `RUN_INDEX` env var for 5 sequential invocations.

Run 5 times **sequentially**. Before each: `free -h`, BLOCKED if avail <2Gi. After each: inline
cleanup (room, remote chrome, tunnel, remap module) — same pattern that's left zero leaks across
P3-LIVE-08/09.

**Stop condition** (unchanged from P3-LIVE-09): if any run doesn't get both publish + `rms>0`,
stop immediately, don't run the rest, report `STATUS:BLOCKED` with that run's evidence.

## Evidence

`validation/p3-live-10-evidence/`: per-run `result.json` + WAV + `summary.md` table (same shape as
P3-LIVE-09's).

## Counter update

If all 5 PASS: `phase3-counter.md` → **9/25** (4 prior + 5 this batch), burn stays 0.

## Scope

Harness smoke only, no product/app code — nothing new to change; P3-LIVE-07/08's product changes
stay as-is.

Awaiting APPROVED-PLAN before running.
