# B07 — Findings: Mode-A/Mode-B capture injection contracts

**Date:** 2026-07-09
**Status:** MECHANISM PROVEN (real Chromium, measured). AC4/AC5 far-end transcript proof remains OPEN — owned by B13/B14, per D27 evidence-class rule.

---

## What was built

`e2e/harness/capture-injection.ts`:

- `CaptureMode`, `CaptureInjectionTimeline`, `buildInjectionTimeline` — pure contract shape.
- `classifyHoldPhaseSignature(levels, opts?)` — pure classifier over a WINDOW of per-tick RMS
  readings (the same shape `classifyMicCapture` consumes), mirroring
  `frontend/src/app/services/mic-energy.ts`'s exact thresholds (`MIC_SILENCE_LEVEL_THRESHOLD =
  0.01`, `856104f`'s `levelVariance < 0.005`) so the harness's notion of frozen/silent cannot
  silently drift from the app's.
- `modeAInitScript(params)` / `modeBInitScript(params)` — Playwright `addInitScript`-injectable,
  self-contained page-context functions. Both wrap `getUserMedia` (D19 pattern: real device capture
  happens, everything downstream is synthetic/harness-controlled). Mode A publishes a true DC
  `ConstantSourceNode(offset=frozenLevel)` for `holdDurationMs`; Mode B publishes
  `ConstantSourceNode(offset=0)` (literal silence). Both then decode and switch to a
  harness-supplied speech fixture on a `setTimeout(holdDurationMs)`.

Two test files, mirroring D19's `gum-shim.test.ts` / `gum-shim.browser.test.ts` split:

- `harness/__tests__/b07-capture-injection.test.ts` — 9 pure unit tests (timeline defaults,
  classifier boundaries, custom threshold overrides). No browser, no call burn.
- `harness/__tests__/b07-capture-injection.browser.test.ts` — 2 real-Chromium mechanism-proof
  tests (blank local HTTP page, `--use-file-for-fake-audio-capture`, same evidence tier as
  `gum-shim.browser.test.ts`). **0/25 call burn — no room join.**

---

## Finding 1: the DC-filtering risk flagged in the proposal did NOT materialize

The proposal (`prompts/b07-proposed.md` §1) flagged a real risk: WebRTC's audio processing chain
commonly high-pass-filters near-DC content, which could make a `ConstantSourceNode` hold-phase
signal collapse to near-silence before it's measurable.

**Measured on real Chromium** (debug instrumentation, `page.evaluate` + `AnalyserNode` sampling):
a `ConstantSourceNode(offset=0.15)` fed straight into `createMediaStreamDestination()` and read back
via a fresh `AudioContext`/`AnalyserNode` reports a rock-steady `0.15000000596046204` RMS across
every steady-state window. **No DC filtering occurred.** This makes sense in hindsight: the concern
applies to Chrome's `AudioProcessingModule` (EC/NS/AGC/HP-filter), which attaches to
**getUserMedia-captured** tracks at acquisition time — our synthetic `destination.stream` track is
constructed fresh via the Web Audio graph and never passes back through that pipeline. The mirrored
threshold (`levelVariance < 0.005`) reliably classifies this as `'frozen-nonzero'`.

**Caveat not yet measured:** whether a real `RTCPeerConnection.addTrack()` + SFU relay re-applies any
processing to this synthetic track before the far end receives it. That is exactly the gap B13/B14's
real 2-party room call closes — not assumed away here, just not yet measured.

## Finding 2: onset transient — the first sample after track acquisition is unreliable

The very first `AnalyserNode` sample taken immediately after `getUserMedia()` resolves reads low
(measured `0.125` vs. the steady-state `0.15`) — a render-quantum artifact from the moment the
`ConstantSourceNode` starts. Sampling too early trips the flat-window variance check
(`classifyHoldPhaseSignature` returned `'neither'` when the transient sample was included).

**Fix applied:** the mechanism-proof test now waits 120ms after track acquisition before starting
the hold-phase sampling window. This is a **test-harness measurement artifact**, not a claim about
app-observable behavior — flagging it here because the same pitfall would bite any future caller
that samples a freshly-acquired track's very first window.

## Finding 3 (important, feeds B13/B14 directly): the bot-speech fixtures are synthetic tones, not real speech

`e2e/fixtures/bot-speech/{bot-140,bot-123}/*.wav` are documented in
`e2e/fixtures/bot-speech/README.md` as **synthetic sine-wave tones** (440Hz for bot-140, 660Hz for
bot-123) — placeholders pending real Piper TTS generation. This has two concrete consequences,
measured here, not assumed:

1. **A steady-state sine tone's windowed RMS is itself flat** — measured RMS across
   `bot-123/hello.wav` playback was a constant `~0.212` across every window sampled. This means
   `classifyHoldPhaseSignature` (or `classifyMicCapture` in the app) reads the "recovered speech"
   phase as **just as flat as the frozen hold phase** — the two are indistinguishable by
   variance-based classification using these fixtures. The mechanism-proof test therefore asserts a
   **fixture-independent claim** — a measurable level/state change at the moment of switch (>20%
   relative change for Mode A, crossing back above the silence threshold for Mode B) — not "no
   longer flat," which these fixtures cannot demonstrate.
2. **These fixtures carry no phonetic content.** `manifest.json` lists a `text` field (e.g. `"Hello,
   how are you?"`) but the WAV itself is a pure tone — no ASR/whisper pipeline will ever transcribe
   those words from this audio. **This directly blocks AC4/AC5's evidence requirement** ("far end
   transcribing words after recovery"): as things stand, no fixture in the repo can produce a
   transcript with recognizable words.

**OPEN, feeds B13/B14 (and whoever owns fixture generation) directly:** real speech content — via
Piper TTS (the README's own stated plan) or any other real-word source — must exist before AC4/AC5's
transcript proof is achievable. This is not a B07 scope item (B07 builds the injection mechanism, not
speech fixtures), but it is a hard blocker for the batches that depend on B07, and should be raised
as its own queue item if not already covered elsewhere.

---

## Contract shape, for B13/B14's reference

```ts
buildInjectionTimeline(mode: 'mode-a-frozen' | 'mode-b-silent', speechFixtureUrl: string, holdDurationMs?: number)
  // holdDurationMs defaults to T_GAP_PROVISIONAL_MS (500ms, D27 PROVISIONAL — override for real use)

page.addInitScript(modeAInitScript, { frozenLevel, holdDurationMs, speechWavUrl })
page.addInitScript(modeBInitScript, { holdDurationMs, speechWavUrl })
```

Both init scripts fully replace `getUserMedia`'s returned audio track's content for the hold phase,
then switch to a decoded fixture at `holdDurationMs`. Real captured mic audio is never used in either
mode's hold phase — this is a fully synthetic reproduction of both real-session bug signatures, not
an attenuation of live voice (distinct from B05's `gum-shim.ts`, which attenuates the real track).

---

## What remains explicitly OPEN (not closed by B07)

- **AC4 (Mode A frozen-nonzero recovery)** — requires a real 2-party room call where the app's own
  `classifyMicCapture`/`runMicSweep` observe this injected signature and a **real recording +
  transcript** on the far end proves recovery. Owned by **B13**.
- **AC5 (Mode B dead-mic recovery)** — same, owned by **B14**.
- **Real speech fixture content** — Finding 3 above; a hard prerequisite for AC4/AC5's transcript
  evidence, not yet solved anywhere in the repo.
- **RTCPeerConnection/SFU-level DC-filtering** — Finding 1's caveat; unmeasured beyond the local
  track.
- **Real `T_gap`** — VOID per D27; B04 re-derivation still pending, sequenced after B07 per
  `queue-batches.md`.

No AC4 or AC5 verdict is claimed here. No call budget was burned (0/25 — mechanism proof only, no
room join, matching D19/B05's evidence tier).
