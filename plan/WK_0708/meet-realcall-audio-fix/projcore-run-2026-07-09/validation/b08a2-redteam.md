---
title: "B08A-2 Redteam Validation (Read-Only)"
date: 2026-07-09
commit: 51d0d18
scope: classifySenderLiveness, dual injection (setParameters only for sender-dead), browser test
effort: redteam (no fixes)
---

# B08A-2 Redteam — classifySenderLiveness discriminator

## CLEAN

### Discriminator Logic (mic-energy.ts:287–310)

✅ **Four-way classification is correct.** The matrix maps two independent booleans (`captureAdvancing` × `senderAdvancing`) to the four cases:
- `both-advancing`: energy rises AND packets rise ⇒ normal mic
- `sender-dead`: energy rises BUT packets frozen ⇒ encoder disabled (verified injection)
- `capture-dead`: energy frozen BUT packets rise ⇒ silent mic (verified injection)
- `indeterminate`: both frozen OR insufficient samples ⇒ ambiguous fault

Logic is exhaustive, mutually exclusive, and conservative (never claims a single-cause on a thin window).

✅ **Null-filtering and window validation.** Requires ≥2 usable readings per metric; returns `'indeterminate'` if either metric has <2 samples. This is safe and matches `classifyMicCapture` precedent.

✅ **Epsilon boundary semantics correct.** Uses `>=` for both metrics (exactly-at-epsilon counts as advancing). Unit test U-8 confirms this explicit behavior.

### Unit Tests (sender-liveness.spec.ts)

✅ **All four classifications covered** (U-1 through U-4):
- U-1: both-advancing (energy + packets both rise)
- U-2: sender-dead (energy rises, packets flat)
- U-3: capture-dead (energy flat, packets rise)
- U-4: indeterminate (both flat)

✅ **Edge cases handled correctly:**
- U-5: Insufficient samples (single sample, empty window, all-null energy, all-null packets) → all return `'indeterminate'`
- U-6: Mixed null-then-numeric windows correctly filter nulls and resolve from usable readings
- U-7: Sub-epsilon energy delta (noise) correctly treated as flat
- U-8: Exactly-at-epsilon packet delta counts as advancing (boundary confirmed)
- U-9: Custom epsilon options honored

✅ **Standalone test file.** Correctly avoids appending to the pre-existing broken `mic-capture-health.spec.ts` (pre-existing stale assertion flagged since `856104f`, unrelated to this batch). This is good isolation practice.

### Browser Mechanism Proof (b08a2-sender-liveness.browser.test.ts)

✅ **Real Chromium loopback (no room/SFU/login).** Both tests establish a real `RTCPeerConnection` pair on 127.0.0.1, exchange SDP offers/answers locally, and capture real `getStats()` entries. This tier matches D19's gum-shim and B07's capture-injection precedent.

✅ **Sender-dead injection via setParameters.** Test sets `{encodings:[{...e, active:false}]})` and verifies the expected signature: energy continues rising while `packetsSent` freezes. Empirical findings (D29 measurement) corroborate that this is the cleanest injection mechanism (rules out `track.enabled=false` and `replaceTrack(null)` which confound with capture-dead).

✅ **Capture-dead injection via B07 Mode B.** Uses literal silence (`ConstantSourceNode` offset 0) for `HOLD_DURATION_MS` (900ms), then switches to speech fixture. Empirical findings confirm: energy stays frozen while `packetsSent` keeps climbing (no DTX on this stack). Test verifies both during-hold (capture-dead) and post-switch (both-advancing) phases.

✅ **Cross-package import of real functions.** Browser test imports `extractOutboundLiveness` (B08A-1) and `classifySenderLiveness` (this batch) directly from `frontend/src/app/services/mic-energy.ts` instead of hand-mirroring. This is strictly stronger evidence for brand-new-this-batch logic (no assertion of a reimplementation against itself).

✅ **Sampling window sizes adequate.** Baseline (700ms) and post-injection (1500ms) windows sampled at 200ms intervals give 3–7 usable samples per metric. The discriminator only needs 2 per metric, so there's buffer.

✅ **Assertions explicit and distinct.** Each test asserts the expected class AND that it is NOT `'indeterminate'`. This prevents silent false negatives (e.g., a test returning indeterminate when it should be sender-dead, masked by a different test passing later).

---

## FINDINGS

### 1. Timing Sensitivity: Capture-Dead Test ICE Ramp-Up

**Issue:** The capture-dead test samples for `Math.max(300, HOLD_DURATION_MS - 400)` = 500ms immediately after `setupLoopbackAndSample()` returns. The return happens after ICE connects (with a 4s timeout fallback), but the actual connect time on localhost varies (typically 100–300ms, could exceed 400ms under load). If ICE connection takes >450ms, the 500ms sampling window crosses into the post-switch phase (~50–100ms into speech playback), risking a `both-advancing` classification instead of `capture-dead`. Test would fail explicitly (not silently), but the failure would be a timing artifact, not a logic bug.

**Severity:** MEDIUM — test is fragile but failures are explicit.

**Recommendation:** Add an explicit timing assertion or extend the hold-phase buffer. E.g., document an invariant that `setupLoopbackAndSample()` must complete within 400ms, or extend `HOLD_DURATION_MS` to 1200ms to provide a larger safety margin.

---

### 2. SENDER_PACKET_DELTA_EPSILON = 1: Permissive Boundary

