# CODE RED-TEAM — round CR7 — lens L7: state-machine exhaustiveness + full-lifecycle reset hygiene
# (Your role = the model you run as.) STREAK 0/3 — fresh lens (NOT structural/concurrency/adversarial-input/observability).
## Context
CR1-6 hardened correctness, concurrency, inputs, and observability. The bugs have clustered around STATE (stuck voiceStalled in CR2, stale unlocked in CR2). This round exhaustively probes the STATE MACHINE and the full call lifecycle for contradictory/stuck/unreset states.
## READ the CURRENT files + ../IMPL-prod-diff.patch.
## Your task — lens L7 (evidence file:line)
1. **State-machine exhaustiveness of a registry entry.** Enumerate the product of: blocked × voiceStalled × paused × playbackFailure × sinkApplyResult(selected|default-fallback|unsupported|failed) × sinkApplyTimedOut, crossed with service-level unlocked × mutedAll. For each reachable combination: is remoteAudioBlocked / blockedReason / the banner CORRECT and CONSISTENT? Find any combination that is (a) contradictory (e.g. blockedReason=null but element paused & audible-expected), (b) STUCK (a state with no transition out), or (c) where the banner lies (shows clear while silent, or shows blocked while audible). Pay attention to interactions: mutedAll while voiceStalled; playbackFailure='unsupported' (CR-fix-4) vs the banner; sink 'default-fallback' while blocked.
2. **Full-lifecycle reset hygiene.** Walk: fresh load → join → active (publishers, stalls, fallback, mute) → leave (reset) → REJOIN → leave again → (and a 2nd independent call). Does EVERY piece of state reset between calls? Audit ALL service + room fields: unlocked, selectedSinkId, effectiveSinkId, usedDefaultSinkFallback, mutedAll, volume(persisted ok), registry, remoteVoiceWatchdogPeers, micSilenceWindow, subscribeMidConflictWarnings, selectedSpeakerUnavailable, remoteAudioBlocked, voiceStalled per entry, sinkApply state, the SFU subscribe guards/permanent-stop flags. Name ANY field that leaks stale state into the next call (the CR2 'unlocked' class — are there siblings?).
3. **Banner/blockedReason truth across transitions:** rapid mute→unmute, stall→recover, fallback→device-returns, unsupported-browser. Does blockedReason always converge to the right value, never stuck?
4. (sub-probe) Diagnostics payload now carries device ids / sink ids / egress / manifest to the server — any privacy/redaction concern for non-owner, or oversize payload?
5. Anything prior lenses + coordinator missed.
## Output `<role>-coderedteam-CR7.md`:
```
# <role> CODE red-team CR7 (lens L7: state-machine + lifecycle)
## State-machine: any contradictory/stuck/lying combination? (file:line) or "consistent"
## Reset hygiene: any field leaking stale state across calls? (file:line) or "all reset"
## NEW bugs (table) or "none"
STATUS: CLEAN — state machine consistent + full reset hygiene   OR   STATUS: BUGS — <worst>
```
Different lens than CR1-6. Be exhaustive on the state product. Honest CLEAN if clean.
