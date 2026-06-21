## R9 false-positive (muted guest)? host reliably sees failures? (file:line)

### R9 false-positive analysis

`classifyPeerAudioHealth` (`room-decisions.ts:588-593`) classifies based purely on `bytesReceivedNow ≤ bytesReceivedPrev` (the `stalled` case). It takes no mute-state input, and `updateRemoteAudioHealth` (`room.page.ts:2953-2970`) iterates `sfuClient.remotePublishers()` without checking `peer.micEnabled`.

**Does this produce false badges for healthy muted guests?**  
In practice: No, reliably. With `REMOTE_VOICE_WATCHDOG_POLL_MS = 1_500` (`room.page.ts:96`), a correctly muted WebRTC peer (track.enabled=false → Opus DTX → CN packets at ~6–8/s × 28 bytes) will produce ~250 bytes per 1.5s poll window. `bytesReceivedNow > bytesReceivedPrev` → `'ok'` → no badge. A healthy muted peer is NOT flagged under normal conditions.

**Edge case**: A muted peer with a network blip causing zero CN packets in exactly one 1.5s window gets a transient badge (≤1.5s). Low probability, harmless — badge clears next poll.

**More concrete transient FP**: A *newly subscribing* peer is in `remotePublishers()` before their first RTP packet arrives at the host. On the first 1–2 watchdog ticks their track won't appear in `inboundAudio` → `hasTrack=false` → `'no-track'` → badge fires for ~1.5–3s on every new participant join. The function has no grace-period guard for the subscription-setup window. This is a consistent transient false positive, but brief and self-clearing.

**No code-level mute guard**: The structural gap remains — `updateRemoteAudioHealth` has no `peer.micEnabled` check. It would be cleaner to skip or return 'ok' for `!peer.micEnabled` (accessible from `this.peers()`, same `clientId` key confirmed at `room.page.ts:453`). This is a robustness gap, not a functional bug.

### Host reliably sees failures for broken guests?

Yes. Guest publish fails → no inbound track at host (`inboundByClientId` is empty for that clientId) → `hasTrack=false` → `'no-track'` → added to `remoteAudioUnhealthyIds` → badge on host tile within the next 1.5s watchdog tick. The remotePublishers signaling fires when the guest joins, before any track exists, so the host will see the badge promptly after the guest is admitted. No window where a truly broken guest is invisible to the host beyond one watchdog interval.

`peerAudioUnhealthy` (`room.page.ts:2949`) uses `peer.id`; `updateRemoteAudioHealth` populates the set with `clientId`. These are the same identifier (confirmed: `room.page.ts:453` uses `find((p) => p.id === clientId)`). ✓

---

## CR-fix-2/1 regressions? R10 tests meaningful?

### CR-FIX-2 regressions

**micWorking (positive signal):**  
`nextMicWorkingState` (`room-decisions.ts:535-543`): `'indeterminate'` keeps current state, `'working'` → true, `'silent'` → false, `micActive=false` → false. The "indeterminate forever → stuck" scenario is not real in practice — `classifyMicCapture` only returns `'indeterminate'` when `energies.length < 2` (`mic-energy.ts:173`), which is the startup window only. After 2+ samples, it returns `'working'` or `'silent'` based on delta/level. So the gate unblocks within one poll cycle after the user speaks. No false-block found.

**speakerVerified — autoplay-catch correct:**  
`testSpeaker()` (`room.page.ts:1070-1113`) wraps the entire AudioContext creation in try/catch. On `context.resume()` throw or `AudioContext` unavailable, it catches and sets `deviceDialogError` — `speakerTestPending` stays false, `speakerVerified` stays false. Gate stays blocked, user sees guidance. "No" path: `speakerNotHeard()` → `speakerVerified=false` + `deviceDialogError` set. No false-pass scenario found.

