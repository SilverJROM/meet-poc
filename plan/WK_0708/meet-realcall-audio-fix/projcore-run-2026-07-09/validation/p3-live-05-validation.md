# P3-LIVE-05 validation (coord gate)

**Commit:** 8d55b05  
**Verdict:** **BLOCKED (partial progress)** — env null-sink MET+PROVEN; live energy NOT  
**Burns:** 0 · **CAP:** 25 · **P3 PASS:** 0/25

## Outcomes
| Clause | Result | Evidence |
|--------|--------|----------|
| Install PulseAudio + null-sink on .140 | **PASS** | package + user pulse; auto_null sink |
| Isolation WebRTC-track captureStream rms>0 | **PASS** | maxAbs≈1.075 first nonzero on .140 |
| Live split-host both publish | **PASS** | result.json publishedBytes>0 both |
| Live DOM receive energy rms>0 | **FAIL** | rms=0 still; voice-stalled on peer |
| acceptanceAttempt:false | **PASS** | burn=0 |
| No app code | **PASS** | harness + env only |

## Reframe accepted
Null-sink is necessary but not sufficient. App watchdog marks peer `voice-stalled` from inbound SFU stats → next: sample inbound RTP packet/byte deltas on page1 over dwell.

## Gate
No false-green. Keep pulse daemon. Dispatch **P3-LIVE-06**.
