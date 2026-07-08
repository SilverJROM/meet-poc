# Requirements Coverage Matrix — meet-realcall-audio-fix (AC-driven)

- [PENDING] AC1: Bidirectional audio — desktop + Android real call (est: 30m)
- [VERIFIED] AC2: Outbound mic is live, not stuck/frozen at constant (Mode A fix: levelVariance check in classifyMicCapture)
- [VERIFIED] AC3: Frozen-mic (flat non-zero) detectable — close Mode-A blind spot (levelVariance < 0.005 + flat energy → silent)
- [PENDING] AC4: Self-heal actually recovers w/o repeated rejoins (est: 20m)
- [PENDING] AC5: Screen share works (est: 10m)
- [PENDING] AC6: Video works (est: 10m)
- [VERIFIED] AC7: No regression of the quiet-voice remedy (est: 15m)
- [PENDING] AC8: Real-call proof on JROM Android tablet then live ReceiptBOT client call (est: 30m)

# Evidence
# AC2/AC3: validation/b01-diagnosis.md + validator-b01-b02.md + mic-energy.ts change + test + ng build success
# See plan.md for batches and og-requirements.md for full verbatim AC text.
