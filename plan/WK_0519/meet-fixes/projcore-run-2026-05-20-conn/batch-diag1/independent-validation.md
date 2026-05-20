# Batch DIAG1-A Independent Validation

## Requirements

- **DR-5:** Satisfied for Batch A. Backend returns STUN-only by default, static Metered-style TURN env config when fully set, and no partial TURN entry on incomplete env. Frontend peer connections consume `/api/ice-config`.
- **DR-4:** Satisfied for Batch A. Peer `failed`/`disconnected` state schedules capped/debounced ICE restart, calls `pc.restartIce()`, and sends a new ICE-restart offer over the existing signaling channel.
- **Approved Amendment:** Satisfied. Batch A logs selected candidate type from `getStats()` so JROM can confirm `relay` immediately when TURN creds land.

## Evidence Quality Gate

- Q1 Scenario coverage: PASS. Tests exercise the backend endpoint, frontend ICE config consumption, and forced ICE failure/restart.
- Q2 Proof level: PASS. Backend proof is API-level; frontend proof is Playwright browser-level with instrumented `RTCPeerConnection`.
- Q3 Screenshot accuracy: PASS. `batch-a-call-connected.png` shows the call context used for the ICE restart test.
- Q4 Scenario-to-test consistency: PASS. `scenarios.md` maps directly to `ice-config.test.ts` and `reliability-core.spec.ts`.
- Q5 Requirement closure: PASS for Batch A. DR-1, full DR-2 panel, and DR-3 remain explicitly deferred to Batch B.

## Residual Risk

Full-suite Playwright did not pass, but the failures were outside Batch A and the new Batch A specs passed both standalone and during the full run.
