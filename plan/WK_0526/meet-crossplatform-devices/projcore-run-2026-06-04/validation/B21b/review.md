# B21b Review

## Scope
- Touched only room local-track/watchdog logic, remote-audio sink serialization, and focused specs/artifacts.
- Did not touch SFU, signaling, recorder, media acquisition, device picker, TINY5, TINY7, or ERR8.
- Did not rewrite `applyMediaElementSinkWithDefaultFallback`; ERR9 wraps it.

## Review Findings
- TINY2: post-await re-read is before any window mutation/classification, so an ended/disabled/muted track clears the episode and returns.
- TINY4: each kind has one stored handler ref set. Re-attach detaches prior refs for that kind before adding new listeners; cleanup detaches both kinds.
- TINY6: disabled current tracks return `ignore`; enabled ended tracks return `recover-ended`; enabled live mute returns `debounce-mute`. The debounce callback also re-checks `track.enabled`.
- ERR9: per-element weak-map state stores latest desired sink. While an element has an in-flight apply, later requests update desired sink and share the in-flight drain; stale middle requests are skipped.

## Residual Risk
- TINY4 is not directly unit-tested because the attach/detach methods are private on the Angular component. Risk is mitigated by simple stored-ref implementation and build.
- ERR9 serializes per element, matching the approval confirmation. Different elements may still apply sinks concurrently, which is acceptable for this batch.
