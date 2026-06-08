# CR-FIX-3 — Fix CODE red-team CR4 findings (selected-sink fallback misreport, map leak, recovery-UX)
You are the IMPLEMENTER (codex). Verifier != fixer.
## FIRST tool call = callback: printf '[projcore callback] CR-FIX-3 STATUS: PROPOSED %s\n' "$(date -u +%FT%TZ)" >> <abs>/callbacks.md ; plan → wait APPROVED-PLAN → implement → DONE.

## BUGS (CR4, found by the concurrency/leak/scenario lens)
1. **HIGH — selected-output failure misreported as success after default fallback** (remote-audio.service.ts:123-140 applyMediaElementSinkWithDefaultFallback; consumers applyOutputDevice ~272, room.page changeAudioOutputDevice ~1009-1021, banner ~669-675, diagnostics ~3497). The helper returns `true` when `setSinkId(selected)` REJECTS but `setSinkId('')` (default) succeeds → callers believe the SELECTED device was applied; selectedAudioOutputId stays the unavailable device, no banner, audio silently on DEFAULT. This is the A4 family (host can't hear on the device they're listening on, no warning).
   FIX: change the helper to report WHICH sink was actually applied — e.g. return `'selected' | 'default-fallback' | 'failed'` (or `{applied:boolean, usedFallback:boolean}`). Update consumers:
   - changeAudioOutputDevice + applyOutputDevice + addPublisher: when result is default-fallback, surface a clear state (e.g. set a `selectedSpeakerUnavailable` signal → a banner like "Selected speaker unavailable — using system default") and record effectiveSinkId in diagnostics distinct from selectedAudioOutputId. Decide selectedAudioOutputId policy: keep the user's choice but mark it unavailable (so it re-applies if the device returns), and make the host AWARE. Do NOT silently report success.
   - The R3 playout diagnostics must show {selectedAudioOutputId, effectiveSinkId, usedFallback} so the next call proves on-selected-vs-on-default.
   - Add a spec: setSinkId(selected) rejects + default succeeds → result=default-fallback, banner/state set, diagnostics reflect fallback.
2. **MED — subscribeMidConflictWarnings unbounded leak** (sfu-client.service.ts:100 decl, 1744 add). Never cleared. FIX: clear it in the teardown/reset paths (clearLocalTransportSessionState ~423, closeLiveTracksForExit ~1475, destroy ~1515) and/or prune entries for a publisher on peer-leave. Add a spec or note asserting it's cleared on teardown.
3. **MINOR** — when the voice watchdog's bounded recovery window (attemptsThisWindow cap) is exhausted while STILL stalled, keep voiceStalled latched (banner stays — do not silently give up); fix the missing/incorrect log level for that case (room.page.ts watchdog).

## Constraints: frontend only; don't touch recorder; RUN tsc --noEmit yourself (=0); npx tsx specs; ng build green; append CR-FIX-3 to changes.md; NO commit.
Reply STATUS: PROPOSED + the helper return-shape change + how each consumer surfaces fallback + the map-clear locations. Wait for APPROVED-PLAN.
