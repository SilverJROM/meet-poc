## 🔒 RUN PAUSED (JROM, 2026-07-03/04) — read this first on resume

**JROM verbatim:** "ok just defer this until we get a token reset and this is not a priority
right now, put all of this on the backbackburner, but document properly so we can circle back on
this when token allows."

**Not a priority right now — deferred, NOT cancelled.** This is a clean pause point, not an
abandoned run: B1 is fully done and safe as-is; nothing is left in a broken/half-finished state.

### Exact state at pause

- **Requirements:** R1 VERIFIED (committed, independently validated). R2-R7 ASSIGNED, zero work
  started on any of them — no deliberation, no implementation.
- **B1's fix is NOT merged to `main` and NOT deployed.** It lives only on
  `feat/voice-standardization-batch-1-mic-silence-retry` (commit `d2cbce9`). `voice.silverjrom.app`
  is still running the OLD one-shot-sweep code. Decide at resume: merge+deploy now as a
  standalone quick win, or hold it until more batches land and ship together.
- **R1 follow-ups still owed** (see below section, unchanged): standard-tier red-team pass (never
  run), and a real post-fix regression proof specifically for the retry-cadence fix (the two live
  dev_machine/Peer2-machine call tests done 2026-07-03 tested general call audio, not this fix —
  see `decisions/2026-07-03-t1-repro-pivot-to-postfix-regression.md`).
- **Roster is LEANED DOWN as of the pause** (see `north-star.md` "Roster LEANED DOWN" entry) —
  on resume use Sonnet (coordinator, ~10-15% direct consumption) + {grok composer, grok build,
  gpt-5.3 codex spark} as workers. Do NOT respawn the retired Opus co-planner / codex55
  planner-validator sessions from the earlier custom roster — that roster is superseded.
- **Separate, still-unresolved item** (not part of this run, flagged for awareness): the
  transcript/recordings library grouping work (commits `fb88436`..`7513020`, already on `main`)
  is also not yet deployed live — pm2 hasn't restarted since those commits landed.
- **Environments:** dev_machine (`192.168.254.123`) is shut down. Peer2's machine sessions are
  closed. No agent sessions left running anywhere for this run.

### How to resume

1. Read this file in full, then `og-requirements.md`, `north-star.md`, `queue.md`, `req-matrix.md`
   in this run's folder to reload full context.
2. Decide the B1 merge/deploy question above before starting R2, since later batches (esp. R2
   codec/bitrate, R3 reconnect) touch adjacent code and a stale unmerged branch increases
   conflict risk the longer it sits.
3. Pick up at B2 (R2 — audio codec/bitrate hardening) per `queue.md`'s reliability-first order,
   using the leaned-down roster.
4. No time-sensitive state to worry about — nothing is mid-flight, no live sessions to reconnect.

---

## Accepted: Batch-1 (R1) — STATUS: PASS

HEAD: `d2cbce9c69edd0842169b1a5b28bb09bb142adb0`
Branch: `feat/voice-standardization-batch-1-mic-silence-retry`
Implemented: Replaced `nextSweepGate`'s one-shot boolean latch with a pure, now-injected,
dual-bound (8 attempts / 90s wall-clock, 7s completion-cooldown) cooldown+counter reducer;
wired through the in-call watchdog, join-time energy gate, and devicechange re-arm (previously
missing). Banner splits retry-vs-exhausted copy. New `!audioRecoveryInFlight` guard prevents
racing the track-failure recovery path.
Req#s closed: R1 → VERIFIED.
Open in matrix: R2, R3, R4, R5, R6, R7 (all ASSIGNED, not yet started).
Environment/migration gotchas: none — pure frontend logic change, no schema/migration touch.
Validation lessons:
- Manual dispatch-envelope recovery works when the gateway's echo-check races (confirmed via
  direct pane inspection + manual manifest/watcher creation) — do not blindly retry
  `projcore-dispatch.sh start` if the message already landed, to avoid duplicate sends.
- Watcher hard-cap can false-positive on a stale `dispatched_at` anchor when real wall-clock time
  (conversation-turn spacing) diverges from actual active-implementation time — treat as a
  process artifact, not a genuine stall, when the session is actively producing output.
- Implementer needs an EXPLICIT instruction to actually `git commit` — "build + tests green" does
  not imply committed; the brief template should be read as requiring a real commit before DONE
  is accepted (added as an explicit correction this batch, should be stated up-front in future
  batch briefs to save a round-trip).
- codex TUI can show a "Create a plan?" interactive prompt for long pasted messages — send Escape
  to dismiss, then Enter to submit, same as the grok TUI's unsent-long-message pattern.

## Still owed for T1/R1 (not blocking, tracked)
- Standard-tier redteam pass (flagged YES in consensus.md) — not yet run.
- Post-fix dev_machine regression proof (M-1/M-2 in scenarios.md) — dev_machine is currently
  shut down; re-wake needed when this is picked up.
