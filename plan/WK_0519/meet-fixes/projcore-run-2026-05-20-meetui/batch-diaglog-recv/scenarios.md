# DR-33 Scenarios

## TS-DR33-01 Persist Inbound Audio

Given a host and remote guest are in a two-party call with audio flowing, when the owner diagnostics logger persists a sample, then the remote peer sample includes `inboundAudio` with audio-only `packetsReceived > 0`, `packetsReceivedDelta > 0`, `packetsActivelyArriving === true`, and receiver track `readyState`.

## TS-DR33-02 Display Receive-Side Signal

Given a persisted diagnostics session with inbound audio evidence, when JROM opens `/app/diagnostics`, then the detail view shows "Audio recv" next to "Audio sender" and displays an obvious arriving/not-arriving state.

## TS-DR33-03 Preserve Existing Behavior

Given the diagnostics capture is extended, quality classification, auto-degrade, send-side capture, mic selection, and media publishing behavior remain unchanged.
