# B00S-SPEECH — PROPOSED

## Recon (done, informs plan below)
- Piper confirmed on `.123`: `/home/silverjrom/voicesim/piper/piper`, only `en_US-amy-medium.onnx` installed (22050 Hz per its `.onnx.json`), `ffmpeg` present (no `sox`), internet reachable (huggingface.co 200).
- Current `bot-speech/` fixtures are exactly the two manifests in the brief (bot-140: hello/thanks/goodbye; bot-123: hello/im-fine/great), all still synthetic tones per README (bot-140=440Hz, bot-123=660Hz). `generate-synthetic-wavs.ts` is the tone generator.
- `alice-host.wav` / `bob-local.wav` (+ `-long` variants, + `.mp3`) live in `e2e/fixtures/audio/speech/`, no `.transcript*`/`.participant.json` sidecars committed (transcripts are produced at test-run time, not stored). alice-host's real-speech content (26 words) is independently confirmed via B08A-3 evidence (callbacks.md 07:47/07:53 entries) — no fixed "intended text" string exists for either clip (natural conversational speech, not scripted).
- `backend/scripts/transcribe.py` CLI: `python transcribe.py <wav> --model <name> --provider local --force`. Requires a `<wav>.participant.json` sidecar (`{isPerUser:true, clientId, displayName, joinedAtMs}`) or it silently no-ops (0 words, exit 0) — confirmed landmine, already documented in B08A-3's test. Output: `<wav>.transcript.local-<model>.json` with `{words:[{text}...]}`.
- Existing reusable pattern: `e2e/harness/__tests__/b08a3-live-sender-liveness.browser.test.ts` `runLocalWhisper()` (spawnSync + participant sidecar + --force) — will reuse this shape, not reinvent it.
- Verified huggingface source for a second voice: `https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx` (+ `.onnx.json`) — both URLs return valid redirects (200-class), not guessed.

## 1. SSH / generation plan (all on `.123`, nothing installed on `.140`)
1. Download second voice directly on `.123` (not proxied through `.140`):
   ```
   ssh silverjrom@192.168.254.123
   cd /home/silverjrom/voicesim/voices
   curl -L -o en_US-ryan-medium.onnx https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx
   curl -L -o en_US-ryan-medium.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json
   ```
