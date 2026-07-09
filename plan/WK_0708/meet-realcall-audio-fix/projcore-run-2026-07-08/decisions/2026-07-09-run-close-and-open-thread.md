---
source: north
date: 2026-07-09
effort: meet-realcall-audio-fix
priority: high
search_hooks: [run close, exit condition, human-owned AC, root cause not pinned, T1, detector vs mechanism, circling, ready-to-test]
---

# Decisions — run close, the open root cause, and the exit-condition defect

## D10 — Run stopped by JROM; fix committed but NOT merged
**JROM verbatim:** "i'm worried it spent 9hrs circling on circles on this 9hrs and 3/8 is only done?"
then "yes" (to: commit the fix, stop the run, hand over a test script).
**Decision:** coordinator session `lkvcgrok` + validator child killed; the detector fix committed as
`856104f` on `batch-01-diagnosis-2026-07-08`, run record as `ee8cf3c`. The branch **merges to `main`
only after the real-call proof passes** (project north-star §6). The fix is already live on dev
(`voice.silverjrom.app`), so JROM can test without a further deploy.

## D11 — T1 (true root cause) is OPEN; the shipped change is a DETECTION fix
**Decision:** we do **not** claim root cause. `validation/b01-diagnosis.md` calls the `classifyMicCapture`
blind spot the "root cause"; that is a **misattribution** and is corrected here. The blind spot explains
why a dead mic went unnoticed for ~3 minutes (Mode A). **Why the Android capture froze** —
volume-standardization vs `getUserMedia` constraints vs AudioContext suspend — was never pinned. Evidence
against the leading suspect: `doPublish` publishes the raw gUM track, and the balancer issue reads
"LOGGED, NOT STARTED (R5)". Two open questions ride on JROM's test: does the self-heal **recover** Android
capture once triggered (AC4), and is **Mode B** (`micSilent=1`, level 0, 5 errors, never recovered) a
separate defect?

## D12 — The planning deliberation was skipped; that is the substantive failure
**Decision:** `planning_criticality: critical` (D3) existed to force a cross-provider panel to pin the
mechanism **before** any patch. The run patched first. Recorded as a process defect, not a code defect.
Any resumption of this effort re-enters at **planning**, not implementation.

## D13 — The circling was a /north spec defect, owned by /north
**Decision:** the exit condition handed to projcore was self-contradictory — "drive to ready-for-JROM-to-
test" AND "deferral OFF, don't complete until the queue is empty" — while AC1/AC4/AC5/AC6/AC8 are real-
call gates projcore cannot perform. Unsatisfiable queue → ~6h of idle re-sync instead of a clean stop.
**Correction (candidate promotion, pending JROM approval):** ACs requiring a real device / real call /
human judgment are tagged `owner: JROM`; deferral=OFF binds only agent-ownable ACs; the run's exit
condition becomes "all agent-ownable ACs closed → notify ready-to-test → **stop**."

## Deferred / not actioned this run
- **D7 second leg:** SG machine long-haul validation never reached (dev-machine leg not yet green).
- **D7 ops rule:** "shut down `dev_machine` when not in use / when done" — dev is currently **up**
  because it serves the fix for JROM's test. Shut down after the real-call proof.
- **AC7 (quiet-voice remedy holds):** marked verified by the run, but never exercised on a real call.
