# Batch-21d Scenarios

## SC-ERR6 — Lobby Self-Test Re-Arms After Any Audio Unlock Gesture

Given a user is still in the lobby and mic preview audio becomes activated by `unlockAudioFromGesture()`,
When the lobby self-test poller is not already active,
Then `startLobbySelfTest()` is re-armed so the existing poller can classify the mic capture window.

## SC-ERR6-DUP — Duplicate Poller Guard

Given the lobby self-test poller is already active,
When another successful lobby audio unlock gesture occurs,
Then no second poller is started.

## SC-ERR7 — Diagnostics Carries Device And Platform Context

Given diagnostics logging builds a payload,
When `buildDiagnosticsPayload()` runs,
Then the payload additively includes `platform`, `userAgent`, `selectedAudioDeviceId`, `selectedVideoDeviceId`, and `lastGumError`.

## SC-REG — Existing Diagnostics And Self-Test Behavior Stay Stable

Given existing diagnostics include B16 ICE fields and lobby self-test classification thresholds,
When B21d changes are applied,
Then `requestedIceTransportPolicy`, candidate-pair fields, self-test thresholds, and existing diagnostics fields remain unchanged.
