# req-matrix — Pre-join Device Gate. Code-VERIFIED via 5-round red-team; real-call pending JROM.
| R# | Status |
|----|--------|
| R1 mic+speaker mandatory gate, camera optional | CODE-VERIFIED |
| R2 validate actual function (mic energy, speaker tone) | CODE-VERIFIED |
| R3 confirm media connection before in-call | CODE-VERIFIED |
| R4 device-config/test panel on issue | CODE-VERIFIED |
| R5 hard block, friendly copy | CODE-VERIFIED |
| R6 Meet/Zoom UX | CODE-VERIFIED (visual review on real test) |
| R7 robust publish, no silent never-publish | CODE-VERIFIED (CR1 closed) |
| R8 device-selection persistence (mic fix) | CODE-VERIFIED |
| R9 host audio-health badge + quiet guests | CODE-VERIFIED (CR3/CR4 closed) |
| R10 failure-simulation matrix | CODE-VERIFIED (40 assertions) |
GATE: 5 red-team rounds (CR1-3 found+fixed 3 CRITICAL; CR4+CR5 2-consecutive CRITICAL-CLEAN, distinct lenses). tsc0, FE 26/26, backend 15/15, ng build0. Committed b995d7a, live on :4700 (main-LUZLS337.js). Final VERIFIED on JROM real multi-device call.
