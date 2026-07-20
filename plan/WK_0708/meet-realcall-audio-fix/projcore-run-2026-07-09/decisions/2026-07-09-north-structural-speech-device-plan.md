# Structural foundation plan — bots have voice + real capture device
**North STOP 2026-07-09.** No further AC batches until this plan is executed (or north amends).
**Status:** PLAN — awaiting execution greenlight from main (/north) after review; projcore has paused AC queue.

---

## Confirmed defects (measured this session)

### Defect 1 — Bots have no voice
| Evidence | Result |
|---|---|
| `e2e/fixtures/bot-speech/README.md` | Explicitly documents **synthetic sine tones** pending piper |
| `bot-140/hello.wav` | 16 kHz mono, ~1.5 s, **~440 Hz** (zero-crossing estimate) |
| Opus r1 F1 | Already proved `bot-140/hello.wav` → whisper **0 words** |
| `generate-synthetic-wavs.ts` | Generator for tones, not speech |
| `e2e/fixtures/audio/tone-*.wav` | Only pure tones at audio root |
| Real speech exists elsewhere | `e2e/fixtures/audio/speech/{alice-host,bob-local}{,-long}.wav` — used by B08A-3; **not** the bot-speech contract used by ConversationScript |
| Piper on this host | **Not found** at `~/voicesim/piper/piper` or common paths — generation step must install/locate piper (or run on a machine that has it) then **commit** WAVs |

**Consequence:** Transcript arbiter over bot-speech fixtures → empty STT forever → every AC that needs "far end verifiably transcribes" false-greens or false-fails unless arbiter is wrongly relaxed. **Do not relax.**

**b07-findings Finding 3** already documented this; it was not made a hard queue gate. Now it is.

### Defect 2 — No call uses a real capture device
| Evidence | Result |
|---|---|
| `call-driver.ts` `DEFAULT_LAUNCH_ARGS` | Always includes `--use-fake-device-for-media-stream` |
| Merge order | `...DEFAULT_LAUNCH_ARGS, ...(config.launchArgs \|\| [])` — file-for-fake-audio is additive; **fake device stays on** |
| B06 `weak-source-control.ts` | Scaffold / unit only; SSH to `.123` / pactl documented, **not wired to CallDriver** |
| AC15 B08A-3 | Proven under fake-device + speech file → **instrument**, not real gUM/APM/AGC path |
| AC2 | Faithful weak mode **impossible** while Chrome ignores PipeWire virtual mic |

**b07 Finding 1 caveat:** synthetic `destination.stream` bypasses Chrome gUM processing — related class of "instrument ≠ capture path."

---

## Binding rules (from north — adopt permanently)

1. **Speech fixtures for hearability / transcript ACs** must be real speech (piper or equivalent), 16 kHz mono WAV, **committed** (no runtime TTS).
2. **Whisper round-trip gate** before use: each fixture MUST STT to its intended text (alice-host rule). Fail fixture CI if empty/wrong.
3. **Tones/DC** legitimate **ONLY** for Mode-A constant-level injection and stimulus verification — **NEVER** for "can be heard" / transcript assertions.
4. **device_mode** on CallDriver: `fake-device` \| `real-virtual-mic` (explicit; not default-fake forever).
5. **Every validation report** MUST declare:
   - `device_mode: fake-device | real-virtual-mic`
   - `stimulus: speech | tone | DC`
   Missing either ⇒ report **INVALID**, not PASS.
6. **AC15** matrix: **SCOPED** to instrument-validated (fake-device) until real-device re-demo of capture-dead branch.
7. **Call budget (prior north):** 25 burns only AC8-class 3–5 min acceptance; sub-60s smoke logged not burned.

---

## Execution plan (ordered batches — structural foundation)

### B00S-SPEECH — Piper real-speech bot fixtures (blocks transcript ACs)
**impl L2 · val L2 · redteam budget · 0 acceptance burns**

1. Locate or install piper:
   - Preferred: `~/voicesim/piper/piper --model ~/voicesim/voices/en_US-amy-medium.onnx` (north path).
   - If missing on coord host: install once under `e2e/fixtures/bot-speech/_tools/` or generate on `.123` / any machine with piper, then copy committed WAVs into repo.
2. Generate **16 kHz mono PCM** WAVs for all manifest utterances:
   - bot-140: hello / thanks / goodbye (texts from manifest)
   - bot-123: hello / im-fine / great
   - Distinct voices if two models available; else same model OK if texts differ.
3. Replace tone files under `e2e/fixtures/bot-speech/{bot-140,bot-123}/`.
4. Add `e2e/harness/__tests__/bot-speech-whisper-roundtrip.test.ts` (or script invoked in CI/harness gate):
   - For each fixture: run `backend/.venv-transcribe` + `transcribe.py` (or equivalent).
   - Assert non-empty STT and fuzzy-contains intended text (normalize case/punct).
