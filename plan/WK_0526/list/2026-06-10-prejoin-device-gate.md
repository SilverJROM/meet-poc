---
date: 2026-06-10
type: feature-request
status: building
agent: projcore
qa_verification: pending
---
## JROM verbatim
"lets have a gate on the app that the app requires an approval for all devices (specially the voice) to be authorized first before joining the call and is properly validated please before one user joins the call, we keep experiencing this errors and its really annoying and embarrassing to our users like wtf"
## Locked design (frontload answers 2026-06-10)
- Depth: FULL — permission + live mic-energy test + a real SFU connection/publish dry-run (the step that's been silently failing). BUT smooth/non-technical UX (Meet/Zoom green-room feel); test everything client-side, just make it work.
- Devices: MIC + SPEAKER mandatory & validated; CAMERA only if the client grants access (optional).
- On failure: HARD BLOCK (cannot join until pass), friendly plain-language messaging ("mic/speaker not working"), Retry + guidance. Function like Google Meet / Zoom.

## Addendum 2026-06-10 (JROM): R8 device-selection persistence
"have the settings persist if client selects or changes it, this was a previous issue the selected mic is not persisting make sure this is properly tested fixed that selection on mic/speaker/camera are persistent"

## Addendum 2026-06-10 (JROM): R9 visibility + R10 failure-simulation
"on our tests can we simulate each scenario failing and what would the app be doing... red team try to break the app on each of these ways and check if the app handles it correctly and not just error silently. also i dont want these error shown on the app only on the diagnostics or possibly on the host view (me for now) so im aware when i test this next again"
Confirmed policy: diagnostics + host-only audio-health indicator; guests see only gentle green-room setup help, no in-call technical errors. Never silently un-handled.
