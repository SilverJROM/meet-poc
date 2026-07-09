# Batch B07 — Mode-A/Mode-B capture injection contracts

## Proposed Implementation

**STATUS: PROPOSED**

---

## Objective

Build reusable harness **injection contracts** that can, on a real captured audio track, (1) reproduce
**Mode A** — a constant-amplitude, near-zero-variance "frozen non-zero" signal, the exact blind spot from
real session `652c1475` (client `8dd16229`, `outboundAudioLevel` frozen at `0.228949858088931`,
`micSilent=0`), (2) reproduce **Mode B** — a literal zero-level silent track (`micSilent=1`, the
`3baf851b`/`7b975db0` pattern), and (3) **switch, on a harness-controlled timer, to known-word speech** so
that whatever consumes the resulting call has a transcript to prove recovery against. B07 builds and proves
the **mechanism**; it does **not** run the live 2-party call that closes AC4/AC5 — that evidence belongs to
**B13** (Mode A) and **B14** (Mode B), which both `deps=B07`.

---

## Binding correction in force (D27 — read before dispatch)

`decisions/2026-07-09-north-voids-tgap-3400.md` and `prompts/VALIDATOR-EVIDENCE-CLASS-RULE.md` apply to this
batch:

- **`T_gap=3400ms` is VOID.** B07 must not use it for anything. If a timing constant is needed for the
  injection timeline (e.g. how long Mode A/B holds before switching to speech), use
  **`T_gap_provisional=500ms`**, mark every reference to it **PROVISIONAL**, and never cite it as if it
  gates a verdict.
