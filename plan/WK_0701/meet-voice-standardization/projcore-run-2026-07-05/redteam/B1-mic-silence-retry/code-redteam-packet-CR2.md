# Code Red-Team Packet — B1 Mic-Silence Retry CR2

Run: `/home/agjrom/websites/meet-poc/plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-05`  
Topic: B1 / R1 faster mic self-heal retry correction  
Round: CR2  
Lens: concurrency trace + live-state side effects + proof validity  
Output file: write your verdict to
`redteam/B1-mic-silence-retry/<role>-coderedteam-CR2.md`

## Required Reading

- `redteam/B1-mic-silence-retry/synthesis-CR1.md`
- `redteam/B1-mic-silence-retry/IMPL-corrected-diff-CR2.patch`
- `batch-B1/changes.md`
- `batch-B1/test-report.md`
- Relevant source:
  - `frontend/src/app/services/mic-energy.ts`
  - `frontend/src/app/pages/room/room.page.ts`
  - `frontend/src/app/services/mic-sweep.spec.ts`

## Audit Question

Does the CR1 correction actually make retry-budget consumption, banner state, and stale silence-window behavior robust enough to accept B1 locally?

## Specific Checks

1. Gate budget:
   - Can `micSweepGateState.attempts` still increase when no sweep is eligible to launch?
   - Can initial capture and watchdog still double-charge one physical sweep?
   - Does the new `planMicSweepAttempt()` introduce any hidden reducer behavior change?

2. Live-state side effects:
   - Does clearing `micSilenceWindow` only on `adopted` create or miss a stale-sample path?
   - Does removing terminal copy from `none-working` leave the user without a warning, or is watchdog ownership sufficient?
   - Does `audioRecoveryInFlight` blocking incorrectly mask already-exhausted terminal state?

3. Test proof:
   - Do the new tests assert outcomes that would fail on the CR1 bug?
   - Are the tests too shallow or coupled to implementation details?
   - Should B1 require one more local/browser proof before dev_machine/Peer2 validation?

## Verdict Format

Write:

```
# <role> CR2 verdict
Verdict: CLEAN | BUGS

## Findings
- ...

## Required Fixes
- ... (only if BUGS)

## Residual Risk
- ...

STATUS: CLEAN|BUGS — one-line summary
```

Rules:
- Be adversarial but concrete.
- If you claim BUGS, include exact file/function and a plausible sequence.
- If you claim CLEAN, identify the strongest remaining risk and why it does not block B1.
