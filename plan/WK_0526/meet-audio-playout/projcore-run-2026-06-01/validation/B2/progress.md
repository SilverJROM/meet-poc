# B2 progress — Microphone selection persistence (R2)

## OG Spec: plan/WK_0526/meet-audio-playout/projcore-run-2026-06-01/og-requirements.md (R2)
## Current: B2 DONE — deployed DEV (voice.silverjrom.app 200). Awaiting projcore independent validation + merge.
## Last action: callback DONE appended; built green + pm2 restart meet-poc-fe; all gates green.
## Next action: projcore validates independently (verifier ≠ fixer) + owns merge to master.

### Mechanism (repro-confirmed)
- Normal in-call/lobby/reload selection paths PRESERVE the chosen id (post-B1: replaceInCallAudio success no longer syncs to track).
- RESIDUAL BUG: `syncSelectedAudioIdToTrack` (room.page.ts:2143-2147) sets selectedAudioId = track.getSettings().deviceId unconditionally. When that id is '' (mediaTrackDeviceId returns '' → storeDevice removes the key) or generic/'default' while the chosen device is still enumerated, the user's choice is discarded; the refreshDevices guard (:1955) then forces preferredDeviceId fallback → snap-back rendered by the option-less mic <select> (device-dialog.component.html:61).
- Fake-device harness exposes 3 mics (default + 2 hashes) and round-trips deviceId faithfully, so it can drive a real 2-mic switch but cannot reproduce real-hardware default-aliasing — covered by the pure-fn unit spec instead.

### Batch B2
- Status: DONE (deployed DEV; pending projcore independent validation + merge)
- Commits: 1ed70d6 (resolveSelectedAudioId + sync rewire) + 63d6f94 (device-dialog [selected] reopen fix)
- Artifacts: scenarios ✓ | changes ✓ (2 iters) | review ✓ (Mode1 ×2 + Mode2 VERIFIED) | test-report ✓ | screenshots ✓ (E1/E2/E3) | independent-validation → projcore
- Gates: unit P1-P7 PASS | e2e E1 PASS, E2 reopen PASS (was FAIL iter-1), E3 localStorage-durability PASS (restore harness-limited → unit P5 + manual M2) | ng build PASS | DEV 200
- Decision: decisions/B2-persistence-decision.md
