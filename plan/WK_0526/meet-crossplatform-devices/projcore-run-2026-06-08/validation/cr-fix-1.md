# CR-FIX-1 — independent validation (projcore) — 2026-06-08
VERDICT: PASS (after 1 send-back).
- iter1 send-back: tsc FAILED (spec readonly 'tracks'). Implementer fixed (removed readonly). Re-verified tsc=0.
- P0 banner-latch CORRECT: voiceStalled field → refreshBlockedState (507); recoverVoicePlayout sets stalled=true (256), cleared ONLY by noteVoiceEmissionAdvanced when emitted advances (room.page.ts:2747-2748). Watchdog: bytes-climbing+emitted-flat → recover+latch; emitted-climbed → clear. Exactly the spec. Test (spec:359-371) asserts banner true despite unpaused element.
- reset() clears unlocked + selectedSinkId (cross-session hygiene). 
- rollback streams + per-publisher energy + dead-code: in diff; sfu-client.spec (+297, ghost-stream test) + diagnostics.spec pass.
- tsc=0, remote-audio/sfu-client/diagnostics specs pass, ng build exit 0.
