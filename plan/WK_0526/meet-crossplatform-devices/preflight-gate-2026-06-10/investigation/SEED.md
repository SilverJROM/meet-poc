# Investigation SEED (projcore/opus findings to date) — confirm + extend
## The failure (real call 4b14bc30, 2026-06-09 Manila, joiner "Joanne" MacBook/Chrome)
- Joanne: signaling/WS CONNECTED + admitted (posted 10 diagnostics) BUT sfuDiagnostics.hasPc=FALSE across all samples, outboundTracks=[], publishStatus=null, empty cfSessionId, lastGumError=null. => her client NEVER created a PeerConnection / never published. Host (silverjrom): 66 samples, ZERO inbound from her. => nothing was transmitted; host had nothing to hear. She left after ~1min.
- This is NOT the playout bug (that was fixed+verified on b14654d6). This is UPSTREAM: joiner never publishes. Symptom identical (host can't hear joiner), root cause different.
- Pattern: "almost always when the joiner is not me" — JROM's own-device tests always reach publish; real remote joiners hit a path where publish silently never fires, with NO error to joiner or host.
## Code locus (frontend)
- publish() creates the PC at sfu-client.service.ts:1671 (inside publish()). publish() is only called by publishSfuOnceAfterAdmit (room.page.ts:1605) which first awaits initialPublishStream() (1606) THEN sfuClient.publish() (1607). The retry loop (1563-1602) is gated on state()==='in-call'.
- => hasPc=false means publish() was never reached for Joanne: EITHER (a) her state never became 'in-call' (stuck connecting/waiting-room), OR (b) initialPublishStream() (device acquisition) hung, OR (c) the post-admit trigger never fired. Persisted diagnostics DON'T capture her roomState/local-track state => OBSERVABILITY GAP (can't fully disambiguate from data).
## Existing scaffolding to BUILD ON (don't reinvent)
- RoomState machine room.page.ts:100; startLobbyPreflight; classifyMicCapture + nextMicWarningState + lobbySelfTestFlag (B5 lobby mic self-test ALREADY detects silent mic in lobby); micSilentWarning(+Message) friendly copy; speakerTest (speakerTestCount ~line1043); verifyInitialCaptureEnergy (B2a post-publish energy).
## Investigation questions for the panel
1. Confirm/refute the hasPc=false root cause; pin which of (a)/(b)/(c) is most likely + the exact code path; what observability to add to PROVE it next time.
2. Design the pre-join gate (R1-R7) on the existing scaffolding: exact states, where Join is gated, how the connection-confirmation (R3) works WITHOUT a throwaway session (likely: make the real join->publish robust+visible + only show 'in-call' after 'published'), and the device-config-test panel (R4).
3. Edge cases: permission denied/revoked mid-gate, device unplug, no mic at all, mic muted at OS, speaker test on mobile (autoplay), camera-optional, host vs joiner, reconnect.
