# P3-LIVE-09 — 3 sequential live split-host energy smokes

| Run | roomId | speaker1 (bot-140) bytes | speaker2 (bot-123) bytes | domRms | PCM nonzero/total | max amp | duration | Result |
|-----|--------|---------------------------|---------------------------|--------|--------------------|---------|----------|--------|
| 1 | 8fce8d7ce7dd | 3806 | 2484 | 0.088625 | 185718/262144 | 20534/32767 | 16137ms | PASS |
| 2 | 9437ce965517 | 646 | 3303 | 0.091192 | 184042/262144 | 20478/32767 | 14306ms | PASS |
| 3 | cf3aec1d748b | 338 | 1574 | 0.090480 | 184804/262144 | 20428/32767 | 14268ms | PASS |

All 3: `acceptanceAttempt:false`, `e2eDisableAudioProcessing=1` on bot-123,
`autoGainControl/echoCancellation/noiseSuppression` confirmed `false` via `getSettings()` on each
run, rooms deleted inline (HTTP 200 each), remote `.123` cleaned (chrome/tunnel/remap module) each
run. `callBurnCount` unchanged at 0 throughout. rms values consistent (0.0886–0.0912), same order
of magnitude as P3-LIVE-08's 0.087941 — no cherry-picking, every run PASSed identically.
