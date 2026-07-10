# P3-LIVE-09 changes.md

## Summary

Requirement: "3 more live SFU smokes with both publish + receive rms>0; acceptanceAttempt:false;
no CAP burn."

**STATUS: DONE — 3/3 PASS.** No FAILs, no stop-condition triggered. All 3 sequential live
split-host smokes both published and got real receive energy. Counter: **4/25** (1 from
P3-LIVE-08 + 3 this batch).

## What changed

- `e2e/harness/p3-live-09-smoke.ts` (new): unchanged reuse of P3-LIVE-08's proven mechanism
  (`module-remap-source` on `.123`, PulseAudio null-sink on `.140`,
  `speaker2ExtraQuery: 'e2eDisableAudioProcessing=1'`, fixed `startRawRemoteStreamCapture`) —
  only additions: distinct CDP port (9341), own evidence dir, `RUN_INDEX` env var for
  per-run-labeled result files, and `process.exitCode = 1` on `!pass` (P3-LIVE-08's script left
  `exitCode` at 0 on a logical FAIL — fixed here so a failing run in the sequence would be
  unambiguous, though not exercised since all 3 passed).
- No product/app code touched this batch (P3-LIVE-07's constraint override and P3-LIVE-08's
  capture fix are both already landed).

## Results

| Run | publishedBytes (140/123) | domRms | PCM nonzero/total | Result |
|-----|---------------------------|--------|--------------------|--------|
| 1 | 3806 / 2484 | 0.088625 | 185718/262144 | PASS |
| 2 | 646 / 3303 | 0.091192 | 184042/262144 | PASS |
| 3 | 338 / 1574 | 0.090480 | 184804/262144 | PASS |

Every run independently re-verified by parsing the WAV's raw PCM directly (not trusting the
script's own `rms` number) — full detail in `validation/p3-live-09-evidence/summary.md`. rms
values are consistent with each other and with P3-LIVE-08's 0.087941 — same order of magnitude,
no outliers, no cherry-picking (ran exactly 3, reported exactly 3).

## Calls / cleanup

- 3 live smoke attempts, all `acceptanceAttempt:false`, all `purpose:"smoke"`. `callBurnCount`
  unchanged at 0 throughout — matches the phase3-counter's existing convention that these smokes
  count toward the 25 PASS target without counting as acceptance-cap burns.
- All 3 rooms deleted inline (HTTP 200 each) — no leaks.
- Remote (`.123`): no leftover chrome/Xvfb after any run; `module-remap-source` unloaded and
  `pactl list modules short | grep remap` confirmed empty after the full sequence.
- `free -h` checked before each of the 3 launches (27–28Gi avail throughout, well above the 2Gi
  floor).

## Counter update

`phase3-counter.md` row added for P3-LIVE-09: **P3 PASS 4/25** (1 + 3), burn 0/25.
