# P3-LIVE-10 changes.md

## Summary

Requirement: "5 sequential live SFU smokes both publish + rms>0; acceptanceAttempt:false; burn
stay 0."

**STATUS: DONE — 5/5 PASS.** No FAILs, no stop-condition triggered. Counter: **9/25** (4 prior +
5 this batch).

## What changed

- `e2e/harness/p3-live-10-smoke.ts` (new): unchanged reuse of the proven mechanism
  (`module-remap-source` on `.123`, PulseAudio null-sink on `.140`,
  `speaker2ExtraQuery: 'e2eDisableAudioProcessing=1'`, `startRawRemoteStreamCapture`) — same
  `RUN_INDEX`-parameterized pattern as `p3-live-09-smoke.ts`, distinct CDP port (9342), own
  evidence dir.
- No product/app code touched this batch.

## Results

| Run | publishedBytes (140/123) | domRms | PCM nonzero/total | Result |
|-----|---------------------------|--------|--------------------|--------|
| 1 | 1950 / 54 | 0.092305 | 185955/262144 | PASS |
| 2 | 433 / 1609 | 0.088495 | 188161/262144 | PASS |
| 3 | 609 / 1168 | 0.089214 | 187385/262144 | PASS |
| 4 | 1166 / 1110 | 0.088256 | 186196/262144 | PASS |
| 5 | 1220 / 1126 | 0.088440 | 184514/262144 | PASS |

Every run independently re-verified by parsing the WAV's raw PCM directly. rms values consistent
across all 5, and consistent with P3-LIVE-08/09's runs (0.0883–0.0923 this batch vs 0.0876–0.0912
previously) — same mechanism, same order of magnitude, no outliers. Full detail:
`validation/p3-live-10-evidence/summary.md`.

## Calls / cleanup

- 5 live smoke attempts, all `acceptanceAttempt:false`, all `purpose:"smoke"`. `callBurnCount`
  unchanged at 0 throughout.
- All 5 rooms deleted inline (HTTP 200 each) — no leaks.
- Remote (`.123`): no leftover chrome/Xvfb after any run; `module-remap-source` unloaded and
  confirmed empty (`pactl list modules short | grep remap`) after the full sequence.
- `free -h` checked before each of the 5 launches (27–28Gi avail throughout, well above the 2Gi
  floor).

## Counter update

`phase3-counter.md` row added for P3-LIVE-10: **P3 PASS 9/25** (4 + 5), burn 0/25.