- **An AC that names an evidence class (live recording, transcript, live call) cannot be closed by any
  other evidence class.** B07's own acceptance below only claims what a **real-Chromium, real
  `--use-file-for-fake-audio-capture` mechanism proof** can support (signal-level evidence: the injected
  track's measured waveform, not a transcript). It explicitly does **not** claim AC4 or AC5 are VERIFIED —
  those stay OPEN for B13/B14, which must run an actual 2-party room call.
- **Call budget:** only a real browser that opens and joins a real room burns a call. B07's mechanism-proof
  test (see Approach §2) launches Chromium against a **blank local HTTP page**, the same evidence class D19
  (`gum-shim.browser.test.ts`) and B05 already used and that passed validator without objection — **it does
  not join a room, so it burns 0/25.** If deliberation or redteam decide a real room join is needed to prove
  something a blank page cannot, that must be called out explicitly as a scope change, not folded in
  silently.
- **B06 precedent:** B06 was sent back for claiming a scaffold closed a live-recording AC, then accepted
  once it honestly scoped a live SSH proof and left the full dual-call recording OPEN. B07 must apply the
  same discipline: prove what real Chromium can prove, and leave everything that needs a live room + far-end
  transcript explicitly OPEN for B13/B14.

---

## Grounding (read against current code)

- **`classifyMicCapture` (`frontend/src/app/services/mic-energy.ts:161-197`) already has the `856104f`
  frozen-level fix**: flat `totalAudioEnergy` + level variance `< 0.005` across the window → `'silent'`.
  This is the detector AC4(a) checks. B07 does not touch this file — it only needs to produce a REAL track
  whose live-measured audioLevel/energy actually exhibits that signature, so B13 can drive it end-to-end
  against this existing logic.
- **`runMicSweep` / `decideMicRecovery` / `nextSweepGate` (same file)** are the R1 self-heal path AC4(b)
  and AC5 gate on. B07 does not modify these; B13/B14 validate-then-fix them only if live recovery fails.
- **D19 precedent (`e2e/harness/gum-shim.ts` + `gum-shim.browser.test.ts`)** is the template for "inject
  downstream of the real, already-processed `getUserMedia()` track via a `GainNode`/`AudioContext` graph,
  swap `navigator.mediaDevices.getUserMedia`, keep the page unaware." B07 reuses this exact wiring
  approach, swapping the downstream node graph (`ConstantSourceNode` / silence / `AudioBufferSourceNode`
  speech playback) instead of a plain `GainNode`.
- **`RecordingArbiter`/`StimulusVerification` (`e2e/harness/recording-arbiter.ts`)** gives the
  `intendedGain`/`measuredGain`/`withinTolerance` contract shape B02 established. B07's contract for Mode
  A/B is structurally the same idea (intended signature vs. measured signature) but the "signature" is a
  waveform class (frozen/silent/speech), not a gain ratio — B07 defines a parallel, purpose-built type
  rather than overloading `StimulusVerification`.
- **Known-word fixtures already exist**: `e2e/fixtures/bot-speech/bot-140/{hello,thanks,goodbye}.wav` and
  `bot-123/{hello,im-fine,great}.wav` (with `manifest.json` — check whether it records the literal
  transcript words; if not, B07 adds the expected-words list next to the fixture reference it uses, not by
  editing the WAV/manifest). These are exactly the "known speech" the post-recovery phase needs — B13/B14
  will run these through the app and check the far-end transcript for these words.
- **`RecordingArbiter.extractTranscript()` (`recording-arbiter.ts:288-293`) is a placeholder returning
  `undefined`.** B07 does not wire real transcription — the app already has a working pipeline
  (`backend/src/modules/recording/index.ts` → `transcribeViaOpenRouter`, triggered via
  `POST /api/recordings/:filename/transcribe` or `/session/:sessionId/transcribe`, **not automatic**). Wiring
  the harness to call that endpoint and assert on returned words is B13/B14's job, once they have a real
  room + real recording to transcribe. Flagging it here as grounding, not scope, so B13/B14 don't have to
  re-discover it.

---

## Approach

### 1. Injection contract module (`e2e/harness/capture-injection.ts`)

Pure, framework-free pieces (node/tsx-testable, no DOM) plus one page-context init script per mode,
mirroring D19's split:

- **Types:**
  - `CaptureMode = 'mode-a-frozen' | 'mode-b-silent'`
  - `CaptureInjectionTimeline = { mode: CaptureMode; holdDurationMs: number; speechFixtureUrl: string }`
    — `holdDurationMs` defaults from `T_gap_provisional` (PROVISIONAL — see correction above), overridable
    per test.
  - `CaptureInjectionResult` (mirrors `StimulusVerification`'s shape): `{ mode: CaptureMode; holdPhase: {
    measuredVariance: number; measuredLevel: number; matchesExpectedSignature: boolean }; speechPhase: {
    detected: boolean } }` — the mechanism-proof test populates this from live measurement; it is NOT a
    transcript check (that requires a live call, out of scope here).
  - Pure builder: `buildInjectionTimeline(mode, holdDurationMs, speechFixtureUrl):
    CaptureInjectionTimeline` and a pure classifier `classifyHoldPhaseSignature(samples: Float32Array):
    'frozen-nonzero' | 'silent' | 'neither'` reusing the SAME variance-window logic
    `classifyMicCapture` uses (`< 0.005` level variance, flat-energy) so the harness's notion of "frozen"
    and the app's notion of "frozen" cannot silently drift apart. Do not duplicate the threshold constant —
    import `MIC_SILENCE_LEVEL_THRESHOLD` from `mic-energy.ts` if the harness can depend on the frontend
    package; otherwise mirror the exact literal value with a comment pointing at the source of truth, and
    log this coupling as a finding.
  - `modeAInitScript(frozenLevel: number, holdDurationMs: number, speechWavUrl: string): void` — Playwright
    `addInitScript`-injectable, self-contained (no closures over outside state, per D19's constraint).
    Wraps `getUserMedia` exactly like D19: lets the real device capture happen, then for `holdDurationMs`
    routes a **`ConstantSourceNode(offset = frozenLevel)`** (true DC, zero AC variance) to the output
    instead of the mic; after `holdDurationMs`, disconnects it and connects an `AudioBufferSourceNode`
    decoding `speechWavUrl` (fetched via `fetch()` + `decodeAudioData()`) to the same destination. Real mic
    audio is never used in Mode A — this is a fully synthetic reproduction of the frozen-stat bug, not an
    attenuation of a real voice.
  - `modeBInitScript(holdDurationMs: number, speechWavUrl: string): void` — identical shape, but the hold
    phase is a `ConstantSourceNode(offset = 0)` (literal silence) instead of a non-zero constant.

- **Open technical question the impl/redteam must resolve and log, not silently assume:** WebRTC's audio
  processing chain commonly high-pass-filters near-DC content before encoding. A true `ConstantSourceNode`
  DC offset **may** be filtered down to near-silence by the time it reaches `getStats()`'s
  `audioLevel`/`totalAudioEnergy`, which would make Mode A indistinguishable from Mode B at the wire. The
  mechanism-proof test (§2) must **measure** this on real Chromium, not assume it — if DC is filtered out,
  the fallback is a signal that varies too slowly/subtly to trip `classifyMicCapture`'s variance check but
  still survives the pipeline (e.g. a very-low-amplitude, very-low-frequency tone tuned so windowed variance
  stays under `0.005`). Log whichever design is chosen and why in `decisions/b07-findings.md`.

### 2. Mechanism-proof test (`e2e/harness/__tests__/b07-capture-injection.test.ts`)

Same evidence class as `gum-shim.browser.test.ts` (real Chromium, `--use-fake-device-for-media-stream` +
`--use-file-for-fake-audio-capture`, blank local HTTP page — **no room join, 0/25 burn**):

- For each mode (A, B): launch a page with the mode's init script, sample the resulting track's RMS/energy
  over the hold phase using the same `AnalyserNode`-sampling approach `captureRms` uses in
  `gum-shim.browser.test.ts`, and assert the hold-phase samples classify as the intended signature via
  `classifyHoldPhaseSignature`.
- Then let the timeline advance past `holdDurationMs` and re-sample: assert the post-switch samples no
  longer classify as frozen/silent (i.e., real measurable variance/energy appears — the "known speech
  arrived" proxy, at the signal level only, not a transcript).
- Explicitly assert what this test does **not** prove: no `RTCPeerConnection`, no SFU, no far-end
  `getStats()`, no transcript. State this in a comment at the top of the file, matching the disclosure style
  `gum-shim.browser.test.ts` already uses for D19.

### 3. Findings and handoff to B13/B14

- `decisions/b07-findings.md`: document the DC-vs-alternative-signal decision (§1's open question) with the
  live measurement that decided it, the exact contract shape (`CaptureInjectionTimeline` /
  `CaptureInjectionResult`), and an explicit **OPEN** section listing what B13/B14 still owe: a real 2-party
  room join, the real recording + `POST .../transcribe` call, and asserting the known fixture words appear
  post-recovery. Do not let this read as if B07 already produced that evidence.
- No changes to `queue-batches.md`/`req-matrix.md` beyond what already reflects B13/B14 `deps=B07` — B07
  does not need to re-sequence anything.

---

## Scope Bounds

- **No app changes.** `mic-energy.ts`, `media.service.ts` stay read-only (aside from possibly importing
  `MIC_SILENCE_LEVEL_THRESHOLD` for the harness's classifier, if that's how the coupling is resolved).
- **No live room join, no SFU, no real call.** That evidence class belongs to B13/B14 (Mode A/B recovery
  gates) and the re-opened B04 (real `T_gap`). B07 stays at the same evidence tier as D19/B05.
- **No transcript wiring.** `RecordingArbiter.extractTranscript()` remains a placeholder; B07 only notes
  where the real endpoint lives for B13/B14.
- **No AC4/AC5 verdict.** B07 cannot mark either VERIFIED — say so explicitly in the validation report per
  the evidence-class rule.
- **`T_gap_provisional=500ms` is a wiring default only**, overridable per test call; never presented as a
  measured or gating value.

---

## Artifacts

- `e2e/harness/capture-injection.ts` — `CaptureMode`, `CaptureInjectionTimeline`, `CaptureInjectionResult`
  types; `buildInjectionTimeline`, `classifyHoldPhaseSignature` (pure); `modeAInitScript`,
  `modeBInitScript` (page-context).
- `e2e/harness/__tests__/b07-capture-injection.test.ts` — real-Chromium mechanism proof for both modes
  (hold-phase signature + post-switch signal change), 0/25 call burn.
- `decisions/b07-findings.md` — DC-vs-alternative decision + live measurement, contract shape, explicit OPEN
  handoff list for B13/B14.
- `validation/b07-changes.md` — standard validation report, explicit about the evidence tier claimed.

---

## Acceptance Criteria (from brief)

- ✅ Harness can create a **Mode A** signature (frozen, non-zero, near-zero variance) on a real captured
  track in real Chromium, measured — not asserted.
- ✅ Harness can create a **Mode B** signature (literal zero-level silence) on a real captured track in real
  Chromium, measured.
- ✅ Harness can then **switch to known speech** on a harness-controlled timer, and the post-switch signal
  is measurably different from the hold-phase signature.
- ✅ `decisions/b07-findings.md` states plainly that far-end-transcript recovery proof (AC4/AC5) is **OPEN**,
  owned by B13/B14, not closed here.
- ❌ Not in scope: any claim that AC4 or AC5 is VERIFIED.

---

## Notes for Validator (L3) / Redteam (standard)

- Reject any version of this batch that runs the mechanism-proof test **without launching real Chromium**
  (i.e., pure JS mocks standing in for the real audio pipeline) — that would repeat B06's original mistake
  one evidence tier lower.
- Reject any claim, anywhere in the validation report or findings, that AC4/AC5 are VERIFIED or that a
  transcript was produced — B07 has no transcript evidence and must not imply it does.
- Confirm `holdDurationMs`/any `T_gap_provisional` reference is explicitly labeled PROVISIONAL and is not
  used to gate a PASS/FAIL verdict anywhere in this batch's own test assertions.
- Confirm the call budget line in the validation report reads **0/25 burned** (no `browser.newContext()` +
  actual room URL / login flow anywhere in this batch's test).
- Confirm `classifyHoldPhaseSignature`'s threshold either imports `MIC_SILENCE_LEVEL_THRESHOLD` /
  the `0.005` variance constant from `mic-energy.ts`, or mirrors it with an explicit comment — a
  silently-drifted duplicate constant is a redteam-worthy finding.
- Confirm the open DC-filtering question (§1) was actually measured on real Chromium and the outcome is
  logged, not assumed away.

---

## Effort Estimate

~25 min (per `queue-batches.md` B07 estimate). L3 impl (sonnet) / L3 validator (opus) / standard redteam,
per `decisions/2026-07-09-b07-deliberation.md`.

---

## Handshake

Awaiting **APPROVED-PLAN** before implementation begins.
