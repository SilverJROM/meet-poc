---
date: 2026-07-01
project: meet-poc
type: autonomous-call
source: projcore
priority: high
search_hooks: [branch-audit, uncommitted-wip, sfu-resubscribe, baseline, b8-mesh-retire-wip, merge-to-main]
---

# Baseline setup + uncommitted WIP handling (WK_0701 SFU self-heal)

## Context / trigger
JROM greenlit the SFU self-heal projcore run and instructed: "merge the branches that
are already on the app to main and so we can cleanly branch on that merged code," and
separately delegated the uncommitted-WIP decision to projcore ("i dont have full details
to decide here pls deliberate this and decide i will accept that, just fix the app").

## Findings
1. **Branch landscape:** 47 local branches, NO remote. `git branch --no-merged main`
   returns exactly ONE: `b8-mesh-retire-wip` (810f275, dated 2026-05-22). The other 46
   are already merged into `main`.
2. **`b8-mesh-retire-wip` is a stale trap.** Dated 5 weeks before `main`'s tip
   (e9aedff, 2026-06-25). `git diff main..b8` shows it LACKS a month of shipped work
   (migrations 0008–0016, admin/account/app-settings modules, TG passwordless, etc.).
   Merging it would REVERT that work. It is not "on the app."
3. **`main` already IS the merged deployed baseline** — 46/47 branches folded in, newest
   tip, and it carries the per-client + international diagnostics that produced JROM's
   failed-call reports. Nothing needs merging.
4. **Uncommitted working-tree WIP** touched the exact fix area: `resubscribePublisher()`
   in sfu-client.service.ts, a `resubscribe` watchdog action + `publisherMicEnabled`
   guard in room-decisions.ts / room.page.ts. It is a partial stalled-audio-recovery
   attempt that STILL gives up (caps at VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW →
   mark-stalled) and does a same-cfSessionId resubscribe, NOT the locked
   rejoin-with-fresh-cfSessionId escalation. The deployed FE bundle (prebuilt static)
   does NOT contain this WIP, so the failed real calls reflect committed e9aedff.

## Decision (autonomous, per JROM delegation)
- **Do NOT merge `b8-mesh-retire-wip`** — destructive, stale, not deployed. `main` is
  already the clean merged code JROM asked to branch from.
- **Preserve the uncommitted SFU WIP, start clean:** saved as
  `prior-art/uncommitted-resubscribe-attempt.patch` (9.3 KB) + `git stash@{0}`; stashed
  tracked changes; created branch `fix/sfu-selfheal-20260701` off e9aedff.
- The WIP patch is handed to the codex55 co-planner in B0 as prior-art ("already tried,
  here's why it gives up") to inform the recovery-ladder deliberation without
  contaminating the B1 reproduction baseline.

## Counterfactual
Committing the WIP as the baseline would have made B1's reproduction diverge from the
deployed bundle (masking the real failure) and inherited unvalidated, still-gives-up code.

## Reasoning
Branch-audit gate (scope.md) + reproduce-first (§1.4h): B1 must reproduce the REAL
deployed failure, which is committed e9aedff, not local WIP. Preserve-don't-discard keeps
the on-point prior work available to the deliberation.
