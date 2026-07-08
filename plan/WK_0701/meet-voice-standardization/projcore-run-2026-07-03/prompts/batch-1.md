<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-1: Keep retrying to fix a dead microphone instead of giving up after one try

Batch ID: batch-1
Plan: plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-03/og-requirements.md
Branch: feat/voice-standardization-batch-1-mic-silence-retry
Requirements assigned: R1
North-star anchors: env-scope-local-only, cadence-scope-mic-watchdog-only, custom-roster-supersession

Lifecycle: pre-live — Deferral policy: OFF. Read `~/.claude/JROM/style/deferral-policy.md`. Under OFF: no TODO/FIXME, no "follow-up PR," no dead-code shims, no @deprecated markers without a queue.md row in THIS run. Uncertainty = STATUS: NEEDS-INFO, not a defer.

Estimated duration: SHORT (atomic <30min) — 30min

Effort tier (PROJCORE-PROPOSED — confirm or counter-propose at PROPOSED): high
  Mode chord: /fast OFF · effort high
  Validator topology: 3-agent (validator=codex 5.5, session 03_validator_codex55_lkvc)
  Why: realtime-media pure-reducer rewrite touching 3 existing recovery paths, flagged REDTEAM-CANDIDATE by 2-planner deliberation — matches effort-tiering.md high-risk trigger.

Context (from context-handoff.md):
This is the first batch of a fresh run. No prior batch history. The design below was reached by a
mandatory 2-round, 3-way deliberation (Codex 5.5 + a dedicated Opus planner + projcore coordinator)
— NOT negotiated with you as implementer. Your job is to implement the AGREED design below, not
to redesign it. If you find a genuine problem with the agreed design while implementing, flag it
in PROPOSED rather than silently deviating.

Requirements section (verbatim from og-requirements.md):
"R1 — Persistent mic-silence self-heal (not one-shot). The local mic-silence watchdog
(`mic-energy.ts` / `room.page.ts`) currently does ONE device sweep, then falls back to a passive,
dismissible banner. Participant `acctg` rode silent for ~61 minutes in this morning's call because
the sweep never retried. Acceptance: Watchdog keeps retrying recovery (bounded, not
infinite-storm) while the mic remains classified silent, instead of stopping after one sweep.
Active-recovery cadence: every 5-10s while a problem is actively detected/being recovered.
Idle/passive-monitoring cadence: 20-30s is acceptable when nothing is wrong (this range applies to
the mic-silence watchdog ONLY). Banner/warning stays visible and actionable for as long as the mic
is unrecovered."

Observed (current state):
`nextSweepGate` (`frontend/src/app/services/mic-energy.ts:323-335`) is a PURE one-shot-per-episode
reducer: once `swept:true` is set for a silent episode, it returns `shouldSweep:false` forever
until the mic re-arms via `'working'` classification or `micActive:false` (mute/unmute). There is
NO retry interval today — the sweep fires exactly once per silent episode, period.
`room.page.ts:3811-3812` is the watchdog call site consuming the gate. `room.page.ts:580` holds
`micSweepDoneForEpisode` (the boolean state to be replaced). `room.page.ts:2826-2827` resets it on
`cleanupCall`. `room.page.ts:3499` (`verifyInitialCaptureEnergy`) sets it on the post-publish
one-shot check. `room.page.ts:3005-3017` (`handleDeviceChangeAsync`) does NOT currently re-arm it.
`room.page.html:201-204` renders the static banner text regardless of active-vs-exhausted state.

Expected (acceptance criteria) — implement EXACTLY the agreed design in
`deliberation/T1-mic-silence-retry/consensus.md` (read that file in full before writing any code):

1. `nextSweepGate` becomes a pure, `now`-injected, bounded cooldown+counter reducer with signature
   `nextSweepGate(state: SweepGateState, classification: MicCaptureClass, micActive: boolean, now: number, opts?: {maxAttempts?: number; maxDurationMs?: number})`.
   `SweepGateState = { attempts: number; episodeStartedAt: number; nextAllowedAt: number }`.
   `Date.now()` must NEVER be called inside this pure function — caller injects `now`.
2. Dual first-to-fire bounds, exhaustion derived (not stored):
   `MIC_SWEEP_RETRY_INTERVAL_MS = 7_000`, `MIC_SWEEP_MAX_ATTEMPTS = 8`,
   `MIC_SWEEP_MAX_DURATION_MS = 90_000`. Cooldown counted from sweep COMPLETION.
3. Re-arm (reset all 3 state fields to 0) on: `'working'` classification, `micActive:false`
   (mute/unmute), AND on `devicechange` (add this to `handleDeviceChangeAsync`,
   `room.page.ts:3005-3017`, after `refreshDevices()` — this is currently MISSING and must be added).
4. Full non-destructive resweep every retry cycle (reuse existing `runMicSweep()` unchanged) — do
   NOT narrow to "retry last candidate only."
5. Banner copy splits by phase: while retrying (not yet exhausted) show
   `"Still trying to restore your microphone…"`; once exhausted show the existing terminal copy
   (`"No working microphone detected — check your mic/permissions"`). `"Switch microphone"` button
   stays visible throughout — `room.page.html` needs only the message-branch update, no structural
   change.
6. Add a guard: the silence-triggered sweep must not start while `this.audioRecoveryInFlight` is
   true (new guard, in addition to the existing `micSweepInProgress`), so it never races with an
   ended/mute-triggered recovery in flight.
