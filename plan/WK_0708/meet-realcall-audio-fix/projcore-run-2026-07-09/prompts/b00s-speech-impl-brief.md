# B00S-SPEECH — Piper real-speech bot fixtures + whisper round-trip gate

§4b: impl L2 (use sonnet for multi-host foundation), val L2 codex55, redteam budget, 0 acceptance burns

## North bindings (non-negotiable)
1. Piper runs **only** on dev_machine `.123` — do NOT install piper on this host (.140).
   ```
   ssh silverjrom@192.168.254.123
   /home/silverjrom/voicesim/piper/piper --model /home/silverjrom/voicesim/voices/en_US-amy-medium.onnx
   ```
2. Generate WAVs on .123, **scp** into `e2e/fixtures/bot-speech/`, **COMMIT** them. No runtime TTS.
3. **Two distinct voices.** Only `en_US-amy-medium` is installed. Download a second piper voice
   (e.g. `en_US-ryan-medium` or `en_US-lessac-medium` from huggingface `rhasspy/piper-voices`)
   onto `.123` under `/home/silverjrom/voicesim/voices/`. Assign bot-140 one voice, bot-123 the other.
4. **REUSE** existing real speech: `e2e/fixtures/audio/speech/{alice-host,bob-local}{,-long}.wav`
   (alice-host already whisper-verified). Extend the set; do not regenerate those.
5. **Fixture gate (test, not checklist):**
   - Root/bot `manifest.json` maps every fixture path → intended text (+ voice id).
   - Test runs **same stack as backend**: `backend/.venv-transcribe/bin/python` + `backend/scripts/transcribe.py`
     with **`--force`** (defeat transcript_path cache — landmine).
   - FAIL on empty STT or text not matching intended (normalize case/punct; require key words).
6. Tones remain under `e2e/fixtures/audio/tone-*.wav` for Mode-A/stimulus only — **never** bot-speech hearability path.
7. Replace synthetic tones under `e2e/fixtures/bot-speech/bot-{140,123}/*.wav` with real piper speech (16 kHz mono preferred; if piper outputs other rate, convert to 16 kHz mono PCM with sox/ffmpeg on .123 before scp).

## Manifest utterances (from existing manifests / README)
bot-140 (voice A): hello "Hello, how are you?"; thanks "Thank you for that"; goodbye "Goodbye and thanks"
bot-123 (voice B): hello "Hello, nice to meet you"; im-fine "I am doing fine, thanks"; great "That sounds great"

Also register alice-host / bob-local paths in the gate manifest as **already-valid** speech fixtures (intended text from known content or prior verification).

## Deliverables
1. Piper-generated WAVs committed under `e2e/fixtures/bot-speech/`
2. Updated `manifest.json` files (per-bot + optional top-level fixture registry)
3. `e2e/harness/__tests__/bot-speech-whisper-roundtrip.test.ts` (or e2e test) — wired, must fail if tones returned
4. README update: tones forbidden for hearability; generation via .123 only
5. Atomic commit(s)
6. `validation/b00s-speech-changes.md` Codex-style
7. Callback DONE with evidence summary

## Handshake
PROPOSED first (SSH plan, voice download plan, file list, test plan, est) → wait APPROVED-PLAN → implement.

## Out of scope
CallDriver device_mode (B00S-DEVICE next). INVALID_RELOAD. Budget ledger redesign beyond not burning acceptance.
