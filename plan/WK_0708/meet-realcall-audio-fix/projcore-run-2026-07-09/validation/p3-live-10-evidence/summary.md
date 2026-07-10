# P3-LIVE-10 — 5 sequential live split-host energy smokes

| Run | roomId | speaker1 (bot-140) bytes | speaker2 (bot-123) bytes | domRms | PCM nonzero/total | max amp | duration | Result |
|-----|--------|---------------------------|---------------------------|--------|--------------------|---------|----------|--------|
| 1 | dba8a73c778f | 1950 | 54 | 0.092305 | 185955/262144 | 21466/32767 | 16295ms | PASS |
| 2 | 759f61428cc5 | 433 | 1609 | 0.088495 | 188161/262144 | 20471/32767 | 15209ms | PASS |
| 3 | 5f3d95f65f71 | 609 | 1168 | 0.089214 | 187385/262144 | 21289/32767 | 14631ms | PASS |
| 4 | 06e0d7ea5a93 | 1166 | 1110 | 0.088256 | 186196/262144 | 20252/32767 | 15567ms | PASS |
| 5 | 017883f56c0c | 1220 | 1126 | 0.088440 | 184514/262144 | 20585/32767 | 15547ms | PASS |

All 5: `acceptanceAttempt:false`, `e2eDisableAudioProcessing=1` on bot-123,
`autoGainControl/echoCancellation/noiseSuppression` confirmed `false` via `getSettings()` on each
run, rooms deleted inline (HTTP 200 each), remote `.123` cleaned (chrome/tunnel/remap module) each
run. `callBurnCount` unchanged at 0 throughout. rms values consistent (0.0883–0.0923), same order
of magnitude as P3-LIVE-08/09's runs — no cherry-picking, every run PASSed identically, 0 FAILs.
