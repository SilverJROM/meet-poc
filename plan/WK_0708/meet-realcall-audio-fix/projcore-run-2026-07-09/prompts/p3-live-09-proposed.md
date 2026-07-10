# P3-LIVE-09 PROPOSED plan

## Plan

Copy `p3-live-08-smoke.ts` → `p3-live-09-smoke.ts`, unchanged mechanically (same
`module-remap-source` on `.123`, PulseAudio null-sink on `.140`,
`speaker2ExtraQuery: 'e2eDisableAudioProcessing=1'`, fixed `startRawRemoteStreamCapture`), only:
- new evidence dir `validation/p3-live-09-evidence/`
- distinct CDP port (9341, next unused in the `.123` sequence)
- accepts a `RUN_INDEX` env var so each of the 3 sequential invocations writes distinctly-named
  result files (`p3-live-09-run<N>-result.json`) into the same evidence dir, instead of 3
  separate near-identical script files

Run it 3 times **sequentially** (not parallel — matches every prior batch's one-call-at-a-time
pattern, and avoids two Chrome-on-.123 launches racing over the same `virtual_mic`/remap-source
name). Before each run: `free -h`, BLOCKED if avail <2Gi (same floor as every prior batch, no
override). After each run: inline cleanup (room `canDelete()` gate, remote chrome, tunnel, remap
module) — same as P3-LIVE-08, which already left no leaks.

**Stop condition**: if any of the 3 runs doesn't get `both publish + rms>0`, stop immediately,
don't run the remaining ones, report `STATUS:BLOCKED` with that run's full evidence — per the
brief's explicit "do not false-green" instruction. No partial-credit rounding.

## Evidence

`validation/p3-live-09-evidence/`: per-run `result.json` (roomId, publishedBytes both sides,
`domRms`, `domWavPath`) + the WAV itself + a small `summary.md` table (run #, PASS/FAIL, rms,
duration) once all 3 are in.

## Counter update

If all 3 PASS: `phase3-counter.md` row for P3-LIVE-09, **P3 PASS column → 4/25** (1 from
P3-LIVE-08 + 3 this batch), burn stays 0 (all `acceptanceAttempt:false` smokes, matching the
counter's existing "smoke, no burn" convention for P3-LIVE-08's row).

## Scope

Harness smoke only — no product/app code (P3-LIVE-07's constraint override and P3-LIVE-08's
capture fix are both already landed and proven; nothing new to change here). No `ng build` needed.

Awaiting APPROVED-PLAN before running.
