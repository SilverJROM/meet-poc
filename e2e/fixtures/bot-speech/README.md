# Bot Speech Fixtures

Real piper-generated speech audio assets for bot-140 and bot-123 in the conversation
harness — 16 kHz mono PCM WAV, committed (no runtime TTS).

**Tones are FORBIDDEN here.** Synthetic sine tones (`tone-*.wav` under
`e2e/fixtures/audio/`) are legitimate only for Mode-A constant-level injection /
stimulus verification — never for "can be heard" or transcript-based hearability
assertions. See `decisions/2026-07-09-north-structural-speech-device-plan.md`
binding #3. The `e2e/harness/__tests__/bot-speech-whisper-roundtrip.test.ts` gate
fails any fixture that does not whisper-round-trip to real, non-empty speech, and
includes a tone negative control proving the gate is not tautological.

## Voices

Two distinct piper voices, generated on `.123` only (never installed on this host):

- `bot-140` → `en_US-amy-medium`
- `bot-123` → `en_US-ryan-medium`

## Regenerating

Piper runs **only** on dev_machine `192.168.254.123` — never install it here.

```bash
ssh silverjrom@192.168.254.123

# one-time: download a second voice if not already present
cd /home/silverjrom/voicesim/voices
curl -sL -o en_US-ryan-medium.onnx \
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx"
curl -sL -o en_US-ryan-medium.onnx.json \
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json"

# generate + downsample to 16kHz mono (piper voices are natively 22050Hz)
cd /home/silverjrom/voicesim
echo "Hello, how are you?" | ./piper/piper --model voices/en_US-amy-medium.onnx \
  --output_file /tmp/bot140-hello-raw.wav -q
ffmpeg -y -i /tmp/bot140-hello-raw.wav -ar 16000 -ac 1 -c:a pcm_s16le /tmp/bot140-hello.wav

# repeat per utterance/voice (see fixtures-registry.json for the full text list),
# then scp the resulting WAVs back and commit them:
scp silverjrom@192.168.254.123:/tmp/bot140-hello.wav e2e/fixtures/bot-speech/bot-140/hello.wav
```

After regenerating, run the gate: `npx vitest run harness/__tests__/bot-speech-whisper-roundtrip.test.ts` (from `e2e/`).

## Fixture registry

`fixtures-registry.json` (repo-relative to this dir) lists every fixture the gate
checks, split into two classes:

- `scripted` — bot-140/bot-123 utterances below; gate asserts non-empty STT AND
  that the transcript contains the intended text's key words.
- `already-valid` — `e2e/fixtures/audio/speech/{alice-host,bob-local}.wav`, real
  recorded human speech reused from the B08A-3 fixture set (alice-host's content
  is independently confirmed real speech via B08A-3 evidence). No fixed script
  exists for these (natural conversation), so the gate only asserts non-empty STT.
  The `-long` variants and `.mp3` copies are not separately registered — one
  representative WAV per speaker is enough for the gate.

## Asset List

### bot-140 (voice: en_US-amy-medium)
- `hello.wav` - "Hello, how are you?"
- `thanks.wav` - "Thank you for that"
- `goodbye.wav` - "Goodbye and thanks"

### bot-123 (voice: en_US-ryan-medium)
- `hello.wav` - "Hello, nice to meet you"
- `im-fine.wav` - "I am doing fine, thanks"
- `great.wav` - "That sounds great"

## Usage

Import in tests and scheduler:

```typescript
import * as path from 'path';

const BOT_SPEECH_DIR = path.join(process.cwd(), 'e2e/fixtures/bot-speech');
const bot140Manifest = JSON.parse(
  fs.readFileSync(path.join(BOT_SPEECH_DIR, 'bot-140/manifest.json'), 'utf-8')
);
```

Use manifest entries to build `ConversationScript` utterance slots for `ConversationScheduler`.
