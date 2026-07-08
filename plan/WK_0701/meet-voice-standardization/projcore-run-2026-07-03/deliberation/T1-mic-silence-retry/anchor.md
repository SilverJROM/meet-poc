# Anchor — T1: Persistent mic-silence self-heal (R1)

## North-star tie-in
`north-star.md`: LOCAL only scope, 3-agent topology, cadence change scoped to the mic-silence
watchdog ONLY (not the WK_0701 SFU escalation ladder), custom mandatory-deliberation roster
(codex55 + Opus co-planners + projcore coordinator, unanimous required).

## Goal
Fix the mechanism that let participant `acctg` ride silent for ~61 minutes in the
2026-07-03 ReceiptBOT call: the mic-silence watchdog detected the silence correctly but only
ever attempted ONE device-recovery sweep per silent episode, then passively displayed a banner
forever. JROM wants active recovery to keep retrying every 5-10s while a problem is being
actively worked, and it's fine for pure background/idle monitoring to stay at 20-30s.

## Confirmed current code state (read directly, not inferred)
- `frontend/src/app/services/mic-energy.ts:29` — `MIC_SILENCE_LEVEL_THRESHOLD = 0.01`.
- `frontend/src/app/services/mic-energy.ts:323-335` — `nextSweepGate()`: a PURE one-shot-per-
  episode reducer. There is NO numeric retry interval today — it is architecturally "sweep once
  per silent episode, then never again until the mic reports 'working' (re-arming the episode)".
  `swept:true` + classification `'silent'` => `shouldSweep:false` forever, no matter how long.
- `frontend/src/app/pages/room/room.page.ts:98` — `MIC_SILENCE_WATCHDOG_POLL_MS = 1_000` (1s).
  This is the CLASSIFICATION poll rate (how often mic energy is sampled/classified) — already
  fast, NOT what JROM is asking to change. JROM's "5-10s vs 20-30s" ask has no existing constant
  to map onto; the fix is architectural (bounded-periodic-RE-sweep instead of bounded-ONE-sweep),
  not a simple interval-constant edit.
- `room.page.ts:3811` — `nextSweepGate(this.micSweepDoneForEpisode, classification, true)` is
  where the gate is consumed; `micSweepDoneForEpisode` is the `swept` flag threaded through.
- Downstream of a confirmed sweep-exhausted-no-candidate state: `'keep-and-warn'`
  (`mic-energy.ts:262-269`) — banner displays, `openInCallDeviceDialog()` is the only manual
  recovery path (`room.page.html:201-204`).

## What the deliberation must resolve (not prescribe — this is for codex55 + Opus to debate)
1. How to turn "sweep once per episode" into "keep retrying every 5-10s while still silent,"
   WITHOUT creating a retry storm (repeatedly re-requesting `getUserMedia` against a dead/absent
   device every 5-10s indefinitely could hammer the OS/browser device layer or the user's
   battery/CPU on mobile).
2. What bounds the retry loop — max attempts? Max wall-clock duration before downgrading to
   passive-warn-only? Does re-arming still happen correctly on genuine mute/unmute (existing
   `micActive=false` re-arm behavior must not regress)?
3. Whether "5-10s active recovery" means literally re-running the full device-enumeration sweep
   every 5-10s, or re-attempting only the LAST failed candidate first with backoff before a full
   re-sweep — trade-off between fast recovery and device-thrashing risk.
4. Whether the passive banner content/urgency should change now that recovery keeps retrying
   (e.g. "still trying to fix your mic" vs the current static message).
5. Regression risk against the existing `attachLocalTrackFailureHandlers` / `devicechange` /
   `handleLocalTrackFailure` recovery paths (`room.page.ts:2991-3017`, `:3336-3375`) — do NOT
   duplicate recovery attempts across both systems simultaneously.

## Explicitly OUT of scope for this item
- The WK_0701 SFU subscribe-recovery escalation ladder (retry/renegotiate/rejoin) — untouched.
- DEV deploy / live validation — LOCAL only this run.

## Deliberation output required
`consensus.md` in this folder: agreed mechanism (file:line targets), the resolved retry
cadence/bound design, and an explicit YES/NO + one-line reason on whether T1/R1 is a **red-team
candidate** post-implementation (retry-storm and regression risk make this a strong candidate —
codex55 + Opus should state their reasoning, not just default yes).
