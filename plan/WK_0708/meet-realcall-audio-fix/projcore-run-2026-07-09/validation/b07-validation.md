# B07 Independent Validation (L3) — Mode-A/Mode-B capture injection contracts

**Validator:** independent L3 (opus). Implementer was sonnet. Verifier ≠ fixer — no code was modified.
**Commit under test:** `3b19bfa` — feat(harness): B07 Mode-A/Mode-B capture injection contracts
**Date:** 2026-07-09
**Governing rule:** `prompts/VALIDATOR-EVIDENCE-CLASS-RULE.md` (D27)

## Verdict: **PASS** — B07 scope only

B07's acceptance criteria are **mechanism-level**, and every one of them is closed by the correct
evidence class: measurement inside real Chromium against a real `getUserMedia`-delivered
`MediaStreamTrack`. **AC4 and AC5 are explicitly OPEN** and are not claimed anywhere in the code,
tests, findings, or changes report. Call budget burn is **0/25**, independently confirmed.

### Why this is not a D27 scaffold-FAIL

D27 makes a self-declared scaffold an automatic FAIL when it is offered against an AC that names a
live-recording / transcript / live-call evidence class. That rule is **not triggered here**: B07 does
not offer itself against AC4 or AC5. It closes only mechanism ACs, whose native evidence class is
real-browser measurement — and it supplies exactly that. This is a materially different posture from
B06's self-declared scaffold. I checked for the scaffold pattern specifically and did not find it.

---

## Independent verification performed

I re-ran and re-derived everything below myself rather than reading it off `b07-changes.md`.

**Tests, run by me:**

```
cd e2e && npx vitest run harness/__tests__/b07-capture-injection.test.ts \
                        harness/__tests__/b07-capture-injection.browser.test.ts
→ Test Files 2 passed (2) | Tests 11 passed (11)   (9 unit + 2 real-Chromium, 5.16s)
```

**Full harness regression, run by me:**

```
cd e2e && npx vitest run harness/__tests__
→ Test Files 1 failed | 8 passed (9) | Tests 68 passed (68)
   FAIL harness/__tests__/call-ledger.test.ts — "No test suite found in file"
```

That failure is **pre-existing and not caused by B07**. I verified byte-identity rather than taking
the claim on trust: `git diff df13135^ -- e2e/harness/__tests__/call-ledger.test.ts` returns empty.
It is a suite-collection failure (hand-rolled `test()`/`process.exit()`, registers zero vitest
suites), not a failing assertion — which is why 68/68 individual tests still pass. `b07-changes.md`'s
phrasing ("68/68 passing… the only failure is…") reads as self-contradictory but is factually
correct once suite-collection and test-assertion failures are distinguished.

**Threshold-mirror audit (the redteam-worthy drift check):** the mirror is exact, not drifted.

| Harness (`e2e/harness/capture-injection.ts`) | App (`frontend/src/app/services/mic-energy.ts`) | Match |
|---|---|---|
| `MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD = 0.01` | `MIC_SILENCE_LEVEL_THRESHOLD = 0.01` (line 29) | ✅ |
| `MIRRORED_LEVEL_VARIANCE_THRESHOLD = 0.005` | `levelVariance < 0.005` (line 188) | ✅ |
| `variance = maxLevel - minLevel` | `const levelVariance = maxLevel - minLevel` (line 187) | ✅ |

The mirror copies the *statistic* as well as the constants — both use max−min range, not true
statistical variance. Structurally identical, so the harness cannot silently drift from the app's
notion of frozen/silent.

**Evidence-class and scope audit, by direct inspection:**

- **Real Chromium, not mocks.** `chromium.launch({ args: FAKE_DEVICE_ARGS })` with
  `--use-fake-device-for-media-stream` and `--use-file-for-fake-audio-capture=<bot-140/hello.wav>`.
  Real `getUserMedia`, real `AudioContext`, real `AnalyserNode`, real RMS sampled off a real track.
- **0/25 call burn — confirmed.** `page.goto()` targets a throwaway `127.0.0.1` HTTP server serving
  a blank page. No app URL, no login, no room join, no `RTCPeerConnection`, no SFU. Only
  browser-open occurs; per D27's budget rule, browser-open *without* room-join does not burn a call.
- **AC4/AC5 never claimed.** The only occurrences of the strings `AC4`/`AC5` in B07 code are two
  comments stating the criteria remain OPEN and are owned by B13/B14. No assertion, no report line,
  no comment claims either VERIFIED, and nothing implies a transcript was produced.
- **T_gap discipline holds.** `3400` appears nowhere as a value — its single occurrence is inside the
  filename of the decision that VOIDs it. `T_GAP_PROVISIONAL_MS = 500` exists only as an overridable
  wiring default on `buildInjectionTimeline`; the browser test ignores it entirely and hardcodes
  `HOLD_DURATION_MS = 900`. **No assertion in this batch gates on either value** — every assertion
  compares measured RMS levels. Confirmed by reading all 11 assertions.
- **App source untouched.** `git show --name-only 3b19bfa` matches nothing under `frontend/` or
  `backend/`. `mic-energy.ts` and `media.service.ts` were read, not edited.

