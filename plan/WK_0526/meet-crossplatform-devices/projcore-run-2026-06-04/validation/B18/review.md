# B18 Review

## Scope Check
Touched only B18 recording scope:
- Recorder start/resume and tracked-id getter
- Room recorder peer sync eviction
- Peer-resumed recorder notification
- Focused tests and required artifacts

No changes made to SFU transport/subscription, signaling admission/reconnect identity, ice-config, active-speaker detection, media acquisition, or B17 leak internals beyond exercising the existing recorder replacement behavior in tests.

## Diff Review Notes
- `ctx.resume()` is guarded by `ctx.state === 'suspended'`, awaited before `MediaRecorder` construction/start, and catch-logs without aborting the recording path.
- `recordedClientIds()` returns `[...sourceFor.keys()]`, providing a stable snapshot before removals.
- Room recorder sync evicts from recorder-tracked ids instead of the live peer list. It preserves the recorder's `local` source key while evicting stale remote ids.
- `peer-resumed` now calls recorder old-id leave/join handling before SFU old-peer removal and before the room state is rekeyed to the new id.

## Residual Risk
The proof is deterministic unit/build coverage. Actual audible mobile recording and live reconnect capture still need real-device confirmation.
