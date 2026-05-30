---
date: 2026-05-30
batch: B4b
requirement: R7 — surface remote audio health + flag a silent remote in the diagnostics view
status: APPROVED-PLAN by JROM (direct), implemented @ 6a96b9e
---

# B4b — silent-remote classifier thresholds + D1/D2 design rulings

Context: R7 needs the diagnostics view to flag a silent remote "at a glance" using the exact
one-way-audio bug signature (near-zero audio bytes + high concealment), now hardenable by the
source-side micSilent that R1 derives and R6 makes per-participant attributable.

## Decision 1 — PRIMARY discriminator = concealmentRatio (duration-independent), threshold 0.5

`concealmentRatio = concealedSamples / (concealedSamples + jitterBufferEmittedCount)`.

- **Why concealment, not bytes, is primary:** concealmentRatio is duration-INDEPENDENT (a ratio),
  so it works regardless of how long the sample window is. Absolute `bytesReceived` is
  duration-DEPENDENT and fragile (a 3-min call vs a 10-s call have wildly different byte totals
  for the same health), so it cannot carry a fixed threshold.
- **`SILENT_REMOTE_CONCEALMENT_RATIO = 0.5`** — healthy audio conceals <5–10%; the forensic
  silent-remote signature in the persisted records was 60–95%. 0.5 sits in the dead zone: far
  above healthy (won't false-flag a janky-but-live call) and below the observed-silent floor
  (won't miss a real silent remote). `>=` is inclusive.
- **`SILENT_REMOTE_MIN_EMITTED_SAMPLES = 48000`** (~1 s @ 48 kHz) — below this the cumulative
  ratio is too noisy to trust ⇒ verdict 'unknown'. This floor ALSO subsumes the divide-by-zero
  case (0 concealed + 0 emitted < 48000 ⇒ 'unknown', never a NaN/throw).
- Verdicts: kind!=='audio' or null operand ⇒ 'unknown'; emitted+concealed < floor ⇒ 'unknown';
  ratio >= 0.5 ⇒ 'silent'; else 'ok'.

## Decision 2 (D1) — near-zero bytesReceived/packetsReceived = DISPLAY corroborator, NOT a verdict gate

JROM ratified the conservative default. bytes + packets are surfaced per publisher so a human can
corroborate the flag, but they do NOT enter the programmatic verdict (concealmentRatio is the sole
driver). Rationale: byte thresholds are duration-dependent/fragile (see D1 above); concealmentRatio
already encodes "audio not arriving."

## Decision 3 (D2) — source-side micSilent = HARDENER ONLY, never flips ok→silent

JROM ratified the conservative default. `classifyRemoteAudioHealth(track, sourceMicSilent?)` accepts
the second arg for signature/forward-compat but the **verdict provably ignores it** (the param is
underscore-prefixed `_sourceMicSilent` and never read in the verdict — reviewer + independent
validator both confirmed). It is consumed ONLY by `remoteAudioBadgeLabel`, which appends
"· silent at source" to an already-'silent' verdict for high confidence. It can NEVER turn a healthy
'ok' remote into 'silent'.
- Rationale: `payload.micSilent` is per-sample/INSTANTANEOUS (the in-call watchdog uses sustained
  windows precisely because instantaneous is noisy), whereas concealmentRatio is cumulative. Letting
  one instantaneous micSilent sample force a flag would false-positive a publisher who is actually
  transmitting.

## JROM verify-at-gate invariants (both honored + tested)
- Badge renders ONLY for a 'silent' verdict — NOT for 'unknown'/'ok'. ('SILENT REMOTE' literal lives
  only in `remoteAudioBadgeLabel`, which returns '' for ok/unknown; template gates on truthy label.)
- An early/short sample (emitted below floor) classifies 'unknown', NOT 'silent'. (Floor check runs
  before the ratio compare; spec RAH-5 anti-asserts `notStrictEqual(result, 'silent')`.)

## Attribution link (uses R6)
Inbound tracks carry `publisherClientId`; the view resolves it to a participant NAME + that
publisher's source micSilent by scanning `detail().entries` for `payload.clientId === publisherClientId`
(each participant uploads its own samples with its own clientId/clientName/micSilent — exactly what
R6 made queryable). Per-publisher rows are grouped/labeled by participant.

## Files (frontend-only)
NEW frontend/src/app/services/remote-audio-health.ts (+ .spec.ts); EDIT diagnostics.page.{ts,html,scss}.
No backend, migration, signaling, mic-energy.ts, room.page, B3, B6, or SFU touched.
