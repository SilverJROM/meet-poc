# Batch B2a Independent Validation

Validator: codex55
Dispatch marker: DISPATCH-batch-B2a-validator-2486694-1782891042
Branch: fix/sfu-selfheal-20260701

## Verdict

Overall: REPRO-STILL-PRESENT

The B1 primary `/api/sfu/tracks` failure repro is cleared locally: the direct initial subscribe failure path now escalates through rung 1, rung 2, emits `needs-rejoin`, and keeps low-frequency retry armed instead of latching the old `subscribedClientIds` give-up. However, a terminal advertised-not-subscribed path still exists in the same service for mid-call newly advertised tracks, and the existing service spec explicitly documents that cap exhaustion "stops permanently" for that track. Under the validator brief's "ANY code path" standard, B2a cannot be accepted as fully clearing R2.

## 1. Never-Give-Up Invariant

Status: GAP

Primary path evidence: PASS

- `subscribeIfNeeded()` marks the publisher before enqueue, but on non-live-mid subscribe failure it now deletes the guard and calls `scheduleRecoveryEscalation()` instead of `nextSubscribeRetry()` / permanent cap: `frontend/src/app/services/sfu-client.service.ts:206`, `frontend/src/app/services/sfu-client.service.ts:217`, `frontend/src/app/services/sfu-client.service.ts:232`, `frontend/src/app/services/sfu-client.service.ts:233`.
- The stuck watchdog also calls `scheduleRecoveryEscalation()` directly after the 10s advertised-not-subscribed condition: `frontend/src/app/services/sfu-client.service.ts:237`, `frontend/src/app/services/sfu-client.service.ts:251`.
- After rung 2 exhausts, the coordinator emits `needs-rejoin` and arms low-frequency retry rather than terminal stop: `frontend/src/app/services/sfu-client.service.ts:302`, `frontend/src/app/services/sfu-client.service.ts:305`.
- `armSubscribeRecoveryLowFrequencyRetry()` re-arms itself after every cycle while the publisher still passes `canRunSubscribeRecovery()`: `frontend/src/app/services/sfu-client.service.ts:341`, `frontend/src/app/services/sfu-client.service.ts:346`, `frontend/src/app/services/sfu-client.service.ts:348`, `frontend/src/app/services/sfu-client.service.ts:350`.

Surviving terminal path: GAP

- Mid-call newly advertised tracks still use `scheduleMidCallSubscribeRetry()` with the legacy cap. When `planSubscribeRetry()` returns capped, the code logs "mid-call subscribe permanently stopped after capped retries", deletes the timer, and does not escalate into `scheduleRecoveryEscalation()` or arm low-frequency retry: `frontend/src/app/services/sfu-client.service.ts:1475`, `frontend/src/app/services/sfu-client.service.ts:1492`, `frontend/src/app/services/sfu-client.service.ts:1500`, `frontend/src/app/services/sfu-client.service.ts:1502`, `frontend/src/app/services/sfu-client.service.ts:1510`.
- Existing test coverage confirms this terminal behavior remains expected by the current suite: `frontend/src/app/services/sfu-client.spec.ts:568`, `frontend/src/app/services/sfu-client.spec.ts:588`, `frontend/src/app/services/sfu-client.spec.ts:596`, `frontend/src/app/services/sfu-client.spec.ts:597`.
- Exploratory run of `npx tsx src/app/services/sfu-client.spec.ts` emitted the exact warning, then was manually stopped after it did not terminate quickly due active timers. I am not counting that command as a required passing test, but it supports the code/test evidence above.

## 2. Epoch Guard Correctness

Status: PASS

- Required grep result passed: `rg -n "opQueue = Promise\\.resolve\\(\\)|resetOpQueue\\(" frontend/src/app/services/sfu-client.service.ts` shows the only direct `this.opQueue = Promise.resolve()` at `resetOpQueue()`: `frontend/src/app/services/sfu-client.service.ts:184`, `frontend/src/app/services/sfu-client.service.ts:185`.
- Reset callers use `resetOpQueue()` at transport/session cleanup, failed publish reset, live-track close, and destroy: `frontend/src/app/services/sfu-client.service.ts:752`, `frontend/src/app/services/sfu-client.service.ts:1208`, `frontend/src/app/services/sfu-client.service.ts:1819`, `frontend/src/app/services/sfu-client.service.ts:1877`.
- `doSubscribeTracks()` defaults non-recovery callers to the current epoch and returns, rather than throws, when `shouldBindSubscribeResponse()` rejects stale state: `frontend/src/app/services/sfu-client.service.ts:2001`, `frontend/src/app/services/sfu-client.service.ts:2003`, `frontend/src/app/services/sfu-client.service.ts:2086`, `frontend/src/app/services/sfu-client.service.ts:2100`.
- The helper itself rejects epoch mismatch, missing publisher, client mismatch, and cfSession mismatch: `frontend/src/app/services/sfu-recovery-epoch.ts:8`.

