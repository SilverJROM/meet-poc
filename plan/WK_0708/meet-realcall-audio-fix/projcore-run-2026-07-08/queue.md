# Queue — meet-realcall-audio-fix (AC-driven for OVM dashboard)
# RUN STOPPED by JROM 2026-07-09. Do not resume. Superseded by projcore-run-2026-07-09.
# Remaining ACs were real-call gates only JROM can perform — NOT done / NOT verified.

- [PENDING] AC1: Bidirectional audio — desktop host + Android-mobile participant (est: 30m)
- [VERIFIED] AC2: Outbound mic is live, not stuck/frozen at constant (est: 20m)  # Mode A fix + validator review (prior run claim; diagnosis later disputed)
- [VERIFIED] AC3: Frozen-mic (flat non-zero level) detectable — close Mode-A blind spot (est: 15m)  # levelVariance logic
- [PENDING] AC4: Self-heal actually recovers w/o repeated rejoins (est: 20m)
- [PENDING] AC5: Screen share works for any participant (est: 10m)
- [PENDING] AC6: Video works — participants can see each other (est: 10m)
- [VERIFIED] AC7: No regression of the quiet-voice remedy (est: 15m)
- [PENDING] AC8: Real-call proof on JROM Android tablet then live ReceiptBOT client call (est: 30m)
