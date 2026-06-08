# DELIBERATION T1 — host-inaudible-remote-audio — ROUND 5 (validate the registry design)
# (Your role = the model you run as.)

## 0. READ FIRST (this dir)
- `consensus-r4-registry.md` — the FINAL fix design (central per-publisher audio registry). THIS is what you validate/attack.
- `consensus-r3-revised.md` (the 10 blockers), `anchor.md`, `jrom-evidence-addendum.md`, `../../north-star.md` (no-suppress + 30-round/3-clean).

## 1. Context
R1-R4 converged: root cause = host playout silently fails to deliver to the SELECTED output device (A4 sink-routing + A3 orphaned graph). Fix = Option A direct per-publisher `<audio>` (no AudioContext), now specified as a CENTRAL REGISTRY in RemoteAudioService (consensus-r4-registry.md). R4 added B11 (mixerEnabled hardcoded true → fix unreachable) + B12 (late-joiner autoplay silence — peers joining after the host gesture stay silent). 4 rounds in; earliest exit = 3 consecutive rounds finding NOTHING new. Prior FIX1-5 shipped and STILL failed — be ruthless.

## 2. Your task — validate the registry design, evidence at file:line
**Q1 — Ownership model.** consensus-r4-registry.md proposes the SERVICE creates/owns the `<audio>` elements (single-ownership) vs tiles creating + registering with the service. Which is correct in this Angular (zoneless, signals) app? Pitfalls: element lifecycle vs tile @if render, change-detection, the element living outside Angular's view (does it still get sinkId from `applySpeakerDevice`'s `querySelectorAll('video,audio')`? does it leak on call end?). Pick one and justify, or propose a cleaner ownership.
**Q2 — B12 late-joiner: is it FULLY closed for EVERY join order?** Walk all cases and name the file:line that saves each, or the gap:
  (a) publisher A subscribes BEFORE the host's first gesture; (b) B joins AFTER the host gestured once; (c) BOTH join before any gesture; (d) host gestures, A joins, host never clicks again, B joins much later; (e) host backgrounds/resumes then C joins. For each: does the host end up HEARING that publisher on the SELECTED device without requiring a fresh manual click? If a case needs a click, is the banner shown so the user knows? Is there ANY case of permanent silent-no-banner (the original bug)?
**Q3 — B4 dedup-by-construction.** Confirm "one registry element per publisherClientId" actually makes share-layout echo impossible across grid + share-stage + strip + pip simultaneously. Any path where two registry entries or two elements for one publisher can exist (e.g., participantId vs clientId key, screen+camera from same publisher, rejoin race creating a second element before the first is removed)?
**Q4 — 13th-issue hunt + re-trace.** Anything the registry design still misses (teardown/leak on call end, reset() path, SSR/test mocks, the `media-playout` diagnostics correctness, mute-all↔watchdog interaction, volume persistence of the stale 1.3 value in localStorage). If genuinely nothing new: say EXACTLY "NO NEW ISSUE — registry design complete".

## 3. Output — write `<role>-verdict-r5.md`:
```
# <role> verdict — T1 round 5
## Q1 — Ownership: service-owned vs tile-registered — pick + why (file:line)
## Q2 — B12 join-order table: (a)(b)(c)(d)(e) each = HEARD / NEEDS-CLICK(banner?) / SILENT-NO-BANNER(gap)
## Q3 — B4 dedup-by-construction holds? (or path that breaks it, file:line)
## Q4 — 13th issue (or "NO NEW ISSUE — registry design complete")
STATUS: AGREE — <registry design complete + B12 fully closed + dedup holds>
   OR
STATUS: REVISE — <one-line top remaining gap>
```
Be ruthless; do not rubber-stamp; do not invent. Evidence at file:line. No code edits outside your verdict file.
