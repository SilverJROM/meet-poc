---
date: 2026-05-30
project: meet-poc
run: projcore-run-2026-05-29
batch: B1
type: autonomous-call
trigger: Resolving micSilent semantics for the no-track / muted / stats-absent corners (within projcore APPROVED-PLAN)
source: lead
---

**Context:** B1 wires `outboundAudioLevel/outboundAudioEnergy/micSilent` from `RTCAudioSourceStats`
(media-source/audio). projcore's APPROVED-PLAN must-dos fixed the main axes (instantaneous-audioLevel
drives micSilent; raw level stored; graceful-null on stats absence). But three corner cases were
under-specified and the qa scenarios surfaced an internal inconsistency (SC-4 conflated "no live track"
with "stats unavailable"). I resolved them autonomously within the approval rather than bouncing a
NEEDS-CLARIFICATION for a derivable refinement.

**Resolved truth-table (implemented in `frontend/src/app/services/mic-energy.ts`):**
- TT-E `!hasLiveAudioTrack` → all three `null` (nothing to measure).
- TT-C live + **muted** (`enabled=false`) → `micSilent:true` (known-silent from track state); level/energy
  passthrough from the stat if present, else `null`.
- TT-D live + enabled + **media-source stat absent** → all `null` (graceful absence; not a silence claim).
- TT-A/B live + enabled + stat present → level=raw, energy=raw(cumulative), `micSilent = audioLevel < 0.01`;
  partial stat (`audioLevel===null`) → `micSilent:null`, no false claim.

**Key distinction:** "no live track" and "stats unavailable" both yield `null` (we can't prove capture
state) — only a **muted live track** asserts `micSilent:true`. This honors must-do #2 (muted→true) and
must-do #3 (absence→null) without contradiction, and supersedes the ambiguous SC-4 framing.

**Default /lead would have made:** could have followed must-do #2 literally as "no-track→true", but that
conflicts with must-do #3's absence→null and would emit a false silence claim with no measurement behind it.

**Why decided autonomously (not escalated):** derivable from the approved must-dos + the silent-mic
diagnostic intent; this is an implementation-detail refinement, not a JROM-style/preference call. Surfaced
to projcore via callbacks.md + changes.md Caveats so independent validation sees the resolved semantics; a
REVISE is cheap if projcore disagrees. B2 (silent-mic warning) will consume `micSilent` and apply its own
sustained-window debounce, so a strict per-sample threshold here is the correct raw signal.
