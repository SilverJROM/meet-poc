# Implementation Plan — Voice SFU Self-Heal (WK_0701)

Branch: `fix/sfu-selfheal-20260701` (off `main` @ e9aedff). Lifecycle: **pre-live** (deferral OFF).
Scope: LOCAL + DEV (`https://voice.silverjrom.app`). Reproduce-first per §1.4h (issues, not features).

Known files (from handoff + code survey):
- `frontend/src/app/services/sfu-client.service.ts` — subscribe/retry/renegotiate/rejoin ladder, the cap.
- `frontend/src/app/services/sfu-roster-utils.ts` — `planSubscribeRetry`, cap logic.
- `frontend/src/app/services/remote-audio.service.ts` — voice-recovery window/attempts, stall decision.
- `frontend/src/app/pages/room/room.page.ts` — watchdog wiring, diagnostics payload, `lastGumError`.
- `frontend/src/app/pages/room/room-decisions.ts` — `decideRemoteVoiceWatchdogAction`.
- `backend/src/modules/realtime-sfu/index.ts` — `/sfu/tracks|update|renegotiate|close` CF passthrough (406 surfaces here).
- Diagnostics: `frontend/src/app/pages/diagnostics/diagnostics.page.ts`.
- Prior-art: `prior-art/uncommitted-resubscribe-attempt.patch` (partial, still gives up).

**B0 consensus (APPROVED-PLAN):** the agreed recovery approach is the 4-rung escalation ladder
(same-session retry → forced renegotiated subscribe → coalesced full local SFU rejoin with fresh
cfSessionId → visible unrecovered UI) inside ONE recovery coordinator keyed by {epoch, publisher},
with an epoch guard so stale in-flight subscribe responses can't bind to a rejoined PC. Full detail:
`deliberation/B0-recovery-ladder/consensus.md`. B2 owns the coordinator; B3/B4 reuse it.

## Batches (atomic vertical slices, <30min, ~1-3 tests each unless flagged)

### B0 — Lock requirements + co-planner deliberation  [DELIB]
codex55 co-planner reviews requirements/north-star/plan at spec level AND settles the
recovery-ladder strategy (retry-only vs renegotiate vs full rejoin vs hybrid escalation
ladder). Freeze `[DELIB]`/`[REDTEAM]` assignment lists. Decide WIP prior-art disposition.
Output: consensus on the escalation mechanism + finalized queue.

### B1 — Local reproduction harness  [Req R1]  (high — heisenbug-ish repro)
Fault injection for: (a) `/api/sfu/tracks` 406 for a selected participant; (b) advertised-
but-not-subscribed remote track; (c) subscribed-but-no-usable-audio stats. Deliver FAILING
tests that demonstrate current give-up/non-healing. Validator reproduces on rendered app first.

### B2 — Subscribe recovery: cap → rejoin escalation  [Req R2]  [DELIB][REDTEAM:elite]  (high)
Replace terminal permanent-stop with escalation: bounded retry → renegotiate → full SFU
rejoin (fresh cfSessionId) while admitted + audio advertised. Bounded + observable; no retry
storms. Tests pass for forced 406; diagnostics prove retry/renegotiate/rejoin path.

### B3 — Stalled remote-audio recovery  [Req R3]  [REDTEAM:standard]  (high)
Detect subscribed-but-silent/stalled inbound (packets/bytes/energy/concealed) vs healthy
silence (mic off). Per-publisher recovery that does NOT clobber unrelated healthy streams.

### B4 — Publish/PC recovery  [Req R4]  [REDTEAM:standard]  (high)  ← upgraded per B0 consensus
Handle admitted client with `hasPc:false` / publish not established (Glory-like — a real
participant-breaking mode in the 5-way call). Retry publish or rejoin SFU without manual leave;
explicit UI on unrecoverable. Reuses B2's recovery coordinator + epoch guard.

### B5 — Diagnostics honesty  [Req R5]  (medium)
`/api/sfu/tracks` 406 no longer recorded as `lastGumError`. Separate device/publish/
subscribe/recovery/playout/remote-inbound fields. `advertised-not-subscribed` surfaced.

### B6 — Local multi-participant capstone  [Req R6]  [REDTEAM:standard]  (high · TEST-HEAVY)
2-person + 5-person fault-injection scenarios green. Diagnostics rows prove subscriptions +
recovery. Per-module first; this is the local capstone before remote.

### B7 — Peer2-machine validation (agent-measured)  [Req R6]  (high)
Peer2's machine joins via relay; inject/observe failure; app self-heals; agent-measured
healthy audio both ways (RTP + energy + diagnostics). No human-audible claim yet.

### B8 — 3-way validation (agent-measured) + dev_machine shutdown  [Req R6]  (high)
JROM-local + Peer2 + dev_machine (Grok Build; revalidate gateway first — Composer degraded).
All participants subscribed-or-recovered, agent-measured. **Then shut down dev_machine**
(`ssh silverjrom@192.168.254.123 'sudo nohup poweroff >/dev/null 2>&1 &'`).

### B9 — Final human-audible gate (BLOCKED-for-human)  [acceptance]
After B8 + dev_machine down: ping JROM. JROM opens a room, Peer2's machine joins + plays a
known sound, JROM confirms he HEARS it. Only then mark R-rows VERIFIED + run complete.

## Dependencies
B0 → B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → B9 (mostly linear; B4/B5 can follow B2/B3).
Red-team back-gates B2 (elite), B3 (standard), B6 (standard). Deliberation front-gates B0, B2.
