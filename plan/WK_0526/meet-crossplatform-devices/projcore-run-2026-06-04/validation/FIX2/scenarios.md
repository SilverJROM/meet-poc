# FIX2 Scenarios — Mid-call subscribe retry

## S-MIDCALL-1 transient failure then success
- Given a publisher already has a working joined subscription.
- When that publisher advertises a new mid-call audio track and the first partial subscribe throws.
- Then the subscriber schedules a bounded retry and directly calls `doSubscribeTracks` again for the still-missing advertised track.
- Expected: the track is committed to both `subscribedTracks` and `midToEntry`.

## S-MIDCALL-2 cap exhaustion
- Given a mid-call track keeps failing subscribe.
- When retry attempts exceed `SUBSCRIBE_RETRY_CAP`.
- Then retry logs and stops with no dangling timer.

## S-MIDCALL-3 first-try success
- Given the mid-call partial subscribe succeeds on the first attempt.
- Then no retry timer or counter is created and only one enqueue happens.

## S-MIDCALL-4 removed track stop
- Given a failed mid-call track has a retry timer.
- When the live publisher state no longer advertises that track.
- Then the retry tick clears state and does not call `doSubscribeTracks`.

## S-MIDCALL-5 cfSession changed stop
- Given a failed mid-call track has a retry timer.
- When the publisher's live `cfSessionId` changes before the timer fires.
- Then the old-session retry clears state and does not call `doSubscribeTracks`.

## S-MIDCALL-6 already subscribed stop / no double subscribe
- Given another path has already committed the track to actual subscribed state.
- When the retry tick fires.
- Then derived missing tracks are empty, retry state is cleared, and no duplicate subscribe is attempted.

## S-MIDCALL-7 teardown cleanup
- Given mid-call retry timers/counters exist.
- When global teardown, peer teardown, or cfSession eviction runs.
- Then timers are `clearTimeout`ed and counters are removed.