## 3. No Duplicate Subscriptions / Ghost Streams

Status: PASS for B2a primary coordinator; GAP remains in legacy mid-call terminal path

- Recovery attempts clear publisher subscription state before marking the publisher guarded and subscribing again: `frontend/src/app/services/sfu-client.service.ts:315`, `frontend/src/app/services/sfu-client.service.ts:316`.
- `clearPublisherSubscriptionStateForRetry()` removes matching mids from `midToEntry`, `pendingOntrack`, `subscribedTracks`, remote streams, remote screen streams, subscribed guard, first-frame state, stuck watchdog, and mid-call retry state: `frontend/src/app/services/sfu-client.service.ts:1388`, `frontend/src/app/services/sfu-client.service.ts:1398`, `frontend/src/app/services/sfu-client.service.ts:1403`, `frontend/src/app/services/sfu-client.service.ts:1411`, `frontend/src/app/services/sfu-client.service.ts:1418`, `frontend/src/app/services/sfu-client.service.ts:1422`.
- `subscribeIfNeeded()` still gates duplicate publisher-level subscription with `subscribedClientIds`: `frontend/src/app/services/sfu-client.service.ts:209`, `frontend/src/app/services/sfu-client.service.ts:214`.

## 4. Escalation Bounds Match Consensus

Status: PASS for B2a primary coordinator

- Rung 1 cap/base/max are 3 / 250 / 1000ms plus jitter: `frontend/src/app/services/sfu-client.service.ts:139`, `frontend/src/app/services/sfu-client.service.ts:140`, `frontend/src/app/services/sfu-client.service.ts:141`, `frontend/src/app/services/sfu-client.service.ts:145`.
- Rung 2 cap/base/max are 2 / 500 / 1000ms plus jitter: `frontend/src/app/services/sfu-client.service.ts:142`, `frontend/src/app/services/sfu-client.service.ts:143`, `frontend/src/app/services/sfu-client.service.ts:144`, `frontend/src/app/services/sfu-client.service.ts:145`.
- Rung 2 passes `forceRenegotiation: true`: `frontend/src/app/services/sfu-client.service.ts:296`.
- Low-frequency continuation is 30s and emits `throttled` each cycle after `needs-rejoin`: `frontend/src/app/services/sfu-client.service.ts:148`, `frontend/src/app/services/sfu-client.service.ts:347`.

## 5. Honest Tests

Status: PASS for mandated tests

Commands run:

```bash
cd frontend && npx tsx src/app/services/sfu-repro-harness.spec.ts
```

Result: PASS, output `sfu-repro-harness: all assertions passed`.

```bash
cd frontend && npx tsx src/app/services/sfu-recovery-coordinator.spec.ts
```

Result: PASS, output included stale epoch guard warning and `sfu-recovery-coordinator: all assertions passed`.

```bash
cd frontend && npx tsx src/app/services/sfu-recovery-epoch.spec.ts
```

Result: PASS, output `sfu-recovery-epoch: all assertions passed`.

Test honesty assessment:

- `sfu-repro-harness.spec.ts` asserts outcome, not only calls: it checks advertised-not-subscribed state during escalation, no bound subscribed entry, exactly one `needs-rejoin`, unlatched `subscribedClientIds`, and multiple low-frequency cycles issuing additional POSTs: `frontend/src/app/services/sfu-repro-harness.spec.ts:168`, `frontend/src/app/services/sfu-repro-harness.spec.ts:181`, `frontend/src/app/services/sfu-repro-harness.spec.ts:189`, `frontend/src/app/services/sfu-repro-harness.spec.ts:197`, `frontend/src/app/services/sfu-repro-harness.spec.ts:213`.
- `sfu-recovery-coordinator.spec.ts` asserts exact rung sequence and exact forceRenegotiation flags: `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:170`, `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:175`.
- `sfu-recovery-coordinator.spec.ts` also proves stale response does not bind after `recoveryEpoch` changes: `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:204`, `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:217`.
- `sfu-recovery-epoch.spec.ts` covers epoch mismatch, matching epoch/session, and cfSession drift: `frontend/src/app/services/sfu-recovery-epoch.spec.ts:6`, `frontend/src/app/services/sfu-recovery-epoch.spec.ts:18`, `frontend/src/app/services/sfu-recovery-epoch.spec.ts:30`.

## 6. Reproduce-First Flip

Status: PARTIAL

- REPRO-CLEARED-ON-LOCAL for the B1 primary `/api/sfu/tracks` cap-give-up repro: the rewritten harness now drives the same 406 and transport-failure cases to rung1 -> rung2 -> `needs-rejoin`, then proves low-frequency continuation keeps issuing POSTs.
- REPRO-STILL-PRESENT overall because a separate same-service mid-call advertised-audio path still terminally caps without recovery continuation or escalation.