**Finding 3 (synthetic-tone fixtures) is a genuine, corroborated finding, not an unverified claim.**
`e2e/fixtures/bot-speech/README.md` states in the repo's own words that the WAVs are sine-wave tones
(440 Hz bot-140, 660 Hz bot-123) standing in until Piper TTS generates real speech. The implementer's
measured consequence — a steady-state tone's windowed RMS is as flat as a frozen hold signal, so
variance-based classification cannot tell recovered-speech from frozen-hold using these fixtures —
follows directly and is consistent with the assertions actually written (a fixture-independent
level/state *change* at the switch, rather than the stronger "no longer flat" claim the fixtures
cannot support). Choosing the weaker, true claim over the stronger, false one is the correct call.

---

## B07 acceptance criteria (per brief)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Mode A hold = frozen non-zero signature on real track | ✅ PASS | `classifyHoldPhaseSignature(hold) === 'frozen-nonzero'`, hold level > 0, measured `0.15000000596046204` RMS flat across every window in real Chromium |
| 2 | Mode B hold = silent on real track | ✅ PASS | `classifyHoldPhaseSignature(hold) === 'silent'`, `max(hold) < 0.01` measured |
| 3 | Post-switch measurable speech-level change | ✅ PASS | Mode A: relative level change > 0.2 (0.15 → ~0.212, ≈41%). Mode B: post-switch level crosses back above the 0.01 silence threshold |
| 4 | Real Chromium proof without claiming AC4/AC5 VERIFIED | ✅ PASS | Real `chromium.launch` + fake-audio-capture device; AC4/AC5 stated OPEN in code, tests, findings, and changes report |

**AC4 (Mode A frozen-nonzero recovery) — OPEN.** Requires a real 2-party room call plus far-end
recording and transcript. Owned by B13. Not closed by B07.
**AC5 (Mode B dead-mic recovery) — OPEN.** Same evidence requirement. Owned by B14. Not closed by B07.

---

## Findings raised by this validation

These do not block the PASS. They are material to the batches that consume B07 and should travel
with the contract.

**1. The Mode A DC-survival result may not survive a real `RTCPeerConnection` — and if it doesn't,
Mode A's design breaks, not just its measurement.**
The implementer flagged this honestly as an unmeasured caveat, and the reasoning for *why* DC survived
is sound: the synthetic `destination.stream` track is built fresh in the Web Audio graph and never
passes back through Chrome's `AudioProcessingModule`, which attaches to gUM-captured tracks at
acquisition. But once that synthetic track is handed to `addTrack()`, the sender-side pipeline gets
another chance to high-pass it. If it does, a true-DC `ConstantSourceNode` collapses toward zero and
**Mode A degenerates into Mode B at the far end** — the two modes stop being distinguishable, which
is the entire point of having both. B13 should measure this first, before building on the contract,
and be prepared to swap the DC source for a low-frequency AC signal (a sub-audible tone with flat
windowed RMS) that produces the frozen-nonzero *statistic* without relying on DC passing an HPF.

**2. Semantic divergence between harness and app classification — intentional, but B13/B14 must not
be surprised by it.** The thresholds are identical, but the *verdicts* differ by design: given a flat
window above the silence threshold, the app's `classifyMicCapture` returns `'silent'` (that is
`856104f`'s whole fix — flat non-zero means the stat is stuck, so treat it as dead), while the
harness's `classifyHoldPhaseSignature` returns `'frozen-nonzero'` (it must separate Mode A from Mode
B to know which signature it injected). Both are correct for their purpose. The hazard is a B13/B14
assertion expecting the *app* to report `'frozen-nonzero'` — it never will. It reports `'silent'`.

**3. The real captured audio track is acquired and then leaked.** Both init scripts call the original
`getUserMedia`, take `realStream.getVideoTracks()`, and return the synthetic audio track — but never
`stop()` the real audio track, and never reference it again. The test's cleanup
(`stream.getTracks().forEach(t => t.stop())`) stops only the tracks on the *returned* stream, so the
real microphone track stays live for the page's lifetime. Harmless in a 2-second mechanism test;
worth fixing before a long-lived live call, where a held-open capture device can interact with
device-change and permission flows. Non-blocking for B07.

**4. Observation, outside B07's scope, for the coordinator.** The full harness suite still executes
`b04-baseline-tgap.test.ts`, which prints `Derived T_gap: 3430ms` derived from synthetic scheduler
gaps — the exact evidence class D27 VOIDs. B07 correctly refuses to cite it. But the number is still
being produced on every suite run and is one copy-paste away from being re-cited as measured. The
pending B04 re-derivation should retire or quarantine that output.

---

## Summary

B07 built the Mode A / Mode B capture-injection contract and proved the mechanism by measurement in
real Chromium — not by mocks, not by scaffold, and not by asserting what it could not observe. The
threshold mirror against `mic-energy.ts` is exact. The call ledger is untouched at 0/25. AC4 and AC5
are stated OPEN in four separate places and claimed in none. Where the fixtures could not support the
stronger claim, the implementer wrote the weaker true one and documented why — including surfacing
that the bot-speech fixtures contain no phonetic content and therefore block AC4/AC5's transcript
evidence until real speech exists, which is the most valuable thing this batch produced.

**STATUS: PASS (B07 scope only). AC4 OPEN → B13. AC5 OPEN → B14.**
