## Topic: Closest-possible LIVE test of the remote-audio fix before JROM's real call

## North-star (JROM 2026-06-08):
"deliberate ... a way to live test this to the closest we can on the variables, android, or mini-pc with
external mic, and us if we can. otherwise im good with what you can come up with."
The prior FIX1-5 PASSED fake-media e2e yet FAILED live — because fake-media is SILENT and accepts any
deviceId, masking the real sink-routing failure. We must NOT repeat that. Design the closest real-world
reproduction we can run ourselves (headless/headed, local), THEN JROM does the final acoustic call.

## Goal of this deliberation:
Produce a concrete, runnable validation PLAN that exercises the ACTUAL failure variables as closely as
possible: (1) host selecting a NON-DEFAULT output device (the A4 trigger), (2) REAL audio energy (not
silent fake-media), (3) multiple concurrent remote publishers, (4) a late joiner, (5) a mobile/Android-like
+ a desktop/mini-PC-like remote, (6) an intl/long-haul network path — and ASSERT audibility using the new
R3 diagnostics (media-playout energy on the SELECTED sink). State honestly what we CAN and CANNOT prove,
and what stays for JROM's real call.

## In scope:
- Chrome flags for REAL audio capture: `--use-file-for-fake-audio-capture=<wav>` (plays a real WAV via getUserMedia) + `--use-fake-device-for-media-stream` + `--autoplay-policy=no-user-gesture-required` vs gesture testing.
- Virtual output sinks (PulseAudio module-null-sink / multiple sinks) so the host can select a NON-DEFAULT device and we assert routing.
- The R3 instrument: assert `mediaPlayout.totalAudioEnergy` rising AND registry `element.sinkId == selectedAudioOutputId` AND `paused==false` per remote publisher = "rendered to the selected sink".
- Multi-context Playwright (host + 2 remotes), one mobile-emulated (Android UA/touch) + one desktop.
- Network: `tc qdisc netem delay 150ms` and/or app forceRelay to model the US long-haul (RTT>=150ms).
- Existing e2e harness in `e2e/` (there are already host-audio e2e tests — see test-results dirs).

## Out of scope:
- Physically running real Android / real US hardware (we can't). Acoustic confirmation = JROM's real call.
- Re-deliberating the FIX (done; this is about VALIDATION only).

## Source pointers:
- frontend/src/app/services/remote-audio.service.ts (registry, playoutDiagnostics, sinkId)
- frontend/src/app/services/sfu-client.service.ts:766 (media-playout capture)
- frontend/src/app/services/meeting-sessions.service.ts (RemoteAudioPlayoutDiagnostics)
- e2e/ (existing Playwright harness + the b1-host-audio tests in test-results/)
- jrom-evidence-addendum.md (the real failure signature), consensus-r4-registry.md (R3/B16 tuple)
