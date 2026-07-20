# P3-LIVE-07 validation (coord gate)

**Commit:** 47fe2d0  
**Verdict:** **BLOCKED (progress)** — AGC/NS/EC override MET+VERIFIED; energy PASS NOT  
**Burns:** 0 · **CAP:** 25 · **P3 PASS:** 0/25

## Outcomes
| Clause | Result | Evidence |
|--------|--------|----------|
| Ship query-param AGC/NS/EC disable | **PASS** | mic-energy.ts + media.service.ts; default unchanged |
| getSettings false mid-call on bot-123 | **PASS** | AGC/EC/NS all false |
| Both publish + inbound RTP | **PASS** | publish + Δ~308 packets |
| Receive energy rms>0 | **FAIL** | still exact silence |
| Product risk | **LOW** | query param gated; real users unchanged |

## Eliminated
Chrome AGC/NS/EC as sole silence cause (disproven by direct test).

## Next lead (accepted)
`channelCount:2` stereo on bot-123 track vs mono isolation successes. Dispatch **P3-LIVE-08**.
