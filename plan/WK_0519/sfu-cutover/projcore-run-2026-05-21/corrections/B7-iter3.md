# Correction — B7 iter3 (ONLY remaining gap: bound the subscribe retry)

GOOD NEWS: codex confirms B7 is now RELIABLY GREEN — drop→reconnect reaches subscribedTracks===2 (no ghost, new cfSessionId), exit→0, both fresh-DB runs pass 4/4. The errorCode→throw→retry path is correctly wired. Mesh unchanged. The reconnect bug is FIXED.

ONE remaining gap to close (then B7 is done):

## Gap: the subscribe retry is UNBOUNDED
- subscribeIfNeeded().catch() clears the guard + bumps subscribeRetryVersion, and the effect re-fires — but there's NO attempt cap, backoff, elapsed ceiling, or terminal failure state. If CF keeps returning not_found_track_error (or any persistent subscribe error) for a publisher, this retries FOREVER at HTTP-round-trip cadence — hammering CF + spinning.
- FIX (minimal, ~10-20 lines): add a BOUNDED retry per publisher:
  1. Per-publisher attempt counter (e.g. Map<clientId, number>). Increment on each failed subscribe; RESET to 0 on a successful subscribe.
  2. Cap attempts (e.g. ~6-8) OR an elapsed ceiling (e.g. ~30s). Add a small backoff between retries (e.g. 250ms→500ms→1s, capped) so it's not a tight loop at HTTP cadence.
  3. On exceeding the cap: stop retrying that publisher, log it (and ideally surface a soft "couldn't load X's video" state — but at minimum stop + log; don't leave it silently broken AND don't spin). Keep it recoverable: a NEW presence/roster change for that publisher (e.g. they republish) resets the counter so a genuinely new attempt can happen.
- Don't break the working happy path or the legit transient retry (the ~100ms not_found_track_error case must still succeed on retry 1-2). The bound only stops the pathological infinite case.

## Preserve (do NOT redo)
- The errorCode detection/throw, the catch→bump→effect-retry wiring, doClose 400 handling, reconnect mechanics — all confirmed correct. Only ADD the retry bound.

## After fixing
Re-run tests/sfu-b7-reconnect + tests/sfu-b4a-subscribe TWICE (fresh DB each) — must stay green (the transient retry still succeeds). If feasible, add a tiny assertion/test that a persistently-failing subscribe stops after the cap (don't over-engineer this). Callback FIRST, commit before STATUS: DONE.
