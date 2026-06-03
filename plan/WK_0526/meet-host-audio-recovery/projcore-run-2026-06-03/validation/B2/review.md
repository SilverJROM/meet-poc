# B2 Self Review

## Findings

- No blocking findings in the scoped diff.

## Checks

- Watchdog lives in `room.page.ts`, which is shared by host and guests.
- Poller uses existing `sfuClient.collectDiagnostics()` inbound-track extraction; no SFU transport or subscribe internals changed.
- `mutedAll` clears watchdog state before polling and the pure detector also returns `none` when `mutedAll === true`.
- Bytes-flat windows reset state and do not run recovery.
- Emitted-climbing samples reset attempts and window state.
- Rebuild step calls `removeSource` then `addSource`, preserving the B1 kickstart creation path and existing gain/mute-all routing.
- Debug counters are exposed in `debugSnapshot()` and reset with `RemoteAudioService.reset()`.

## Residual Risk

- The e2e harness cannot produce real inbound RTP for the synthetic remote source, so emitted-count recovery is proven with deterministic unit fixtures plus B1 mixer e2e regression. Live two-device calls remain the final real RTP proof.
