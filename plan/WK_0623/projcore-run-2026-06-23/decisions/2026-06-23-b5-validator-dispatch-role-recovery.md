---
date: 2026-06-23
type: autonomous-call
source: projcore
priority: high
search_hooks: [gateway, --role, validator-dispatch, watcher-mislabel]
---
# B5 validator dispatch — gateway --role omission, recovery

**What happened:** dispatched the validator repro brief via `projcore-dispatch.sh start` WITHOUT `--role validator`
(the gateway defaults to implementer). It mislabeled the dispatch as role=implementer, overwrote
batch-B5.implementer.json, and killed the implementer's watcher (2039323). A new mislabeled watcher (2043236)
was spawned on the validator session.

**Reality check:** both agents have the CORRECT briefs and were working (validator reproducing, implementer
coding) — only the watcher/manifest LABELS were wrong, not the work.

**Recovery (decided):** did NOT re-dispatch (would interrupt the mid-work validator with a double brief send).
Killed the orphan watcher 2043236. Driving both agents via ScheduleWakeup polling (the harness re-invokes the
coordinator via wakeup, not via watcher process exit), reading callbacks.md + panes.

**Counterfactual:** the textbook path re-dispatches validator with `--role validator`; rejected because the
validator had already started and a re-send risks double-processing. Polling is functionally equivalent here.

**Lesson:** ALWAYS pass `--role validator` on the validator dispatch (gateway default is implementer).
