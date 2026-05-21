# Batch MIC-LIVENESS Scenarios

## TS-DR35-01 outbound liveness fields persist
Given an owner is in a call with a remote peer and the local mic track is enabled/live, when diagnostics are sampled, then the persisted payload includes top-level `outboundAudioLevel`, `outboundAudioEnergy`, and `micSilent`.

## TS-DR35-02 flowing fake audio is not alarming
Given the test harness provides a flowing fake microphone, when diagnostics are sampled and opened in `/app/diagnostics`, then `micSilent` is `false` or `null` and the page does not display the red `MIC SILENT` flag.

## TS-DR35-03 muted/off is not false-flagged
Given the local microphone is absent, disabled, or not live, when diagnostics are built, then `micSilent` is `null` and the red flag is not shown.