5. Update README: tones **forbidden** for hearability; point to generation command; keep tone-* under `e2e/fixtures/audio/` for Mode-A/stimulus only.
6. Delete or quarantine `generate-synthetic-wavs.ts` from the speech path (or rename + comment: tones only).

**Exit:** All bot-speech fixtures whisper-round-trip GREEN; committed.

### B00S-DEVICE — Real virtual mic path + provenance (blocks AC2 / full AC15 / AC8.123 leg)
**impl L2 · val L2 · redteam budget · smoke only (logged, not burned)**

1. CallDriver API:
   ```ts
   deviceMode?: 'fake-device' | 'real-virtual-mic'  // default may stay fake for unit/loopback
   stimulus?: 'speech' | 'tone' | 'DC'              // for logging/provenance
   ```
2. When `real-virtual-mic`:
   - **Omit** `--use-fake-device-for-media-stream` and `--use-file-for-fake-audio-capture`.
   - Keep autoplay / preflight flags as needed.
   - Document required host: Chrome on machine with PipeWire virtual mic (`.123` per B06 docs `192.168.254.123`).
3. Wire B06 `WeakSourceControl` live path (SSH/pactl) behind feature flag; smoke test attenuate → measure (not full AC2 yet).
4. Provenance helper: `writeValidationProvenance({ device_mode, stimulus, ... })` required by validator template.
5. Update brief-template / validator briefs: missing declarations = INVALID.

**Exit:** One smoke dual-browser (or single-page gUM) call on real-virtual-mic produces non-silent capture **without** fake-device flags; logged duration+purpose, **not** burned if <60s.

### B00S-RELOAD — Document-load INVALID_RELOAD (parallel with speech)
**impl L2 · FINAL val codex55** (prior north)

1. Remove `history.replaceState/pushState` monkeypatch entirely.
2. Primary: Playwright main-frame load / framenavigated count between install and stop; >1 ⇒ INVALID_RELOAD.
3. Optional: sessionStorage `__b08s2Doc` epoch.
4. Change unit taxonomy: drop false `navCount>1` invariant; classify from `documentLoadCount` (out-of-page) + optional epoch.
5. Re-gate B08S-2 with **codex55**.

### B00S-BUDGET — Acceptance-only burn (parallel)
**impl L2 · val L1**

1. `incrementCallBurn` only when `acceptanceAttempt: true` **and** duration ≥ ~180s (or explicit AC8-class flag).
2. `logCall({ purpose, durationMs, device_mode, stimulus, burned: boolean })` for every browser+join.
3. Single ledger path (fix split root vs e2e cwd).
4. Fail-closed: acceptance path refuses if burned count > 25.

### B00S-AC15-RESCOPE + re-demo (after DEVICE)
1. Matrix already **SCOPED** (this plan).
2. After B00S-DEVICE: one real-virtual-mic run proving capture-dead (or both-advancing + capture-dead injection) with `device_mode: real-virtual-mic` + `stimulus: speech` (piper fixture or live mic speech).
3. Only then promote AC15 to full VERIFIED.

---

## What is NOT allowed until foundation lands

| Batch / AC | Why blocked |
|---|---|
| B04-real, B08, B08A live re-runs, B11–B20 | Transcript / hearability need real speech fixtures |
| AC2 / B12 | Needs real-virtual-mic + PipeWire attenuation |
| AC15 full VERIFIED | Needs real-device re-demo |
| Any arbiter "pass" on tone | Forbidden |

**Allowed in parallel foundation only:** B00S-* structural batches, pure unit tests, docs, INVALID_RELOAD fix, budget ledger, B08X read-only archaeology (zero call).

---

## Dependency graph

```
B00S-SPEECH ──┬──► B00S-DEVICE ──► B00S-AC15-RESCOPE (real-device re-demo) ──► resume AC live batches
B00S-RELOAD ──┤                                              │
B00S-BUDGET ──┘                                              ▼
                                    B04-real / B08 / B08A-3 re-label / B11+ ...
```

---

## Risk / open questions for /north (non-blocking to start B00S-SPEECH if piper path confirmed)

1. **Piper missing on coord host** — OK to install under repo `_tools` with SHA256 pin, or generate on `.123` and commit WAVs only?
2. **AC8/AC9 topology** — confirm `.140` may stay fake-device+file speech while `.123` is real-virtual-mic (asymmetric dual-browser), per "dev_machine participant" wording.
3. **alice-host / bob-local** already real speech at 48 kHz — may resample to 16 kHz for bot-speech contract or generate fresh via piper for exact manifest texts?

---

## Immediate actions taken (this STOP)

- All team tmux children killed; AC work paused.
- B04-real → PENDING (paused).
- Structural queue rows B00S-* inserted.
- req-matrix AC15 → **SCOPED** (instrument / fake-device only).
- OVM synced after filesystem evidence change.
- No AC green claimed under tone or undeclared device_mode going forward.

**Projcore awaits /north review of this plan before dispatching B00S-SPEECH.**
