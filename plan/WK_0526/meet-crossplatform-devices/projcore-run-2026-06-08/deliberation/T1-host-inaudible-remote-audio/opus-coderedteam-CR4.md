# opus CODE red-team CR4 (concurrency / leaks / scenario)

## Concurrency / race findings
None blocking. addPublisher is async (awaits setSinkId, play) and syncPeers fires `void addPublisher(...)` fire-and-forget, but re-entrancy is correctly guarded:
- The entry is registered SYNCHRONOUSLY (register at 396) before any await; isEntryCurrent (checked after EACH await) = `inCall && entry.generation === this.generation && registry.get(id) === entry`. So any interleaving — same-peer re-add (removePublisher replaces the entry object), reset()/leave (inCall false + clearRegistry), generation bump — makes the in-flight stale addPublisher fail isEntryCurrent and call destroyRegistryElement(entry) → no orphan, no double-element, no lost update. Triple guard is sound.
- removePublisher is synchronous (delete + destroy) so it can't interleave a half-state.

## Leak findings
- destroyRegistryElement removes ALL listeners (track 'ended' + el playing/play/pause/ended/error), pauses, nulls srcObject, el.remove(). No element or listener leak. Called from removePublisher, clearRegistry, and every stale-entry path in addPublisher.
- Watchdog maps pruned: remoteVoiceWatchdogPeers.clear() on stop/mutedAll, .delete on no-sample; micSilenceWindow reset on transitions; subscribeMidConflictWarnings is a bounded de-dup set.
- MINOR (observation, not a bug): a peer that LEAVES mid-call leaves a stale `remoteVoiceWatchdogPeers` entry until the next clear() (it simply stops being iterated). Bounded by distinct-participant count, fully cleared on call end. Optional: prune entries for peers absent from the current inbound set. Not a real leak.

## JROM-scenario trace (host + NON-DEFAULT sink + 2 talkers + churn)
host joins (gesture → unlocked sticky=true) → selects non-default output (applySpeakerDevice + registry applyOutputDevice setSinkId per element) → A(windows) joins+talks: addPublisher(A) sink-before-play on the SELECTED sink, plays → HEARD. → B(android) joins+talks: addPublisher(B) own element, same selected sink, unlocked → plays → HEARD concurrently (no gating). → A mutes (track ends/replaced) → syncPeers track-id diff → element updated; A unmutes → new track → re-added, HEARD. → B leaves (removePublisher destroys element) + rejoins (fresh addPublisher) → HEARD. At no step is the host silent; both audible on the selected sink throughout. setSinkId on direct-stream elements is reliable (the A4 fix). 

## NEW bugs
None. tsc=0, specs pass, ng build green (verified CR-fix-2 round). Core path + the two CR-fix-2 corrections all hold.

STATUS: CLEAN — no concurrency race, no leak (one bounded stale-map observation, not a bug), JROM scenario audible throughout. Vote toward streak 2/3.
