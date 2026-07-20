● PROPOSED

  Mechanism
  Compose existing banked pieces into one real dual-browser call against the already-running dev server
  (http://localhost:4700, confirmed healthy) — no product-code changes, one small harness-only addition:

  1. Harness change (minimal): add an optional onLive?: (ctx: { page1: Page; page2: Page; roomId: string }) =>
  Promise<void> hook field to CallDriverConfig in e2e/harness/call-driver.ts, invoked once inside joinDualBrowserCall
  right after publish-bytes validation succeeds and before stopReceiveSideRecording/incrementCallBurn. No-op when
  omitted — every other caller (B08S-1/S2 tests) is unaffected. This is the only gap blocking composition: there is
  currently no point in the call lifecycle to sample mid-call stats.
  2. Room choice — auth gap found: createRoom() in call-driver.ts POSTs /api/rooms, which is auth-gated server-side
  (requireAuth) and 401s with no session (verified live: curl -X POST .../api/rooms → 401). The harness has never
  actually established a session, so joinDualBrowserCall's default room-creation path cannot work against the real app
  today. Fix: pass the persistent protected room roomId: 'testroom01001' (TEST_ROOM01) instead — confirmed reachable
  (GET /room/testroom01001 → 200), guest-join needs no host auth, and it's already the standing real-call test room
  (protected in call-ledger.ts's PROTECTED_IDS, so no cleanup obligation). This sidesteps the auth gap without touching
  auth/product code.
  3. New test e2e/harness/__tests__/b08a3-live-sender-liveness.browser.test.ts (real Chromium, real room, mirrors the
  b08a2-sender-liveness.browser.test.ts / b08s2-receive-capture-hook.browser.test.ts evidence-tier precedent):
    - joinDualBrowserCall({ baseUrl: 'http://localhost:4700', roomId: 'testroom01001', speaker1Name: 'bot-140',
  speaker2Name: 'bot-123', recordReceiveSide: true, receiverPageIndex: 1, ledgerBasePath: process.cwd() }, script, {
  onLive }).
    - onLive samples page1 (bot-140, the sender)'s window.__meetDebug.sfuGetStats() at ~200ms cadence for ~1.2–1.5s,
  converts each snapshot via the real extractOutboundLiveness (cross-package import from mic-energy.js, same pattern as
  B08A-2's test) into an OutboundLivenessStats[] window (≥2 points, spanning Chrome's continuous fake-device audio —
  already empirically proven non-silent/climbing per the B08A-2 findings doc, so this is genuine "during speech"
  sampling without needing the still-unwired ConversationScheduler playback injection).
    - A minimal one-utterance ConversationScript for bot-140 is passed through purely so generateScriptTranscript
  (B08S-2) has content to label scriptExpected — documented explicitly in changes.md as the evidence class per the
  brief's allowance (§5), not real STT.
    - Assertions: classifySenderLiveness(window) === 'both-advancing'; each of the four counters strictly advances (last
  > first); receiveSideWavPath exists and its sibling .meta.json (derived from the wav path, no recorder-file change
  needed) shows reason !== 'SILENCE' with rms > 0; transcriptContent non-empty; ledger callBurnCount delta ===
  exactly 1.
  4. validation/b08a3-changes.md (Codex-style) documenting mechanism, the auth-gap finding, room choice, and
  evidence-class note.

  Files touched
  - e2e/harness/call-driver.ts — add onLive hook (~10–15 lines, additive/backward-compatible)
  - e2e/harness/__tests__/b08a3-live-sender-liveness.browser.test.ts (new, ~150–180 lines)
  - validation/b08a3-changes.md (new)

  Estimate: ~25 min

  Risks
  - testroom01001's guest-join DOM flow may not exactly match joinBrowser()'s selectors — will diagnose the spine, not
  touch RTC config, per THREE-guard constraint.
  - This is the first test in this run to hit the real live server end-to-end (prior spine tests were loopback-only) —
  some first-integration surprises possible.
  - If join fails outright, will report BLOCKED with the concrete failure rather than force a pass.

  Tier confirm: L3 (sonnet), matches brief — pure composition, one small harness hook, no classifier/reader/product
  redesign.

  Awaiting APPROVED-PLAN.

✻ Cooked for 4m 22s

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ 
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents

