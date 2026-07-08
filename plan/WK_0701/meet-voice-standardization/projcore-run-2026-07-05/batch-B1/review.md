# Batch B1 — Self-Review

## CR1 bar coverage

| Requirement | Addressed |
|-------------|-----------|
| Never mutate gate to consumed attempt unless sweep eligible | `planMicSweepAttempt` returns unchanged state when blocked |
| Initial capture: no advance when in-flight or mic inactive | `verifyInitialCaptureEnergy` re-reads `captureGatePasses()` + passes blockers |
| Watchdog: no consumption while `audioRecoveryInFlight` | Planner blocks before `nextSweepGate`; poll uses planner |
| Adopted recovery clears stale silence samples | `micSilenceWindow = []` on `'adopted'` |
| Terminal/exhausted banner watchdog-authoritative | Removed sweep terminal set on `'none-working'`; `micSilenceWatchdogBannerMessage` on poll |
| Targeted tests for blocked + banner/window | 8 new assertions in `mic-sweep.spec.ts` |
| Existing cadence/reducer intact | No changes to `nextSweepGate` logic |

## Scope discipline

- No password/admission, transcript, Ionicons, reconnect, codec, host indicator, volume balancer, preflight, or e2e changes.
- No deploy or remote validation from this dispatch.

## Residual risk (for CR2 / remote validation)

- Live overlap timing (join gate vs watchdog) is proven at pure-planner level; remote Peer2 validation still owed per R1 continuation.
- Brief post-`none-working` retry copy during cooldown is intentional per CR1 synthesis.

---

## CR2 bar coverage (batch-B1-cr2)

| Requirement | Addressed |
|-------------|-----------|
| Blockers prevent sweep launch and consumption | Blocked silent/indeterminate preserve state, `consumed: false` |
| Blockers do not block non-consuming re-arm | `working` / `!micActive` delegate to reducer even under blockers |
| Blocked exhausted silent reports `exhausted: true` | `exhausted` taken from reducer, state unchanged |
| Eligible silent consumption unchanged | Unblocked path identical to CR1 |
| Four targeted CR2 tests | Added in `mic-sweep.spec.ts` CR2 block |

## Residual risk (post-CR2)

- CR3 state-machine lens (coordinator-owned) still owed before B1 pass.
- Remote Peer2 validation still owed per R1 continuation.