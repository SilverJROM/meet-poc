# Atomic Plan — Restore real-call audio (volume-vs-mic regression)
**Run:** projcore-run-2026-07-08-meet-realcall-audio-fix
**Baseline:** main @ 6f25eb2
**planning_criticality:** critical

## Pinned Diagnosis (T1)
Outbound stats from Android publisher frozen at constant ~0.2289 (micSilent false) because classifyMicCapture returns 'working' for flat-energy if maxLevel >=0.01. The constant non-zero fools it. Published is raw gUM. Detector blind spot Mode A + recovery gap Mode B.

Fix forward, preserve AC7.

## Atomic Batches (B01+)
**B01** Diagnosis + repro harness (L2, L2, no, no)
**B02** Detector Mode A flat-nonzero (L2, L2, no, yes standard) -- variance check added
**B03** Recovery Mode B (L2, L2, no, yes)
**B04** AC7 guard (L2, L2, no, no)
**B05** Publish hygiene (L2, L2, no, no)
**B06** Harness/diag (L2, L1, no, no)
**B07** Dev real-path (L2, L2, no, yes)
**B08** SG long-haul (L2, L2, no, yes)
**B09** Evidence + handoff (L1, L3, no, no)

Full details in original planning docs + decisions. Real-call + UI proof bar.