**Speaker-switch invalidation:** `changeAudioOutputDevice` resets both `speakerVerified` and `speakerTestPending` (`room.page.ts:1050-1051`). Correct — switching output invalidates the prior test. ✓

**Mic-switch invalidation:** `changeAudioDevice` resets `micWorking` (`room.page.ts:1001`). Correct. ✓

No false-block of good users or false-pass of broken setup found in CR-FIX-2.

### CR-FIX-1 still holds

The quiet-guest re-scope did not reintroduce a silent never-publish path. Evidence:
- The no-live-audio-track path is now a thrown `InitialPublishPermanentError` (`room.page.ts:1014`) instead of a silent `console.warn`. This is caught by the retry loop as a permanent failure → `preflightGateStatus.set('audio-failed')`.
- The `publishTriggerCount` is incremented **before** any early-return (`room.page.ts:1655`) → PATH A detection (count=0 after admit means trigger never fired) survives the re-scope.
- The `wasInCall` branch split is removed; both old paths now call `publishInitialSfuWithRetry` unconditionally with a `.catch()` outer guard (`room.page.ts:1931`). No uncovered publish path.
- The finally-block guard (`shouldSurfacePublishFailure`, `room.page.ts:1740`) remains: any exit from the retry loop that leaves gate at `'audio-connecting'` surfaces `'audio-failed'`. The `publishSucceeded` flag is set only on the `hasOutboundAudioTrack` success path.

CR-FIX-1 is intact. ✓

### R10 tests meaningful?

Each test row covers a specific failure mode with an assertion that would fail on revert:

| Test | Would fail if… |
|---|---|
| R10(a) `stalled`: bytes frozen | `<=` changed to `<` in classifyPeerAudioHealth |
| R10(a) `first-sample → ok`: prev=null | null prev treated as 0 |
| R10(a) bytes decreased → stalled | function required strict decrease |
| R10(b/c) publish-fails/no-trigger → audio-failed | derivePublishGateStatus happy-path widened |
| R10(d) state-revert guard | shouldSurfacePublishFailure's gateStatus check removed |
| R10(e) track-ended → recover-ended | decideLocalTrackFailureRecovery path changed |
| R10(f/g/h) gate blocking variants | missingPreflightPrereqs conditions loosened |
| R10(i) null transceiver → throws | requireLiveTransceiver returned null silently |
| CR-FIX-2 `indeterminate` keeps current | nextMicWorkingState assigned false on indeterminate |
| CR-FIX-2 `micActive=false` → false | gate passed with mic off |
| Speaker gate: tone-played-not-confirmed → blocks | gate passed on speakerTestPending alone |

All 40 assertions verify outcomes, not just that code ran. Each would independently fail on targeted revert of the corresponding fix. ✓

---

## Findings

**[NON-CRITICAL]** `room.page.ts:2953-2970` — `updateRemoteAudioHealth` has no `peer.micEnabled` guard. A healthy muted peer is safe in practice (DTX bytes flow), but there is no structural protection. Concretely: a newly subscribing participant gets a false "No audio" badge for ~1.5–3 seconds on every join (no-track during subscription setup). Badge is self-clearing and doesn't break the call.

**[NON-CRITICAL]** `tile.component.html:35-37` — `audioUnhealthy` condition does not check `!peer().micEnabled`. If the badge fires for a muted peer (edge-case transient), both the mic-off icon and "No audio" badge show simultaneously. Misleading UX, but brief and harmless.

No CRITICAL findings. All talk/record/see paths are sound. No silent failures. No gate that locks out good users (micWorking converges to `true` for any mic with real energy; indeterminate is transient). No gate that passes broken setups (speaker requires explicit "Yes"; micWorking requires positive energy classification).

---

STATUS: CRITICAL-CLEAN — no critical bugs found; two minor R9 false-positive edge cases (subscription-window brief badge, no structural mute-state guard) are NON-CRITICAL UX quality issues that don't break the call or corrupt the signal in steady state.
