# B08S-2 batch notes

## Root cause of r2–r6 (do not re-derive)

**LATE INSTALL.** Hooks installed via `page.evaluate` after join (or before goto without addInitScript) never see the app PC, or lose state on navigation.  

addInitScript at document-start + track listener in shim constructor = one mechanism for tracks at join AND renegotiation. No separate "join tracks" path required.

## Design (north-approved)
See `decisions/2026-07-09-b08s2-receive-capture-hook-design.md`.

## Three guards
1. RTCConfiguration passthrough (iceServers, iceTransportPolicy) + unit test
2. Tee capture (playback intact) + assert far-end still hears
3. AudioContext state === 'running' else INVALID
