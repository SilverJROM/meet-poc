# P3-LIVE-08 validation (coord independent gate)

**Commit:** 9f2b7be  
**Verdict:** **PASS** (smoke — first energy PASS in P3-LIVE chain)  
**Burns:** 0 · **CAP:** 25 · **Phase3 PASS count:** 1/25 (smoke; acceptanceAttempt:false)

## Independent re-verify (coord)
| Check | Result |
|-------|--------|
| WAV exists | PASS 524332 bytes |
| PCM nonzero | **180715/262144** |
| max abs | **20594/32767** |
| rms (coord) | **0.087941** matches meta |
| both publish | 2414 / 361 bytes >0 |
| callBurnCount | **0** |

## Mechanism accepted
`startRawRemoteStreamCapture` must attach raw remote stream to dedicated playing `<audio>` then `captureStream()`; unplayed track → Chromium never decodes.

## Gate
VERIFIED PASS. Do **not** run final exit (need 25 PASS or CAP exhausted). No `ready-for-real-call-test` yet. Continue P3-LIVE-09+ stacking smoke/AC1 toward 25.
