# Queue — meet-realcall-audio-fix (AC-driven for OVM dashboard)

- [PENDING] AC1: Bidirectional audio — desktop host + Android-mobile participant (est: 30m)
- [VERIFIED] AC2: Outbound mic is live, not stuck/frozen at constant (est: 20m)  # Mode A fix + validator review
- [VERIFIED] AC3: Frozen-mic (flat non-zero level) detectable — close Mode-A blind spot (est: 15m)  # levelVariance logic
- [PENDING] AC4: Self-heal actually recovers w/o repeated rejoins (est: 20m)
- [PENDING] AC5: Screen share works for any participant (est: 10m)
- [PENDING] AC6: Video works — participants can see each other (est: 10m)
- [VERIFIED] AC7: No regression of the quiet-voice remedy (est: 15m)
- [PENDING] AC8: Real-call proof on JROM Android tablet then live ReceiptBOT client call (est: 30m)

# Batch mapping (internal plan)
# B01+B02 (detector fix + review) → AC2 + AC3 VERIFIED
# B03 → AC4
# B04 → AC7 (VERIFIED guard)
# B05+B06 → AC2 support + diagnostics
# B07+B08 → AC1,AC5,AC6 + real path (dev then SG per D7)
# B09 → AC8 final proof + handoff
# See plan.md for full atomic slices and §4b annotations.