**Issue:** An epsilon of 1 packet treats any single packet increase as "advancing." The empirical findings state "RTP keeps flowing at a steady packetization cadence," but the test does not measure the actual packet rate per sampling interval (200ms). If the actual rate is very low (e.g., due to high packet loss, network jitter, or RTP padding dynamics in edge conditions), a single packet might represent RTP keepalive or padding rather than real media flow. The epsilon choice is a **design decision** (be very sensitive), but it lacks a measured justification for why 1 is the right threshold vs. alternatives (e.g., 5 packets/200ms interval).

**Severity:** LOW — design is intentional per commit message ("any real increase counts as advancing"), but lacks empirical grounding.

**Recommendation:** Measure actual packet rates in the loopback test and document the design choice with measured packet/interval ratio (e.g., "Loopback produces ~50 packets/200ms, epsilon 1 is 50× conservative").

---

### 3. Test Coverage Gap: Sub-Epsilon Packet Delta + Rising Energy

**Issue:** Unit tests cover sender-dead via rising energy + frozen packets (U-2), but do NOT explicitly test the boundary case of rising energy + sub-epsilon packet delta (which should also classify as `sender-dead`). The logic handles this correctly (line 307: `if (captureAdvancing && !senderAdvancing) return 'sender-dead'`), but there is no direct test case validating it.

**Severity:** LOW — logic is correct, but test coverage could be more thorough.

**Recommendation:** Add a unit test:
```typescript
// U-10 — sender-dead with sub-epsilon packet delta
const subEpsilonPackets = SENDER_PACKET_DELTA_EPSILON / 2;
const window = [sample(1.0, 10), sample(2.0, 10 + subEpsilonPackets)];
assert.strictEqual(classifySenderLiveness(window), 'sender-dead', 'sub-epsilon packet delta + rising energy');
```

---

### 4. Fragile Browser Test Import Path

**Issue:** The browser test imports from `../../../frontend/src/app/services/mic-energy.js` using a relative path. If the directory structure changes (e.g., `e2e/harness/` is renamed or moved), the import breaks silently (relative path points to wrong file) until runtime. This is a structural brittleness, not a functional bug.

**Severity:** LOW — acceptable for a mechanism-proof test; not a production concern.

**Recommendation:** Document the directory structure assumption in a comment, or consider a path alias in `vitest.config.ts` for cross-package imports.

---

### 5. No DTX Safeguard: Assumption Baked into Discriminator

**Issue:** The entire discriminator is built on the empirical finding that this stack has **no DTX** (Discontinuous Transmission) on outbound mic audio. Consequently, `capture-dead` is detected as energy-frozen + packets-still-climbing. If DTX is enabled in a future Android SDK update or codec configuration change, the stack would produce energy-frozen + packets-frozen-too, which the discriminator classifies as `'indeterminate'` instead of `capture-dead`. There is no safeguard or assertion that DTX remains disabled.

**Severity:** MEDIUM — latent risk for future platform changes.

**Recommendation:** Add a comment to the discriminator noting the DTX assumption. Consider a future telemetry/diagnostic flag (B13W or later) to detect if DTX is unexpectedly active.

---

### 6. Offline-Only Validation (Acknowledged Scope Limitation)

**Issue:** The browser test validates the **discriminator mechanism** offline (loopback RTCPeerConnection, no room join, 0/25 call burn). It does NOT validate:
- Behavior when integrated into the real call flow
- Interaction with the frontend UI watchdog (B13W)
- Far-end transcript verification (AC15's live clause, deferred to B08A-3)

This is explicitly scoped in the commit message ("Closes AC15's discrimination clause only — AC15 stays NOT VERIFIED"), so it is **not a bug**, but it is worth flagging as a known gap for future validation work.

**Severity:** INFORMATIONAL — acknowledged scope boundary, not a defect.

**Recommendation:** Document in B08A-3 plan that live-call validation with far-end transcript is the next gate.

---

### 7. Pre-Existing Broken Test (mic-capture-health.spec.ts)

**Issue:** The commit message documents that `mic-capture-health.spec.ts` has a pre-existing stale assertion (flagged since `856104f`) that causes the file to abort partway through execution. This batch intentionally creates a new `sender-liveness.spec.ts` to avoid the broken file, but the underlying debt is unfixed. If a future developer appends to `mic-capture-health.spec.ts`, they will be surprised that their additions never execute.

**Severity:** LOW — documented, and this batch correctly isolates itself. But technical debt remains.

**Recommendation:** Open a separate issue to fix or remove the stale assertion in `mic-capture-health.spec.ts` (out of scope for B08A-2).

---

## Summary

**Verdict:** CLEAR

The discriminator logic is sound, both unit and browser tests are well-structured, and the dual injection proof (sender-dead via setParameters, capture-dead via B07 Mode B) aligns with empirical findings. No logic bugs found.

**Findings**: 7 items identified — 2 MEDIUM (timing sensitivity, DTX assumption), 3 LOW (epsilon justification, test coverage gap, fragile import), 1 INFORMATIONAL (offline-only scope), 1 technical debt (stale assertion). None block acceptance; all are improvement recommendations for robustness or future work.

**Acceptance recommendation:** APPROVED. B08A-2 closes AC15's discrimination clause and is ready for integration into the watchdog (B13W). Redteam findings should be logged as backlog items for future hardening.

---

## Callback

**STATUS: DONE**

Redteam B08A-2 complete. No fixes applied (read-only). Findings logged above. Implementation ready for B08A-3 (live-call validation with far-end transcript).