2. Voice assignment: bot-140 → `en_US-amy-medium` (already installed), bot-123 → `en_US-ryan-medium` (new). Satisfies "two distinct voices" binding.
3. For each manifest utterance, on `.123`:
   ```
   echo "<text>" | piper --model voices/<voice>.onnx --output_file /tmp/<name>.wav
   ffmpeg -y -i /tmp/<name>.wav -ar 16000 -ac 1 -c:a pcm_s16le /tmp/<name>-16k.wav
   ```
   (amy is 22050Hz mono → downsample; ryan's native rate will be checked from its `.onnx.json` and downsampled the same way if not already 16k.)
4. `scp` the six `-16k.wav` files from `.123` back to this host into `e2e/fixtures/bot-speech/bot-140/{hello,thanks,goodbye}.wav` and `e2e/fixtures/bot-speech/bot-123/{hello,im-fine,great}.wav`, overwriting the tone WAVs. Texts unchanged from the current manifests (brief's utterance list matches what's already there).
5. No piper/model files or binaries copied to `.140` or committed to the repo — only the generated WAVs are committed, per binding #1/#2.

## 2. File list (what changes in-repo)
- `e2e/fixtures/bot-speech/bot-140/{hello,thanks,goodbye}.wav` — replaced (piper speech, 16kHz mono PCM)
- `e2e/fixtures/bot-speech/bot-123/{hello,im-fine,great}.wav` — replaced (piper speech, 16kHz mono PCM)
- `e2e/fixtures/bot-speech/bot-140/manifest.json`, `bot-123/manifest.json` — keep `name`/`text`/`path`; drop `rmsEstimate` (was a placeholder for synthetic tones) or recompute from real WAVs — proposing **drop**, since it's not used by the gate and re-measuring it isn't part of this batch's scope. Add `"voice": "en_US-amy-medium"` / `"en_US-ryan-medium"` per the brief's "(+ voice id)" requirement.
- New top-level registry: `e2e/fixtures/bot-speech/fixtures-registry.json` — flat array combining bot-140/bot-123 manifest entries (scripted text, exact-match class) plus alice-host/bob-local entries (already-valid class, no fixed text, non-empty-STT-only). Shape:
  ```json
  [
    { "path": "bot-140/hello.wav", "text": "Hello, how are you?", "voice": "en_US-amy-medium", "class": "scripted" },
    ...,
    { "path": "../audio/speech/alice-host.wav", "text": null, "class": "already-valid" },
    { "path": "../audio/speech/bob-local.wav", "text": null, "class": "already-valid" }
  ]
  ```
  (alice-host-long/bob-local-long and the .mp3 variants are NOT registered — brief says "extend the set" for bot-speech, not duplicate every variant; the gate only needs one representative already-valid entry per speaker. Will flag if you want the `-long` variants included too.)
- New test: `e2e/harness/__tests__/bot-speech-whisper-roundtrip.test.ts` (plain vitest, not `.browser.test.ts` — no browser needed, matches other pure-node harness tests).
- `e2e/fixtures/bot-speech/README.md` — rewrite: piper generation command (real, from step 1 above, not the old placeholder `brew install` snippet), explicit "tones forbidden for hearability" statement, pointer to `tone-*.wav` under `e2e/fixtures/audio/` for Mode-A/stimulus only.
- `e2e/fixtures/bot-speech/generate-synthetic-wavs.ts` — rename to `generate-synthetic-wavs.ts.tones-only` **or** add a top-of-file comment banner ("TONES ONLY — never for hearability/transcript fixtures, see README") and leave importable for Mode-A stimulus generation. Proposing: **keep filename, add banner comment** (renaming risks breaking any existing Mode-A caller — will grep for callers before deciding; if zero callers found, quarantine into `e2e/fixtures/audio/_tools/` instead).

## 3. Test plan
`bot-speech-whisper-roundtrip.test.ts`:
- Loads `fixtures-registry.json`.
- For each `class: "scripted"` entry: writes `.participant.json` sidecar, runs `WHISPER_PYTHON transcribe.py <wav> --model small --provider local --force`, asserts `wordCount > 0` AND normalized (lowercase, strip punctuation) transcript fuzzy-contains all "key words" of intended text (stopword-light — e.g. "hello", "how", "are" for "Hello, how are you?"), not exact string match (ASR won't be verbatim).
- For each `class: "already-valid"` entry: same whisper run, asserts only `wordCount > 0` (no fixed text to match against).
- Negative-control assertion (non-tautology proof, same pattern B08A-3 used): asserts a known tone fixture (`e2e/fixtures/audio/tone-*.wav`, whichever exists) yields `wordCount === 0` through the identical pipeline — proves the gate isn't vacuous.
- Cleans up generated `.transcript.*.json` / `.participant.json` sidecars after each fixture (scratch-only, not committed), mirroring B08A-3's evidence-hygiene approach but with no evidence dir needed here (this is a repeatable CI gate, not a one-off acceptance run).
- Est: ~15-20 fixtures × whisper `small` model (~2-5s each on CPU) → test runtime ballpark 60-120s. No browser, no call-driver, **0 acceptance burns** (confirmed — nothing touches call-ledger).

## 4. Estimate
- SSH + piper generation + scp: ~15 min (mostly bounded by whisper/piper model warm-up and manual verification of each WAV).
- Manifest + registry + README + test: ~20 min.
- Full est: ~35-40 min, impl L2, sonnet.

## Open items I'm flagging rather than deciding unilaterally
1. **`-long` variants and `.mp3` files**: not registering them in the gate (see above) — confirm or include.
2. **`rmsEstimate` field**: proposing to drop from manifests rather than recompute — confirm.
3. **`generate-synthetic-wavs.ts`**: proposing banner-comment quarantine over rename/move, pending a callers-grep — confirm preference either way.

Awaiting APPROVED-PLAN.
