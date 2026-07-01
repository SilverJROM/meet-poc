## Accepted: B1(R1) B2a+B2b(R2) B3(R3) B4(R4) — ALL VERIFIED. Commits: 6643a02 e33a98d 5f4a6bf fc05c58 8b6825d.
Branch: fix/sfu-selfheal-20260701. The full self-heal ladder is shipped: subscribe never-give-up + full rejoin
+ stalled-audio escalation + publish/PC recovery, all epoch-guarded, throttled, with visible fallback UI.
Open: R5(B5 diagnostics honesty), R6(B6-B9 multi-participant + real calls).

## Ready for Batch-B5 (diagnostics honesty, R5) — no red-team, complexity medium
R5 acceptance: (a) /api/sfu/tracks failures NOT recorded as lastGumError; (b) diagnostics have SEPARATE fields
for device / publish / subscribe / recovery / playout / remote-inbound stats; (c) advertised-not-subscribed is
obvious+actionable in the payload/page.
Existing infra to build on:
- B1 added `lastSubscribeFailureEvidence` (SubscribeFailureEvidence) + `isLastGumErrorCandidate()` in
  sfu-subscribe-failure-evidence.ts — the 406-not-GUM separation primitive already exists; B5 wires it into the
  diagnostics PAYLOAD + page.
- B2a/B2b/B3/B4 emit `lastRecoveryEvent` (rung/publisher/epoch) + `sfuRejoinThrottled` + `publishRecoveryFailed`.
- Diagnostics: room.page.ts collectDiagnostics()/DiagnosticsPayload + lastGumError signal (room.page.ts:535,
  set at ~3898/4002 + diagnosticsGumError()); advertisedRemotePublisherDiagnostics() already computes
  quality 'advertised-not-subscribed'. frontend/src/app/pages/diagnostics/diagnostics.page.ts renders it.
- meeting-sessions.service.ts DiagnosticsPayload type (lastGumError, peers, advertisedSubscribed etc).
Task: ensure /api/sfu/tracks 406 lands in a SUBSCRIBE-error field, not lastGumError (which is device/GUM only);
add the per-layer fields (device/publish/subscribe/recovery/playout/inbound) to the payload + surface
advertised-not-subscribed clearly. Reproduce-first: show a 406 currently mislabeled as lastGumError, then fixed.
Routing: grok composer (mechanical) — codex55 validates hard (grok self-report untrusted).
