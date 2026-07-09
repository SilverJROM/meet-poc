# B08A-2 Changes — AC15b capture-vs-sender discriminator + dual injection (D29)

**Commit:** `51d0d18`
**Date:** 2026-07-09
**Test Status:** pure-classifier unit tests (isolated spec) + real-Chromium browser-context test, both
passing; FE build green; tsc clean (no new errors vs. pre-existing baseline)

## Verdict: DISCRIMINATION CLAUSE ONLY. AC15 NOT VERIFIED here (live clause = B08A-3). Zero calls burned.

### Scope (as APPROVED-PLAN'd)

1. Pure `classifySenderLiveness(window)` → `'both-advancing' | 'capture-dead' | 'sender-dead' |
   'indeterminate'`, mapped off two independent booleans (`captureAdvancing` from `totalAudioEnergy`
   delta, `senderAdvancing` from `packetsSent` delta) — **empirically grounded**, not assumed (see
   `decisions/2026-07-09-b08a2-empirical-findings.md`): this stack runs no DTX on outbound mic audio,
   so `'capture-dead'` reads as energy-frozen-while-packets-still-climbing, NOT "both frozen" as D29's
   summary table implied.
2. Dual injection, independent, both proven against a real Chromium loopback `RTCPeerConnection`
   (required — `outbound-rtp` stats only populate once media actually flows):
   - **Sender-dead (binding):** `sender.setParameters({encodings:[{...e, active:false}]})`.
     `replaceTrack(null)` / `track.enabled=false` were NOT used — measured (same decision doc) to
     confound with the capture-dead signature instead.
   - **Capture-dead:** B07 Mode B (`modeBInitScript`, literal digital silence) reused verbatim,
     unmodified, imported from `capture-injection.js`.
3. Browser-context test proves each injection → its own classification, neither `'indeterminate'`.
4. `classifyMicCapture` / R1: **untouched**. No caller wired to `classifySenderLiveness` (dead-but-
   intended, same status B08A-1's `getOutboundLiveness` had until this batch — B13W is the intended
   future caller).

### Files Modified / Added

1. **`frontend/src/app/services/mic-energy.ts`**
   - New pure `classifySenderLiveness(window: OutboundLivenessStats[], opts?) → SenderLivenessClass`,
     placed directly after `classifyMicCapture` (same window-delta idiom, same file region). Needs ≥2
     usable (non-null) readings of EACH metric — `totalAudioEnergy` and `packetsSent` — else
     `'indeterminate'` (mirrors `classifyMicCapture`'s own insufficient-data handling).
   - New `SENDER_PACKET_DELTA_EPSILON = 1` (packet counter is a whole integer; reuses existing
     `ENERGY_DELTA_EPSILON = 1e-7` for the energy side — no new energy constant).
   - `bytesSent`/`totalSamplesDuration` remain in `OutboundLivenessStats` (from B08A-1) but are not
     part of this decision — `totalAudioEnergy`/`packetsSent` are each the one deciding metric per
     side, matching `classifyMicCapture`'s single-primary-metric precedent (`audioLevel` is
     corroboration there too, not the primary signal).
   - Updated B08A-1's now-stale doc comment ("classifySenderLiveness, which does not exist yet") to
     point at the real function.

2. **`frontend/src/app/services/sender-liveness.spec.ts`** (NEW file)
   - Deliberately **not** appended to `mic-capture-health.spec.ts` — that shared file aborts partway
     through on a pre-existing stale assertion (since `856104f`, flagged by the B08A-1 validator,
     confirmed still present, out of scope for me — same "verifier != fixer" logic applies to an
     unrelated pre-existing break). Anything appended there would never execute.
   - 9 cases: all four classes on clean synthetic windows (U-1..U-4), insufficient-sample/null-field →
     indeterminate (U-5), a leading-null sample doesn't poison an otherwise-good window (U-6),
     epsilon-boundary cases for both metrics (U-7, U-8), custom-epsilon opts honored (U-9).
   - Run via `npx tsx src/app/services/sender-liveness.spec.ts` (same isolation pattern B08A-1's
     validator used to work around the shared file's break).

3. **`e2e/harness/__tests__/b08a2-sender-liveness.browser.test.ts`** (NEW file)
   - Real Chromium (playwright `chromium.launch`), throwaway local HTTP server for fixtures, no
     app/DB/login/room/SFU — same evidence tier as B07's `.browser.test.ts`. 0/25 call budget burned.
   - Establishes a real loopback `RTCPeerConnection` pair inside the page (pc1 sends, pc2 receives, ICE
     candidates exchanged locally on `127.0.0.1`, waits for `iceConnectionState` connected/completed) —
     required because `outbound-rtp` stats need media actually flowing, confirmed by the probe that
     grounded this batch's plan.
   - Imports the REAL `extractOutboundLiveness` (B08A-1) and `classifySenderLiveness` (this batch)
     directly from `frontend/src/app/services/mic-energy.js` via a relative cross-package import —
     smoke-tested to resolve cleanly under `e2e`'s vitest config before committing to this design
     (deliberate departure from B07's "mirror the constant by hand" precedent: B07 mirrored
     *pre-existing, stable* app constants; the function under test here is *new this batch*, so
     mirroring it would just assert a hand-copy against itself — no signal). `pc.getStats()` results
     aren't structured-clone-safe across `page.evaluate()`, so raw `[...report.values()]` entries come
     back as plain objects per sample tick and the real extractor/classifier then run for real in Node
     against those entries.
   - Test 1 (sender-dead): baseline window → `'both-advancing'`; after
     `setParameters({encodings:[{...e, active:false}]})` → `'sender-dead'`, explicitly asserted
     `!== 'indeterminate'`.
   - Test 2 (capture-dead): `modeBInitScript` hold-phase window → `'capture-dead'`, explicitly asserted
     `!== 'indeterminate'`; bonus post-switch-to-speech-fixture window → `'both-advancing'` (mirrors
     B07's hold→post transition shape at no extra call cost).

### Test Results

```
$ cd frontend && npx tsx src/app/services/sender-liveness.spec.ts
sender-liveness: all assertions passed

$ cd frontend && npx tsc --noEmit
(5 pre-existing errors, none in my files — confirmed identical set via `git stash` at baseline:
 diagnostics-layer-honesty.spec.ts:124, remote-audio.service.spec.ts:704-707)

$ cd frontend && npm run build
Application bundle generation complete. [4.069s]

$ cd e2e && npx vitest run harness/__tests__/b08a2-sender-liveness.browser.test.ts
 ✓ sender-dead: setParameters({active:false}) freezes packetsSent while totalAudioEnergy keeps climbing
 ✓ capture-dead: literal silence (B07 Mode B) freezes totalAudioEnergy while packetsSent keeps climbing
 Test Files  1 passed | Tests  2 passed

$ cd e2e && npx vitest run harness/__tests__/b07-capture-injection.browser.test.ts \
    harness/__tests__/gum-shim.browser.test.ts harness/__tests__/b08a2-sender-liveness.browser.test.ts
 Test Files  3 passed | Tests  5 passed   (no regression to B07/D19's existing browser proofs)

$ cd e2e && npx tsc --noEmit
(341 pre-existing errors across playwright specs + a vitest/chai type-duplication issue, identical
 count to baseline via `git stash`; grep for "b08a2"/"sender-liveness" in the output: zero hits)
```

**Disclosed, not silently worked around:** `npx vitest run harness/__tests__` (the FULL directory, all
files together) times out — traced to `b04-baseline-tgap.test.ts` alone timing out at 30s+ (real audio
generation/scheduling, `harness/__tests__/call-ledger.test.ts` is separately known-broken per the B05
validator's F4 finding — hand-rolled `test()`/`process.exit()`, registers zero vitest suites). Neither
file was touched by this batch. I ran my new files individually and alongside the two other
`.browser.test.ts` files (B07, D19) that are the closest precedent/comparison, both clean. Flagging
for the validator to independently confirm the b04 hang predates this batch (e.g. `git stash` +
`timeout 30 npx vitest run harness/__tests__/b04-baseline-tgap.test.ts`).

### Scope Bounds (honored)

- ✅ No `classifyMicCapture` / R1 / recovery / banner / remedy changes — grep-confirmed only the 3
  files above touched (2 new, 1 edited).
- ✅ No B13W wiring, no live dual-browser AC15 call, no diagnostics-page rendering, no gain path.
- ✅ Sender-dead injection is `setParameters({encodings:[{...e, active:false}]})` only —
  `replaceTrack(null)`/`track.enabled=false` never used as an injection in the shipped test.
- ✅ Closes no AC beyond the discrimination clause — AC15 remains NOT VERIFIED (live clause = B08A-3).
- ✅ Zero calls burned — no room/SFU/login anywhere in the new test.
- ✅ `652c1475` / `TEST_ROOM01` untouched — no harness/room DB state touched. Throwaway probe
  script(s) used during plan formation were deleted before this proposal was written (`git status e2e/`
  confirmed clean at PROPOSED time).

### Acceptance Criteria Met

- ✅ Browser-context test proves each injection yields its own classification, neither
  `'indeterminate'` (explicit `.not.toBe('indeterminate')` assertions on both).
- ✅ Sender-dead mechanism matches the brief's binding choice exactly
  (`setParameters({encodings:[{...e, active:false}]}`).
- ✅ Capture-dead reuses banked B07 Mode B unmodified.
- ✅ Closes discrimination clause ONLY; AC15 NOT VERIFIED (live clause needs B08A-3's far-end
  transcript).

### Notes for Validator (L3 / opus) / Redteam (standard)

- Confirm `classifySenderLiveness` has no callers anywhere outside its own spec/test files (grep
  `classifySenderLiveness` should surface only `mic-energy.ts`'s definition + the two new test files).
- Confirm the cross-package import (`e2e` → `frontend/src/app/services/mic-energy.js`) is a clean
  relative import with no build-config changes required — no new `tsconfig`/`package.json` dependency
  was added to make it resolve (esbuild/vitest transpiles the plain-TS file directly).
- Confirm the empirical finding in
  `decisions/2026-07-09-b08a2-empirical-findings.md` — that literal silence does NOT freeze
  `packetsSent` on this stack (no DTX) — independently, e.g. by re-running the shipped browser test or
  an equivalent probe; this is the load-bearing premise for why `'capture-dead'` is defined as
  energy-frozen+packets-climbing rather than "both frozen."
- Confirm the `b04-baseline-tgap.test.ts` hang (noted above) is reproducible on a clean `git stash` of
  this batch's changes, i.e. genuinely pre-existing and not introduced here.
- Confirm `SENDER_PACKET_DELTA_EPSILON=1` and the choice to use `packetsSent` (not `bytesSent`) as the
  sole sender-side deciding metric is reasonable given `packetsSent` is a monotonic integer counter
  incremented once per RTP packet regardless of payload size, making it a cleaner delta signal than
  byte counts (which vary with codec bitrate/packet loss retransmission overhead).

---

## Summary

B08A-2 adds `classifySenderLiveness`, a pure four-way discriminator between capture-dead and
sender-dead outbound-audio faults, and proves both injection mechanisms against a real Chromium
loopback `RTCPeerConnection` — grounding the classifier's logic in an empirical measurement (no DTX on
this stack) rather than D29's summary-table assumption, documented separately for north-star
carry-forward. Purely additive: no R1/remedy wiring, no AC closed beyond the discrimination clause.
Ready for B08A-3 (live AC15 verification via far-end transcript) and, later, B13W (watchdog wiring).
