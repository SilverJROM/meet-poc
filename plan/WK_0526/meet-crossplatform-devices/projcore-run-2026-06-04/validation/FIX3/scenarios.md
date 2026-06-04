# FIX3 Scenarios — Idempotent doSubscribeTracks

## S-FIX3-1 already-subscribed full set no-op
- Given `midToEntry` and `subscribedTracks` already contain the requested publisher track.
- When `doSubscribeTracks()` is called with only that already-subscribed track.
- Then it returns before `subscribeInitiatedAt`, `existingMids`, rollback snapshots, and POST.
- Expected: no `/api/sfu/tracks` POST, no `subscribeInitiatedAt` stamp, and no map churn.

## S-FIX3-2 join-muted plus unmute double trigger
- Given a publisher joined with `tracks: []`, then unmutes and advertises audio.
- When the FIX2 mid-call path and room-page subscribe effect both enqueue `doSubscribeTracks()` for the same audio track.
- Then op#1 subscribes and commits the track; op#2 sees actual subscribed state and returns as a no-op.
- Expected: exactly one POST, one receive transceiver, and one subscribed entry.

## S-FIX3-3 mixed existing plus missing tracks
- Given one advertised track is already subscribed and another advertised track is genuinely missing.
- When `doSubscribeTracks()` receives both tracks.
- Then the filtered `tracksToSubscribe` list contains only the missing track.
- Expected: POST body excludes the already-subscribed track and reconcile commits the missing track.

## S-FIX3-4 genuine missing track still subscribes
- Given a track is not present in `midToEntry` or `subscribedTracks`.
- When `doSubscribeTracks()` is called for that track.
- Then it proceeds through the existing POST/renegotiate/reconcile path.
- Expected: the track reaches both `midToEntry` and `subscribedTracks`.

## S-FIX3-5 FIX2 mid-call retry still closes S-MIDCALL
- Given a true mid-call track subscribe fails once with CF not-ready behavior.
- When the FIX2 retry timer fires and the track is still advertised and missing.
- Then retry re-enters real `doSubscribeTracks()` and succeeds.
- Expected: the missing track reaches subscribed state and retry timer state clears.
