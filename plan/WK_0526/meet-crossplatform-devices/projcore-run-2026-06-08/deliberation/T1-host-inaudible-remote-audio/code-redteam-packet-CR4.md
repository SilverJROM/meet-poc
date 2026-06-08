# CODE RED-TEAM — round CR4 — concurrency, leaks, real-world scenario traces
# (Your role = the model you run as.)
## Context
CR3 was the FIRST clean round (streak 1/3). To AVOID rubber-stamping, CR4 attacks DIFFERENT surfaces than CR1-3 (which were structural). Be genuinely adversarial — a clean round only counts if you really tried to break it.
## READ the CURRENT files + ../IMPL-prod-diff.patch.
## Your task — NEW attack surfaces (evidence file:line)
1. **Concurrency / async races:** addPublisher is async with awaits (setSinkId, play). syncPeers fires on every peers() change (can re-enter while a prior addPublisher is mid-await). Trace: peer leaves+rejoins rapidly; same publisher's track changes while addPublisher is awaiting setSinkId; reset()/leave fires mid-addPublisher. Does the generation/disposed guard cover ALL interleavings? Any double-element, orphan element, or lost-update?
2. **Leaks over a long/churny call:** elements appended to document.body — are they ALWAYS removed (removePublisher/clearRegistry/onEnded)? Event listeners (playing/play/pause/ended/error on each el; track 'ended') — all removed on destroy? remoteVoiceWatchdogPeers / micSilenceWindow / subscribeMidConflictWarnings maps — do they grow unbounded or get pruned on peer leave?
3. **Scenario trace — THE JROM failure exactly:** host joins, selects a NON-DEFAULT output device; publisher A (windows+ext-mic) joins and talks; publisher B (android) joins and talks; both must be audible on the selected sink concurrently; A mutes/unmutes; B leaves+rejoins. Walk it through the CODE and name any step where host would NOT hear, OR an element/sink/diagnostic is wrong.
4. **Device hot-swap mid-call:** selected output device unplugged; applySpeakerDevice / setSinkId fallback; does audio recover to default with correct banner state?
5. Anything CR1-3 + opus missed.
## Output `<role>-coderedteam-CR4.md`:
```
# <role> CODE red-team CR4
## Concurrency/race findings (or none)
## Leak findings (or none)
## JROM-scenario trace: any failing step? (or "host hears both throughout")
## NEW bugs (table) or "none"
STATUS: CLEAN or STATUS: BUGS — <worst>
```
Ruthless. Different lens than prior rounds. Honest CLEAN if clean.
