# Batch MIC-LIVENESS Independent Validation

DR-35 result: VERIFIED locally.

Validation checks:
- The diagnostics payload contains top-level local-client `outboundAudioLevel`, `outboundAudioEnergy`, and `micSilent`.
- `micSilent` is derived only when a local audio track is enabled and live; absent/disabled/not-live audio returns null.
- The UI red flag is shown only for `micSilent === true`.
- Flowing fake audio e2e persisted the fields and did not display `MIC SILENT`.
- Build and isolated 48xx e2e passed.
- pm2 restart completed and no `/tmp` test env leaked into live pm2.

Residual risk:
- True silent external mic hardware remains a real-device confirmation item for JROM. The harness intentionally does not force a silent mic path.
