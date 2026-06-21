# RED-TEAM CR2 — Lens L2: Gate hard-block + Config panel + Persistence + Device edge cases
Role: sonnet-4-6 | Date: 2026-06-10

---

## Gate hard-block correct + no false-block?

**The gate IS code-enforced (not just template-disabled).**  
`join()` (room.page.ts:839-894) calls `missingJoinPrereqs()` (2362-2372) twice and returns early on any non-empty result. No `type="submit"` disabled binding bypasses this — it's checked in TypeScript. Camera correctly absent from `missingPreflightPrereqs`; no-mic case goes through `hasMicAccess=false` → friendly "Please enable your microphone" popout (no crash).

**However, the micVerified logic is critically inverted — see Finding #1 below.**

---

## Config panel recovers (no dead-end)? Persistence holds?

**Config panel opens correctly** on mic-silent and speaker-missing gates: `showJoinPrereqPopout` calls `lobbyDeviceDialogOpen.set(true)` for both cases (room.page.ts:2393, 2396). Panel provides mic meter, speaker test, camera preview, device dropdowns. Switching device resets `lobbySelfTestFlag` and rearms the poller — no permanent dead-end in the switching flow.

**Confirm button IS a dead-end for working-mic users** due to Finding #1: `preflightConfirmReady` is permanently `false` for a mic that actually works, so the button remains disabled and the user cannot proceed.

**`onPreflightConfirm()` only closes the dialog** (room.page.ts:947-950) — does not trigger `join()`. User must separately click "Join now." This is a UX seam but not a hard block since `join()` would re-check the gate anyway. Cosmetic issue: "Confirm — everything works" label implies finality.

**R8 persistence (fallbackChosenIdForAudioSync):** The fix at room.page.ts:2638-2641 and the extracted pure function in room-decisions.ts:247-254 are correct. `requestedDeviceId` is now preserved when the track reports a generic id (`'default'`, `'communications'`, `''`). Unit tests cover all four cases. `speakerTestCount` is not reset in `cleanupCall` — speaker gate is auto-satisfied on rejoin within the same component instance; minor relaxation of R1 but intentional.

---

## Findings

### [CRITICAL-BUG] #1 — `micVerified` / `preflightConfirmReady` logic is semantically inverted

**Files**: mic-energy.ts:213-215, room.page.ts:256, room.page.ts:2367, room-decisions.ts:279-288

`lobbySelfTestFlag` is driven by `nextMicWarningState` (room.page.ts:3527), which returns:
- `true` when classification is **`'silent'`** — flag raised, "No sound detected" warning shown
- `false` when classification is **`'working'`** — no warning, mic is producing energy

Source (mic-energy.ts:213-215):
```
if (classification === 'silent') return true;
if (classification === 'working') return false;
```

The device dialog confirms: `@if (micTestFlagged() && mode() === 'lobby')` renders  
"No sound detected from [mic] — pick another" (device-dialog.html:54-55).  
So `lobbySelfTestFlag = true` = mic is SILENT = bad.

But the gate does:
```typescript
// room.page.ts:2367
micVerified: this.lobbySelfTestFlag(),
```
and:
```typescript
// room.page.ts:256
readonly preflightConfirmReady = computed(() => this.lobbySelfTestFlag() && this.speakerTestCount() > 0);
```

Both treat `true` as "mic verified/good." The semantics are opposite.

**Consequence:**
- **Working mic**: mic produces energy → `classifyMicCapture` = 'working' → `nextMicWarningState` = `false` → `lobbySelfTestFlag = false` → `micVerified = false` → `missingPreflightPrereqs` returns `['mic-silent']` → **gate blocks every join attempt forever**; confirm button stays disabled permanently.
- **Dead/silent mic**: silence sustained → `lobbySelfTestFlag = true` → `micVerified = true` → gate passes (if speaker tested); "Confirm — everything works" button enables **while "No sound detected" warning is also visible** — a self-contradictory UI state that confirms the inversion.

Additionally, `lobbySelfTestFlag = false` at init and after a working-mic tick are indistinguishable — a simple `!lobbySelfTestFlag()` inversion would falsely pass users whose poller hasn't run yet. The correct fix needs a 3-state signal (never-run / working-confirmed / silent-flagged) to tell apart initial silence from energy-confirmed silence.

**This breaks R1 (good users are permanently blocked) and R2 (dead mics are admitted).**

---

### [NON-CRITICAL] #2 — Auto-rejoin false-block on `rejoinAfterInitialPublishFailure`

**File**: room.page.ts:1548-1558

```typescript
this.cleanupCall(true);     // stopLobbySelfTest() → lobbySelfTestFlag = false
this.state.set('lobby');
await this.startLobbyPreflight();   // starts poller (1 000 ms interval)
await this.join();                  // gate checks immediately — poller hasn't ticked
```

After audio failure, the user clicks "Rejoin." `cleanupCall` resets the flag via `stopLobbySelfTest` (room.page.ts:2548, 3512). `startLobbyPreflight` rearms the poller but `join()` is called synchronously after it returns, before the first 1 000 ms tick. The gate therefore reads the stale `lobbySelfTestFlag = false` and blocks with 'mic-silent' even though the mic was working one second ago. The user is shown the device dialog with "We can't hear your mic" and must wait ~1 s, speak, and click Join again. Self-healing but confusing on a programmatic rejoin. *(This finding is contingent on Finding #1 being fixed; once the semantics are corrected the same timing gap will apply.)*

---

### [NON-CRITICAL] #3 — `preflightGateStatus` stays `'pending'` on already-published short-circuit

**File**: room.page.ts:1607-1609 (early return before `preflightGateStatus.set('audio-connecting')`)

```typescript
if (this.state() !== 'in-call' || this.sfuClient.localPublishState()?.status === 'published') return;
this.preflightGateStatus.set('audio-connecting');   // ← not reached on already-published
```

`publishTriggerCount` IS incremented before this guard (room.page.ts:1606), so diagnostics show `publishTriggerCount > 0` but `preflightGateStatus = 'pending'` even when audio is fully connected. No user-facing impact — the connecting spinner and notice are only shown when status is `'audio-connecting'`, which is correctly absent here — but the diagnostic payload is misleading (`derivePublishGateStatus` in tests would call this PATH A when it isn't).

---

### [NON-CRITICAL] #4 — `speakerTested` input comment is wrong

**File**: device-dialog.component.ts:44

```typescript
// Emitted when user clicks the confirm button (gate passed).
readonly speakerTested = input(false);
```

This is an `input`, not an output; the comment describes the `confirm` output immediately above it. Copy-paste error.

---

### [NON-CRITICAL] #5 — Dead `else` branch in `showJoinPrereqPopout` shows wrong copy

**File**: room.page.ts:2398-2400

The final `else` branch (`'Please enable your microphone'`) is unreachable given the typed union `('name' | 'mic' | 'mic-silent' | 'speaker')[]` and the five cases above it. Code quality noise; no runtime path reaches it.

---

## STATUS: CRITICAL-BUG — `lobbySelfTestFlag` semantics inversion (Finding #1)

The gate inverts `micVerified`: users with working mics are permanently blocked; users with dead mics are admitted. Reproduce: open the lobby, speak into a working mic, wait for the poller to tick — the confirm button stays disabled and join is always blocked with 'mic-silent'. R1 and R2 are broken by this diff. All other findings are non-critical or consequential on the same root fix.
