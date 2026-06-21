# RED-TEAM CR1 (lens L1: haiku) — Does the fix ACTUALLY close silent never-publish?

## Residual silent/never-publish paths?

**CRITICAL BUG FOUND**: State-revert watchdog at room.page.ts:1847 is **incomplete**.

### The Bug

The watchdog condition:
```typescript
if (this.state() === 'in-call' && this.preflightGateStatus() === 'audio-connecting') {
```

**Misses the haiku path** — when state reverts from 'in-call' to something else (e.g., user disconnected/removed/left) DURING the publish retry loop.

### Silent Path: State Revert Mid-Retry

1. User admitted: `state = 'in-call'`, `publishInitialSfuWithRetry(participantId, sessionId)` called
2. Inside retry loop (line 1620–1658), an attempt begins, `preflightGateStatus = 'audio-connecting'` (line 1611)
3. **During retry**: state changes to not-'in-call' (e.g., admin removes user, user closes/tab, rapid disconnect)
4. Early-return at line 1621: `if (runId !== this.initialPublishRunId || this.state() !== 'in-call') return;`
5. Function exits cleanly, no status update → `preflightGateStatus` still 'audio-connecting'
6. `.then()` handler fires (line 1844)
7. **Watchdog condition**: `state() === 'in-call'` → **FALSE** (state reverted) ✗
   - `preflightGateStatus() === 'audio-connecting'` → TRUE
   - **Overall condition → FALSE** → watchdog does NOT trigger
8. **Result**: No error shown, user is silent-failed

**Spec violation**: DESIGN-SPEC says "Handle the state-revert-before-publish race (haiku path) → surface, don't silent-exit." ❌

### File:Line Evidence

- **room.page.ts:1609** — Early-return guard (trigger never fires if state not 'in-call' at entry)
- **room.page.ts:1611** — Sets 'audio-connecting' after guard
- **room.page.ts:1621** — Early-return mid-retry if state changed
- **room.page.ts:1847** — Watchdog condition (triggers only if state IS 'in-call')
- **room-decisions.ts:204–209** — `derivePublishGateStatus()` tests show all paths should reach 'audio-failed', but the watchdog doesn't implement this for state-revert cases

---

## In-call gated on 'published'? Connecting timeout bounded? Empty-transceiver caught?

| Requirement | Finding | Status |
|---|---|---|
| **R3: Gate fully-in-call on publishStatus==='published'** | In-call view gates on `state() === 'in-call'`, not `preflightGateStatus === 'ready'`. User sees peer tiles, controls before audio confirmed. `preflightGateStatus` tracks publish phase separately but doesn't block main UI. | ⚠️ NON-CRITICAL UX gap (not silent-failure) |
| **Connecting timeout bounded** | 30-second timeout at line 1364–1372: if `preflightGateStatus() === 'audio-connecting'` after 30s, sets 'audio-failed'. Timeout is cleared on completion (line 1662). ✓ | ✅ CLEAN |
| **Empty-transceiver caught** | Line 1716–1717: throws `InitialPublishPermanentError` if no live audio track. Caught by .catch() handler at line 1853, sets 'audio-failed'. ✓ | ✅ CLEAN |
| **PATH A guard (no sessionId)** | Line 1838–1863: If `!msg.participantId \|\| !msg.sessionId`, sets 'audio-failed' loudly. ✓ | ✅ CLEAN |
| **Timeout during initial capture setup** | `initialPublishStream()` (line 1709) waits up to 1.5s for a live track. Then the 30s outer timeout caps total retry window. ✓ | ✅ CLEAN |
| **publishTriggerCount observability** | Incremented at TOP of function (line 1607, before any early-return). Persisted to diagnostics (line 3543–3544). Zero → trigger never fired. ✓ | ✅ CLEAN |
| **Retry cap and feedback** | 3 retries (line 91), backoff 500–2000ms. Status message updates user (line 1656). Exhausted → 'audio-failed' (line 1645). ✓ | ✅ CLEAN |

---

## Findings

### CRITICAL-BUG

**Watchdog condition is backwards on state-revert** (room.page.ts:1847)

- Condition: `state() === 'in-call' && preflightGateStatus() === 'audio-connecting'`
- Should trigger: whenever `preflightGateStatus() === 'audio-connecting'` after publish attempt completes (regardless of state)
- **Impact**: Haiku path (state reverts during retry) is SILENT — no error shown to user

**Suggested fix**:
```typescript
if (this.preflightGateStatus() === 'audio-connecting') {
  // Publish attempt never completed (either still in-flight or state reverted)
  this.preflightGateStatus.set('audio-failed');
  this.initialPublishFailureNotice.set("We couldn't connect your audio. Check your connection and try again.");
  this.inCallDeviceDialogOpen.set(true);
}
```

Or more targeted (state-revert-specific):
```typescript
if (this.state() !== 'in-call' && this.preflightGateStatus() === 'audio-connecting') {
  // State reverted during publish attempt
  this.preflightGateStatus.set('audio-failed');
  this.initialPublishFailureNotice.set("We couldn't connect your audio. The call was interrupted — please rejoin.");
  this.inCallDeviceDialogOpen.set(true);
}
```

### NON-CRITICAL

**In-call view not gated on publish confirmation** (room.page.html:99–100)
- User sees `state() === 'in-call'` view immediately; `preflightGateStatus` is a separate sub-state
- User could see peer tiles, controls before audio publishes; not a silent failure, just UX ordering
- Acceptable with the "Connecting audio…" notice (line 212), but spec asked for hard gate on 'published'

---

## STATUS

**CRITICAL-BUG**: State-revert watchdog is incomplete. The haiku path (state changes from 'in-call' during publish) leaves user silent-in-call with no error shown.

**VERDICT**: **CRITICAL-BUG** — Fix the watchdog condition before merge. Do not ship this without addressing the state-revert case.

Honest assessment: The fix has closed PATH A (no sessionId), PATH D (empty transceiver), PATH E (timeout), and PATH F (unexpected throw). But it has opened a new **silent path** by only watching one half of the state-revert race.
