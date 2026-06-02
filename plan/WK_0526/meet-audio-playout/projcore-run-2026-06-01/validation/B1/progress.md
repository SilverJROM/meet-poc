# B1 progress — Host remote-audio playout (R1)

## OG Spec: plan/WK_0526/meet-audio-playout/projcore-run-2026-06-01/og-requirements.md (R1)
## Current: Phase 3, Batch B1 — ALL GATES GREEN; DONE callback fired to projcore
## Last action: independent-validation PASS; callback appended to callbacks.md
## Next action: projcore validates independently + owns merge to master (B-series integration)

### Batch B1: honest playability detection + gesture-stack resume + source-add re-arm
- Branch: feat/host-audio-playout-mic-persist-20260601 (off d3591e4); commits 2c0b2c5 + be8cbb0
- Status: DONE (committed on feature branch; deployed DEV; awaiting projcore independent validation + merge)
- Artifacts: scenarios ✓ | changes ✓ | review ✓ (APPROVE) | test-report ✓ (PASS) | screenshots ✓ (E1/E2/E3 banner before/after) | independent-validation ✓ (PASS)
- Result: R1.1 (NS5 proxy proof + JROM two-machine seat), R1.2 (unit U1-U10 + banner DOM), R1.3 (in-gesture resume + source-add re-arm), R1.4 (no regression) all satisfied.

### Plan (approved)
- A. Extract `evaluateRemoteAudioPlayability` pure fn; route allSinksPlaying + unlock return through it.
- B. Synchronous context.resume() within gesture stack; surface banner on source-add while not running.
- C. No regression to volume/mute-all/working guests.
- Tests: unit spec (HARD gate) + two-context e2e positive/negative (HARD gate); emitted-climb attempted (soft).
