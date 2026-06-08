# CODE RED-TEAM — round CR6 — lens L6: spec-vs-code divergence + observability
# (Your role = the model you run as.) STREAK 0/3 — fresh lens (NOT structural/concurrency/adversarial-input).
## Context
CR1-5 hardened the implementation across structural/concurrency/leak/adversarial lenses. This round checks: (a) does the CODE actually deliver the REQUIREMENTS, traced to a TEST; and (b) if JROM's NEXT real call still fails, would the diagnostics tell us WHY?
## READ: the CURRENT files + ../IMPL-prod-diff.patch + the design contract ../consensus-r4-registry.md (B1-B22) + ../../og-requirements.md (R1/R2/R3) + ../jrom-evidence-addendum.md.
## Your task — lens L6 (evidence file:line)
1. **Requirement → code → test trace.** For EACH:
   - R1 "host hears every remote publisher's audio on the SELECTED output device": which code guarantees it (addPublisher sink-before-play, registry, banner)? Which TEST proves the OUTCOME (not just that a method was called)? Gap?
   - R2 "host receives ALL concurrent publishers, never suppressed": code (syncPeers all-peers, no active-speaker gating, mid-guard) + test that TWO concurrent publishers are both audible? Gap?
   - R3 "diagnostics prove decode-vs-sink": code (media-playout + per-publisher inbound energy + effectiveSinkId/usedFallback + paused/sinkId per element) + test? Gap?
2. **Spec-vs-code divergence:** walk B1-B22 in consensus-r4-registry.md. Is each one ACTUALLY in the code? Name any B-item that is missing, partial, or diverged from what the design specified.
3. **THE observability question (most important):** if JROM does the next US<->PH call and STILL can't hear, does ONE diagnostics row let us localize the cause to {not-subscribed | decoded-but-not-played | played-to-wrong-sink | autoplay-blocked | muted | device-unavailable}? Walk the interpretation tuple (per-publisher totalAudioEnergy rising? element.paused? element.sinkId vs selected? usedFallback? voiceStalled? blocked?). What failure cause would STILL be invisible/ambiguous in the captured data? That gap is the finding.
4. Anything prior lenses + coordinator missed.
## Output `<role>-coderedteam-CR6.md`:
```
# <role> CODE red-team CR6 (lens L6: spec-vs-code + observability)
## R1/R2/R3 trace: each = covered+tested / GAP (file:line)
## B1-B22 spec-vs-code: any missing/partial/diverged (list) or "all present"
## Observability: can ONE next-call row localize the failure? what's still invisible? (the finding)
## NEW bugs (table) or "none"
STATUS: CLEAN — requirements covered+tested, diagnostics sufficient   OR   STATUS: BUGS — <worst gap>
```
Different lens than CR1-5. Honest CLEAN if clean.
