# INVESTIGATION — pre-join device gate (Claude panel). Read SEED.md + og-requirements.md first.
## Your job (ONE focused pass; evidence at file:line)
1. ROOT CAUSE: read room.page.ts (join flow ~825-945, publishSfuOnceAfterAdmit 1605, retry 1563), sfu-client.service.ts (publish 157, PC create 1671), the RoomState machine (100). CONFIRM or refute: an admitted joiner can end up hasPc=false / never-published with NO error. Pin the MOST LIKELY failing path (state-never-in-call vs initialPublishStream hang vs trigger-never-fires) + cite file:line. What ONE observability field would prove it next time?
2. GATE DESIGN (R1-R7): design the pre-join green-room on the EXISTING scaffolding (startLobbyPreflight, classifyMicCapture/lobbySelfTestFlag, micSilentWarning, speakerTest). Specify: the gate states + where Join is hard-blocked; how R3 connection-confirmation works (recommend: make the real join->publish robust + only show fully-in-call AFTER localPublishState==='published', friendly "connecting your audio…" + retry + hard fail — NOT a throwaway session); the device-config-test panel (R4: mic meter + speaker test + camera preview + device dropdowns + Confirm). Keep UX Meet/Zoom-smooth.
3. EDGE CASES: permission denied/revoked mid-gate, no mic at all, OS-muted mic, mobile speaker-test autoplay, camera-optional, host vs joiner, reconnect/rejoin, device unplug.
## Output: write investigation/<role>-investigation.md (role = sonnet | haiku):
```
## Root cause: confirmed? most-likely path (file:line) + the 1 observability field to add
## Gate design: states + Join-block point + R3 mechanism + R4 panel (concrete, on existing code)
## Edge cases + how the gate handles each
## Risks / what could make this fix ALSO fail
```
Concise, evidence-dense. This feeds sonnet's implementation.
