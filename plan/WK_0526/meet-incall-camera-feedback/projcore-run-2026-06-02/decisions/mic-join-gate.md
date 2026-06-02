# Decision — keep mic required to join
2026-06-02. source: projcore (frontloaded to JROM via AskUserQuestion).

JROM chose: **KEEP MIC REQUIRED TO JOIN** (do NOT relax the lobby hasMicAccess prereq).
- Consequence: mic-less join stays impossible; the in-call mic-acquire-from-absent code path (built + unit-proven in B1) remains unreachable defensive code. Kept (it's the same unified resolveMediaToggleAction path the camera uses; not separable dead code; works if the gate ever changes).
- B1 directive satisfied: in-call mic toggle is non-stiff (always a working flip since mic is always present); camera-enable-from-absent works + live-proven.
- No further B1 work on the mic gate.
