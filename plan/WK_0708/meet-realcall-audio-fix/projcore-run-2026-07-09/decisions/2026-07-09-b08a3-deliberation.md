# B08A-3 pre-impl deliberation (lean capture-path)

**Status: CONVERGED** (2026-07-09) — settle-equivalent coordinator structural delib on locked plan + banked B08A-1/2/B08S evidence. Full 4-model panel deferred: design surface is composition of already-VERIFIED mechanisms, not open architecture (same lean pattern as B07/B08A-1/2).

## Binding decisions

1. **Evidence class (AC15 live clause):** AC15 VERIFIED only when (a) far-end speech is proven by transcript (B08S-2 `generateScriptTranscript` / recording arbiter path — scriptExpected labeled OK for harness speech, but MUST be the receive-side evidence class the AC names, not local-only counters) AND (b) all four counters advance during that speech window: `totalAudioEnergy`, `totalSamplesDuration`, `packetsSent`, `bytesSent`. Frozen `outboundAudioLevel` alone is never decisive.

2. **Composition only:** Reuse B08A-1 `getOutboundLiveness()` / `extractOutboundLiveness`, B08A-2 `classifySenderLiveness` → expect `both-advancing` on healthy speech; B08S-1 `joinDualBrowserCall` / CallDriver; B08S-2 receive capture optional for WAV spine but **transcript proof is mandatory**. No redesign of classifier or reader.

3. **Call burn:** Exactly **1** call via `call-ledger.incrementCallBurn()` (or harness equivalent already used by CallDriver). Budget 0/25 → 1/25. Fail closed if ledger would exceed.

4. **Sampling window:** Sample liveness on the **sender** (talking peer) at ≥2 points spanning active speech (scheduler phase), build window, assert classifier `both-advancing` and each of 4 counters strictly advances (delta > epsilon per B08A-2).

5. **Injection not required in B08A-3:** Discrimination already VERIFIED offline in B08A-2. Live batch is healthy-speech invariant only. Do not burn extra calls on sender-dead injection here (that's B13W).

6. **Test location:** Prefer `e2e/harness/__tests__/b08a3-*.browser.test.ts` or dual-browser e2e under e2e/ using existing dev env URLs from project_specs — follow B08S-1 patterns. Zero product-code change unless a true gap blocks reading (reader already exists).

7. **Closes:** AC15 only when gate above met. Update req-matrix only after L3 opus PASS.

8. **Risks:** Headless decode / play-unlock already fixed in B08S-2 — if dual-browser join fails, diagnose spine first. Transcript path: use script-sourced labeled transcript from B08S-2 if STT not wired; document evidence class explicitly in changes.md so validator Q0 maps.

## Out of scope
B13W watchdog, Mode A recovery, multi-party, T_gap, weak-signal.

CONVERGED → impl L3 sonnet, redteam standard (budget-lite haiku acceptable if standard models heavy; prefer 1 haiku + note), val L3 opus.
