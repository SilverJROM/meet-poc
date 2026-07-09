---
title: "B08A-2 Independent Validation"
date: 2026-07-09
validator: independent (L3 opus) — verifier ≠ fixer ≠ implementer
commit: 51d0d18
scope: classifySenderLiveness 4-state discriminator + dual injection proof (AC15b)
evidence_class: offline (unit + real-Chromium browser mechanism proof), 0/25 call burn
verdict: PASS
---

# B08A-2 — VERDICT: **PASS**

AC15 remains **NOT VERIFIED** and correctly so. B08A-2 closes the **discrimination clause only**;
the live clause (far-end transcript) is B08A-3. Every artifact says so — no overclaim found.

---

## What I did (independent execution, not log-reading)

I re-ran every claim rather than accepting the implementer's transcript, and added two probes the
implementer did not run: a **mutation test** (do the tests have teeth?) and a **timing-margin
measurement** (is the browser evidence reliable, or luck?).

| # | Check | Method | Result |
|---|---|---|---|
| V1 | Unit spec passes | `npx tsx src/app/services/sender-liveness.spec.ts` | ✅ 9/9, exit 0 |
| V2 | Browser proof passes | `npx vitest run …b08a2-sender-liveness.browser.test.ts` | ✅ 2/2, exit 0 |
| V3 | **Not flaky** | 4 consecutive independent runs | ✅ 4/4 clean, 0 flakes |
| V4 | **Tests have teeth** (mutation) | swapped `sender-dead`↔`capture-dead` branches in `mic-energy.ts` | ✅ **both browser tests + unit spec FAIL** |
| V5 | Raw counters match the empirical claim | validator-authored margin probe, printed real `getStats()` series | ✅ energy `0,0,0` frozen; packets `0→10→20` climbing |
| V6 | `setParameters` is the ONLY sender-dead injection | grep for banned mechanisms in the browser test | ✅ zero `replaceTrack` / `enabled=false` |
| V7 | No R1 / `classifyMicCapture` wiring | grep callers; diff inspection | ✅ zero callers; `classifyMicCapture` byte-identical |
| V8 | No regression in sibling browser tests | ran b08a2 + b07 + gum-shim together | ✅ 5/5 pass |
| V9 | Implementer's disclosed suite timeout | reproduced `b04-baseline-tgap.test.ts` alone, 90s cap | ✅ hangs (rc=124) on a file **this commit never touched** — disclosure accurate |
| V10 | Tree left clean | `git status --porcelain frontend/ e2e/` after all probes reverted/deleted | ✅ empty |

### V4 — the mutation test is the load-bearing check

The browser test imports the **real** `classifySenderLiveness` cross-package rather than hand-mirroring
it, which raises the obvious question: is it asserting a function against itself? No. I inverted the two
single-sided branches in the product source and re-ran:

```
× sender-dead:  expected 'capture-dead' to be 'sender-dead'
× capture-dead: expected 'sender-dead' to be 'capture-dead'
```

Both failed, **in the exact opposite direction**. That is a stronger result than a plain failure: it
proves the two injections produce *genuinely distinct raw signatures* in real Chromium —
`setParameters({active:false})` → capture advancing / sender frozen, and Mode B literal silence →
capture frozen / sender advancing. The discriminator is being driven by real WebRTC counters, not by
test-side bookkeeping. Mutation reverted; `git status` clean.

### V5 — the brief's specific check, confirmed on raw stats

The brief asked me to confirm *capture-dead is energy-frozen while packets may climb*. Measured
directly off `pc1.getStats()` inside the hold phase:

```
energy= 0  packets= 0
energy= 0  packets= 10
energy= 0  packets= 20      → classification: capture-dead
```

This independently corroborates the batch's **no-DTX** finding
(`decisions/2026-07-09-b08a2-empirical-findings.md`) and confirms D29's summary table — which said
capture-dead is "frozen wholesale" — is wrong at the raw-stats level, while D29's *mechanism* (R1 is
blind to sender-death) is untouched and still correct. The classifier is built off the measurement,
not off the prose. Correctly so.

### Evidence-class gate (D27)

No violation. AC15 names a live-call/transcript evidence class **for its live clause**, and that clause
is explicitly deferred to B08A-3. What B08A-2 claims — that the harness can *tell the two failures
apart* — is a mechanism claim, and a real-Chromium `RTCPeerConnection` injection proof is the correct
and sufficient class for it. This is **not** a self-declared scaffold: nothing is asserted as VERIFIED
on offline evidence. `req-matrix.md` still reads `[PENDING] AC15`. Zero calls burned; `TEST_ROOM01`
untouched.