7. NO regression to the existing `attachLocalTrackFailureHandlers` / `handleLocalTrackFailure` /
   `devicechange` recovery paths — those must continue to own broken/ended-track cases exactly as
   today (they act on `micActive:false` states, which are mutually exclusive from the silence
   watchdog's `micActive:true`+silent condition — verify this disjointness holds with a test, don't
   just assert it).

Likely files:
- `frontend/src/app/services/mic-energy.ts` — `nextSweepGate` rewrite (~line 323), new constants.
- `frontend/src/app/pages/room/room.page.ts` — state fields (~580), watchdog call site
  (~3811-3812), `cleanupCall` reset (~2826-2827), `verifyInitialCaptureEnergy` (~3499),
  `handleDeviceChangeAsync` re-arm (~3005-3017, NEW addition), `audioRecoveryInFlight` guard
  before `runMicRecoverySweep` (~3823), banner message branch.
- `frontend/src/app/pages/room/room.page.html` — message signal branch only (~201-204).
- Existing spec file for `mic-energy.ts` (find it — likely `mic-energy.spec.ts` or
  `mic-sweep.spec.ts`) — extend for the new pure-reducer contract. `now`-injection means NO fake
  timers needed — tests should use plain integers for `now`.

Scope:
- Implement only what's in this brief for Req# R1. Do not touch R2-R7 (other queue items).
- This is ONE atomic vertical slice: tight diff, provable by ~1-3 focused tests on the reducer's
  new behavior (retry-after-cooldown, dual-bound exhaustion, re-arm-on-devicechange) plus the
  disjointness test in point 7 above.
- Do NOT touch the WK_0701 SFU subscribe-recovery escalation ladder (retry/renegotiate/rejoin) —
  explicitly out of scope per north-star.md.
- Do NOT touch `active-speaker.service.ts`, `remote-audio.service.ts`, or anything R5
  (volume balancer)-related — different batch, different item.
- Surgical only. No "while I'm in here" scope creep.
- Robust polled assertions, not one-shot checks. Assert the OUTCOME (gate returns
  `shouldSweep:true` after cooldown elapses, `exhausted:true` after bound hit), never just that a
  function was called.
- LOCAL only — no DEV deploy, no live voice.silverjrom.app changes this batch.

Plan handshake protocol (MANDATORY before implementation):
1. Read this brief in full. Read referenced files AND
   `deliberation/T1-mic-silence-retry/consensus.md` in full — that file has additional design
   detail (banner copy exact strings, guard reasoning) not fully repeated here.
2. Reply with PROPOSED: mechanism-level diagnosis + planned files + risks + estimate confirmation.
3. Confirm or counter-propose the effort tier (one-line "why"). Higher wins on conflict.
4. End reply with: STATUS: PROPOSED — <one-line approach> · complexity: <confirmed-or-counter> · why: <one line>.
5. Wait for projcore APPROVED-PLAN before writing code.
6. If REVISE-PLAN returned, address gaps, re-emit STATUS: PROPOSED.

After APPROVED-PLAN:
7. Implement at the agreed mode chord — set `/model` (codex) or apply thinking marker (Claude) per APPROVED-PLAN tier. Default-cap at medium; auto-escalate to high on the 2nd send-back on this task (log in changes.md).
8. Reply with STATUS: DONE — <one-line summary> when build + targeted tests green.

Required artifacts:
- batch-1/scenarios.md
- batch-1/changes.md (User Report verbatim + Root Cause mechanism + Code Changes per-file WHY)
- batch-1/review.md
- batch-1/test-report.md
- batch-1/screenshots/ (N/A for this pure-logic batch — note explicitly if no UI screenshot applies, do not fabricate one)
- batch-1/independent-validation.md (validator writes this, not you)
- decisions/<YYYY-MM-DD>-<slug>.md per §1.15 — MANDATORY for any non-trivial autonomous call (if none, state explicitly: "Autonomous decisions: none").

---

## Streaming-order mandate (root cause of pre-v4 stalls — JROM 2026-06-06 panel-locked)

**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). Not the first sentence — the first TOOL CALL, BEFORE any prose tokens stream. This is a buffer-flush guarantee: if your session is interrupted between prose-streaming and the tool call, the callback never lands and projcore stalls. Append first, prose after.**

## Callback emission — the ONLY sanctioned form

Use the helper. Do not hand-write `>>` redirection — the helper validates role/state/note and locks atomically:

```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-03/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-1 <STATE> "<note>"
```

The dispatch gateway pre-bakes `PROJCORE_CALLBACKS_FILE=<abs-path>` so you can copy the line verbatim.

The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)

```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states:   WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO

NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```

The helper REJECTS coordinator-only states and any unknown token. Use WORKING only for non-terminal progress (first reply if no routeable state yet, or any reply >2min since last callback). Emit terminal/handshake state directly when you have it.

## ACK stop-rule

Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-1[[:space:]]+RECEIVED' "/home/agjrom/websites/meet-poc/plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-03/callbacks.md"
```
If a matching line exists — **STOP emitting callbacks for this batch.** Coordinator has received your state.

## Optional pane-STATUS echo (human-readable mirror only)

End your reply with `STATUS: <STATE> — <same short note>` for human/transcript readability. The pane STATUS is NOT in the detection path — projcore reads the callback file. If pane STATUS state ≠ callback STATE, callback wins (debug-logged, not surfaced to JROM).
