# grokbuild CODE red-team CR1

## Findings

Audited sources, IMPL diff, og-requirements R1, prior independent-validation (PASS on d2cbce9), and current on-disk implementation (mic-energy.ts + room.page.ts + mic-sweep.spec.ts). Ran verification:

- `cd frontend && npx tsx src/app/services/mic-sweep.spec.ts` → exit 0, "mic-sweep: all assertions passed"
- `cd frontend && npm run build` → exit 0 (pre-existing warnings only)

`nextSweepGate` + constants correctly implement the contract for first-retry, cooldown (set on completion only), dual-bound exhaustion (first-to-fire), and re-arm. Cooldown and attempt accounting are preserved correctly inside the reducer; `now` injection and no Date.now() inside pure fn hold.

Defects are in the call-site wiring (state mutation precedes guards) and post-sweep banner/window hygiene. These allow budget consumption without recovery execution and transient incorrect "retry" banner copy after actual recoveries or candidate exhaustion.

## NEW bugs

| severity | file:line | what breaks | concrete fix |
|---|---|---|---|
| High | `frontend/src/app/pages/room/room.page.ts:3501-3507` (verify), `3822-3823+3843` (watchdog) | Gate consumption (`nextSweepGate` + state write) happens before the `!this.audioRecoveryInFlight` guard. When true, attempts/episode advance but `runMicRecoverySweep` is skipped; `nextAllowedAt` is never set (only in finally at 3598-3601). Subsequent polls see `nextAllowedAt===0` and can consume further without sweeps. Violates bar ("must not consume retry budget without running recovery"). | Guard before `nextSweepGate` (or compute but only commit state when actually launching the run). Rollback or early re-arm when skipping. |
| High | `frontend/src/app/pages/room/room.page.ts:3488-3507`, `3516` | `verifyInitialCaptureEnergy` performs no `micSweepInProgress` check (unlike poll at 3803). Watchdog can start a sweep on ~2-sample window; delayed initial gate (~3.3s) consumes another attempt then calls run which early-returns at 3516 (outside try/finally → no cooldown set). One physical recovery can charge 2+ attempts. | Add `if (this.micSweepInProgress || this.audioRecoveryInFlight) return;` (after checked) before sampling/classify/gate, or re-check active + in-progress immediately before `nextSweepGate`. |
| Medium | `frontend/src/app/pages/room/room.page.ts:3559-3560`, `3813-3819`, `3835-3840` | Adopt success clears `micSilentWarning` + resets default msg, but does not touch `micSilenceWindow`. Next poll re-pushes to stale flat samples, `classifyMicCapture` can return `'silent'`, poll's silent branch sets `"Still trying to restore your microphone…"` + true (even with fresh nextAllowedAt). False retry copy appears for multiple seconds post-recovery. | On adopt success (or working classify post-sweep), also `this.micSilenceWindow = [];` (or force one working sample) before/after the clear. |
| Medium | `frontend/src/app/pages/room/room.page.ts:3581-3582` (none-working set), `3835-3840` (poll) | `none-working` inside sweep sets terminal "No working..." msg. On return, finally sets cooldown; next poll (attempts still < max) computes non-exhausted gate → overwrites msg to "Still trying..." during wait. Terminal decision only sticks after final exhaustion. Intermediate "no mic this pass" is lost to retry copy. | Do not set terminal from inside sweep (or set only when the just-consumed gate would have been the last). Let poll's exhausted branch be authoritative for the msg; keep sweep side-effects limited to actionNotice + logs. |
| Low | `frontend/src/app/services/mic-sweep.spec.ts` (gate tests 242-340 and runMicSweep harness) | Reducer tests are outcome-level and cover R1 boundaries for the pure fn. But no coverage of adapter consumption order vs `audioRecoveryInFlight`/`micSweepInProgress`, verify/watchdog overlap on shared gate state, or banner msg after adopt vs stale window. "No consumption without run" and "no false retry after recovery" are not proven by the passing spec. | Add harnessed scenarios (or small integration test) that drive the call sites with injected in-flight flags and assert attempts unchanged + no run + correct final state. |

## Scenario trace

- Reducer core (mic-energy.ts:348-381 + isExhausted 320-329): first attempt (attempts=0 → +1 + episode=now + should), cooldown block, attempts>=8 or duration, working/!micActive → INITIAL reset, indet preserve. Matches tests and contract. Cooldown only written on sweep completion.
- Consumption paths (proven): verify 3501 and poll 3822 both mutate state then condition the run. audioRecoveryInFlight and inProgress can cause +attempt with skipped execution (no finally/cooldown).
- Banner (proven): 3559 clear defeated at 3838 by stale window; 3581 terminal defeated at 3838 by non-exh poll during cooldown.
- devicechange/mute re-arm paths (3797, 3011, 3809): clean, reset before gate.
- No getUserMedia storm (inProgress + cooldown + 7s interval prevent); no regression to track-failure (micActive=false still re-arms).
- Build/test: clean (commands above). No new platform break (Date.now only at call sites per design; 7s cadence in 5-10s range).

STATUS: BUGS — gate state advanced before guards; budget can be consumed and banner shows retry copy without/after actual recovery sweeps