---

## Findings (all NON-BLOCKING — none gate the PASS)

**F1 — capture-dead hold-window margin is ~250ms (MEDIUM-LOW).** Confirms and quantifies redteam
Finding #1. Measured: loopback setup (gUM → ICE connected) completes in **37ms** (ICE at 32ms), and the
500ms sampling window ends **~653ms into the 900ms hold**. So there is ~250ms of headroom — the test
would need setup to slow by ~250ms+ (loaded CI) before the window crosses into the speech phase. It
then fails **explicitly** (reads `both-advancing`), never silently green. Not a correctness defect, but
`HOLD_DURATION_MS` 900 → ~1400, or anchoring sampling to the hold clock, would make this robust. Worth
a queue item before B13W leans on this harness.

**F2 — the browser test leaks the first test's Chromium + HTTP server (LOW).** Both `it()` blocks
reassign the module-level `browser`/`server`; `afterAll` closes only the last pair. Test 1's browser and
server are never closed. Harmless today (process exit reaps them), but it is a real leak if the file
grows more cases.

**F3 — `expect(x).not.toBe('indeterminate')` is tautological (LOW/nit).** It always follows a passing
`expect(x).toBe('sender-dead' | 'capture-dead')`, so it can never fail independently. Zero added signal.
Harmless.

**F4 — the no-DTX assumption is unguarded (MEDIUM, latent, carry to B13W).** Endorsing redteam #5. If
DTX/comfort-noise is ever enabled on this path, capture-dead silently becomes energy-frozen +
packets-frozen → the classifier returns `'indeterminate'`, not `'capture-dead'`. That is the *safe*
direction (no false single-sided claim), but a watchdog built on it would go quiet rather than alarm.
B13W only needs sender-dead, so it is unaffected today — flagging for whoever builds capture-dead
detection.

**F5 — `sender-liveness.spec.ts` is not executed by any automated runner (INFORMATIONAL).** It runs only
via `npx tsx`. I checked: this is the **repo-wide convention** — all 10 `src/app/services/*.spec.ts`
files are `node:assert` + tsx, and `frontend` `npm test` is `ng test` (Karma), which nothing here uses.
So this is **not** a B08A-2 regression and the isolation decision (not appending to the
pre-existing-red `mic-capture-health.spec.ts`) was right. But it means these unit assertions are
green-by-manual-invocation only. Separately, B08A-1's validator finding — `mic-capture-health.spec.ts`
red since `856104f`, aborting before B08A-1's extractor tests ever run — **still appears untracked
outside its own artifacts**. Recommend the coordinator raise the micro-fix issue.

**F6 — latent thin-window edge (INFORMATIONAL).** At t=0 the probe read `packets=0, energy=0`. Had the
sampling window begun before RTP started flowing, both metrics would read flat → `'indeterminate'` →
explicit test failure. Explicit, not silent. Acceptable.

*(Redteam #2 — epsilon=1 lacks measured grounding — stands. My probe measures ~10 packets/200ms
interval on loopback, so epsilon=1 is ~10× conservative. Recording the number here so the design choice
is now empirically grounded rather than asserted.)*

---

## Scope discipline

Implementation is exactly the approved scope: one pure exported function + one exported constant in
`mic-energy.ts`, one isolated unit spec, one browser mechanism proof. No remedy, no watchdog, no R1
hookup, no diagnostics-page rendering, no gain path. `classifyMicCapture` is untouched — verified in the
diff, not merely asserted. Three files, +357/-2.

**Verifier ≠ fixer: I implemented nothing.** The mutation in V4 was a probe, reverted immediately; the
V5 margin probe was deleted after use. `git status` on `frontend/` and `e2e/` is empty. F1–F6 are
handed to the coordinator, not fixed by me.

## Verdict

**PASS.** The discriminator is correct, its four-way mapping is grounded in a real measurement that
corrected a wrong assumption in D29's summary table, both injections are proven independently against
real Chromium with the mandated `setParameters` mechanism, the tests are mutation-proven to have teeth,
and AC15 is honestly left NOT VERIFIED pending B08A-3's far-end transcript.

**Cleared for B08A-3.** Recommend F1 (hold-window margin) be queued before further work depends on this
harness, and that F5's `mic-capture-health.spec.ts` breakage finally get a tracking item.