STATUS: REPRO-STILL-PRESENT

## Iter 2 re-validation

Dispatch marker: DISPATCH-batch-B2a-validator-2501357-1782893378

Verdict: REPRO-STILL-PRESENT

### 1. Mid-call gap

Status: CLEARED

The specific send-back gap is closed. `scheduleMidCallSubscribeRetry()` no longer treats capped mid-call retry exhaustion as terminal. At cap exhaustion it logs a non-terminal warning, checks `canRunSubscribeRecovery(publisher)`, emits `needs-rejoin`, and calls `armSubscribeRecoveryLowFrequencyRetry()`:

- `frontend/src/app/services/sfu-client.service.ts:1500`
- `frontend/src/app/services/sfu-client.service.ts:1513`
- `frontend/src/app/services/sfu-client.service.ts:1514`
- `frontend/src/app/services/sfu-client.service.ts:1515`

The moved fake-timed assertion is an outcome assertion, not just a call-count assertion. `MID-CALL-NEVER-GIVES-UP` seeds the mid-call cap boundary, forces subscribe failure, asserts `needs-rejoin`, asserts the low-frequency timer is armed, fires that timer, verifies another subscribe attempt occurs, and verifies the continuation re-arms:

- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:256`
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:268`
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:269`
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:274`
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:279`
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:280`

The obsolete terminal-stop assertion in `sfu-client.spec.ts` is gone and replaced by a note pointing to the fake-timed coordinator spec.

### 2. Other terminal give-up sweep

Status: GAP

The repeated live-mid-conflict cap itself is acceptable for B2a: when `scheduleLiveMidConflictRenegotiationRetry()` exceeds `LIVE_MID_CONFLICT_RENEGOTIATION_CAP`, it does not leave the initial-subscribe guard latched. It deletes `subscribedClientIds` for `source === 'initial-subscribe'` and waits for fresh publisher/roster state:

- `frontend/src/app/services/sfu-client.service.ts:475`
- `frontend/src/app/services/sfu-client.service.ts:484`

However, the live-mid-conflict fallback still contains a real terminal give-up path. If the initial subscribe hits a live mid conflict, then a forced renegotiated retry runs, and that retry fails with a non-`LiveMidConflictError` while the peer is still admitted and advertising, the catch path clears the live-mid retry key and calls the legacy `nextSubscribeRetry()`:

- `frontend/src/app/services/sfu-client.service.ts:512`
- `frontend/src/app/services/sfu-client.service.ts:520`
- `frontend/src/app/services/sfu-client.service.ts:525`

On cap exhaustion, `nextSubscribeRetry()` logs `subscribe permanently stopped ... guard stays set until cfSessionId changes` and returns `shouldRetry: false`:

- `frontend/src/app/services/sfu-client.service.ts:414`
- `frontend/src/app/services/sfu-client.service.ts:416`
- `frontend/src/app/services/sfu-client.service.ts:417`

Because the line `if (!retry.shouldRetry) return` executes before `subscribedClientIds.delete(current.clientId)`, the subscriber can remain guarded, advertised-not-subscribed, and without low-frequency continuation until the publisher changes `cfSessionId`:

- `frontend/src/app/services/sfu-client.service.ts:526`
- `frontend/src/app/services/sfu-client.service.ts:527`
- `frontend/src/app/services/sfu-client.service.ts:528`

That is a remaining R2 never-give-up violation. It is not only the acceptable "await fresh publisher state" branch.

### 3. Tests and hygiene

Status: PASS

Required timeout-wrapped commands:

```bash
cd frontend && timeout 25 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts
cd frontend && timeout 25 npx tsx src/app/services/sfu-repro-harness.spec.ts
cd frontend && timeout 40 npx tsx src/app/services/sfu-client.spec.ts
```

Results:

- `sfu-recovery-coordinator.spec.ts`: PASS, output ended with `sfu-recovery-coordinator: all assertions passed`.
- `sfu-repro-harness.spec.ts`: PASS, output ended with `sfu-repro-harness: all assertions passed`.
- `sfu-client.spec.ts`: PASS, output ended with `sfu-client roster utils: all assertions passed`.

Test-mode hygiene check passed. `rg -n "NODE_ENV|unref\\(|test-mode|test mode|process\\.env" frontend/src/app/services` returned no matches.

### 4. Epoch guard and no ghost streams

Status: PASS

The epoch guard remains intact. `doSubscribeTracks()` carries a captured recovery epoch into the bind point and returns before binding when `shouldBindSubscribeResponse()` rejects the current state:

- `frontend/src/app/services/sfu-client.service.ts:2011`
- `frontend/src/app/services/sfu-client.service.ts:2095`
- `frontend/src/app/services/sfu-client.service.ts:2097`

