# DELIBERATION T1 — host-inaudible-remote-audio — ROUND 4 (settle design + END-TO-END trace)
# (Your role = the model you run as.)

## 0. READ FIRST (this dir)
- `consensus-r3-revised.md` — the REVISED fix design (Option A) + the 10 R3 blockers→fixes. THIS is what you validate/attack now.
- `anchor.md`, `jrom-evidence-addendum.md`, `../../north-star.md` (no-suppress directive + 30-round/3-clean bound).

## 1. Context
R3 red-team broke the R2 plan and found 10 blockers (volume/mute, limiter, 130%, share-echo, mid-guard-suppression, watchdog-death, recover-noop, banner-coupling, sink-race, don't-delete-service). The revised design (Option A: direct per-publisher `<audio srcObject>`, NO AudioContext in the audible path) is in consensus-r3-revised.md. JROM raised the cap to 30 rounds; earliest exit = 3 consecutive rounds finding NOTHING new. The prior FIX1-5 deliberation shipped and STILL failed — so be ruthless.

## 2. Your task — THREE things, evidence at file:line
**Q1 — Settle the architecture.** Is **Option A** (direct per-publisher elements, native volume/mute, cap 100%, drop limiter, no AudioContext) the right call to ACTUALLY fix JROM's bug — given we have NOT yet proven A3-vs-A4 from a fresh instrumented call? Argue for A, OR show a concrete reason Option B (per-element GainNode) or a third design is safer. Key test: does Option A close the failure REGARDLESS of whether the true trigger was A3 (orphaned graph) or A4 (sink routing)? Does dropping the AudioContext break anything else that depends on it (search remote-audio.service.ts + room.page.ts for every AudioContext/contextState/mixer consumer)?
**Q2 — Verify each B1-B10 has a CONCRETE, CORRECT fix** in consensus-r3-revised.md. For any that is hand-wavy, wrong, or incomplete, say so with the exact file:line and the correct fix. Pay special attention to B4 (share dedup — exactly one audible element per publisherClientId across ALL layouts: grid, share-stage, strip, pip), B5 (mid-guard reclaim-safe — trace the actual subscribe-retry/cap path sfu-client.service.ts:1100-1133,168-228 and prove the guard can't strand a publisher), and B8 (banner per-element authority).
**Q3 — END-TO-END trace the REVISED design through a full real call and find where it STILL breaks.** Walk every step and name the file:line that handles it (or the gap):
  join (host gesture) → host publishes → publisher A (Windows) subscribes+audible on SELECTED device → publisher B (phone) joins, BOTH audible concurrently → host picks a different output device mid-call → host volume slider → host mute-all then unmute → A starts screen-share (does B4 echo trigger?) → A stops share → B leaves then rejoins → host backgrounds tab/app then resumes (does audio come back? watchdog? autoplay re-block?) → second remote starts/stops talking.
  At EACH arrow: does the host hear correctly on the SELECTED device, everyone concurrently, no echo, controls working? Name the first step that breaks.

## 3. Also: NEW issue hunt (11th+)
Anything not in the B1-B10 list or consensus. If you genuinely find nothing new beyond the revised design, say EXACTLY: "NO NEW ISSUE — revised design complete" (this is what starts the 3-clean streak). Do not invent issues to seem thorough; do not rubber-stamp to seem agreeable.

## 4. Output — write `<role>-verdict-r4.md`:
```
# <role> verdict — T1 round 4
## Q1 — Architecture: Option A confirmed? (or named alternative + why) — evidence file:line
## Q2 — B1-B10 verification table: each = OK / FIX-NEEDED(detail file:line)
## Q3 — End-to-end trace: first breaking step (or "no break found across all steps")
## New issue (11th+) found  — or  "NO NEW ISSUE — revised design complete"
STATUS: AGREE — <design A confirmed + all blockers concretely fixed + e2e clean>
   OR
STATUS: REVISE — <one-line top remaining gap>
```
Evidence-dense. No code edits outside your verdict file.