The fake-timed coordinator spec still proves stale in-flight subscribe response does not bind after `recoveryEpoch` changes:

- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:214`
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:222`

Existing stale-session / no-ghost stream checks remain present in `sfu-client.spec.ts` around SFU-R4/SFU-R5 and the required `sfu-client.spec.ts` command passed under timeout.

STATUS: REPRO-STILL-PRESENT - mid-call cap gap cleared, but initial-subscribe live-mid-conflict fallback can still terminally cap through `nextSubscribeRetry()`.

## Iter 3 re-validation (final)

Dispatch marker: DISPATCH-batch-B2a-validator-2507111-1782893968

Verdict: REPRO-CLEARED-ON-LOCAL

### 1. Live-mid-conflict fallback

Status: CLOSED

The iter-2 gap is closed. In `scheduleLiveMidConflictRenegotiationRetry()`'s non-conflict fallback catch, the `nextSubscribeRetry()` capped branch no longer returns with the subscribe guard latched. On `retry.capped` while `canRunSubscribeRecovery(current)` holds, it deletes `subscribedClientIds`, emits `needs-rejoin`, and arms `armSubscribeRecoveryLowFrequencyRetry()`:

- `frontend/src/app/services/sfu-client.service.ts:532`
- `frontend/src/app/services/sfu-client.service.ts:533`
- `frontend/src/app/services/sfu-client.service.ts:537`
- `frontend/src/app/services/sfu-client.service.ts:539`
- `frontend/src/app/services/sfu-client.service.ts:540`

### 2. Exhaustive grep table

Status: ACCURATE

`grep -n "nextSubscribeRetry(" frontend/src/app/services/sfu-client.service.ts` shows exactly the definition and one caller:

```text
398:  private nextSubscribeRetry(
532:          const retry = this.nextSubscribeRetry(current.clientId, false);
```

The `changes.md` table is honest:

- `scheduleRecoveryEscalation()` rung-1 cap falls through to rung 2; rung-2 cap emits `needs-rejoin` and arms low-frequency continuation.
- `scheduleLiveMidConflictRenegotiationRetry()`'s own cap now handles both sources uniformly: it clears the initial-subscribe guard where applicable, checks `canRunSubscribeRecovery(publisher)`, emits `needs-rejoin`, and arms low-frequency continuation.
- `scheduleMidCallSubscribeRetry()` capped branch escalates to `needs-rejoin` plus low-frequency continuation.
- `handleTransportStateChange()` `decision.action === 'capped'` is transport/peer-connection recovery (`planSfuTransportRecovery`, ICE/PC state, `startTransportRecovery()`), not an R2 subscribe-path capped retry. It is publish/PC recovery scope, not a subscribe terminal give-up.

No remaining subscribe-path terminal give-up was found while the peer remains admitted and advertising.

### 3. Tests

Status: PASS

Required timeout-wrapped commands:

```bash
cd frontend && for t in sfu-recovery-coordinator sfu-repro-harness sfu-recovery-epoch; do timeout 30 npx tsx src/app/services/$t.spec.ts; done
cd frontend && timeout 45 npx tsx src/app/services/sfu-client.spec.ts
```

Results:

- `sfu-recovery-coordinator.spec.ts`: PASS, output ended with `sfu-recovery-coordinator: all assertions passed`.
- `sfu-repro-harness.spec.ts`: PASS, output ended with `sfu-repro-harness: all assertions passed`.
- `sfu-recovery-epoch.spec.ts`: PASS, output ended with `sfu-recovery-epoch: all assertions passed`.
- `sfu-client.spec.ts`: PASS, output ended with `sfu-client roster utils: all assertions passed`.

Test honesty confirmed: `LIVE-MID-CONFLICT-FALLBACK-NEVER-GIVES-UP` is fake-timed and asserts outcome, not only invocation count. It drives the live-mid-conflict cap to `needs-rejoin`, confirms low-frequency continuation is armed, fires the low-frequency timer, asserts another subscribe POST occurs, and asserts the continuation re-arms:

- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:287`
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:339`
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:340`
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:342`
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:352`
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:353`

### 4. Epoch guard and no ghost streams

Status: PASS

The epoch guard remains intact. `doSubscribeTracks()` checks `shouldBindSubscribeResponse()` before mutating subscription state, and `sfu-recovery-epoch.spec.ts` plus the coordinator `EPOCH-GUARD` test cover stale epoch and cfSession drift. Existing stale-session / departed-publisher no-ghost-stream checks in `sfu-client.spec.ts` remain present and the required `sfu-client.spec.ts` run passed.

STATUS: REPRO-CLEARED-ON-LOCAL - subscribe-path never-give-up class is closed locally; timed tests pass.
