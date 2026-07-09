# Bot Speech Fixtures

Synthetic speech audio assets for bot-140 and bot-123 in the conversation harness.

## Current Status

Using **synthetic WAV files** (sine-wave tones with proper duration and loudness):
- `bot-140/`: 440 Hz tone (from TONE_SET.HOST)
- `bot-123/`: 660 Hz tone (from TONE_SET.GUEST)

Each bot has 3 pre-defined utterances with manifest.json describing duration, loudness estimate, and transcribed text.

## Regenerating with Piper

When piper TTS becomes available:

```bash
# Install piper (https://github.com/rhasspy/piper)
# Example: brew install piper-tts

# Regenerate bot-140 utterances
piper --model en-us-lessac-medium --output-file bot-140/hello.wav \
  --data-dir ~/.piper \
  "Hello, how are you?"

piper --model en-us-lessac-medium --output-file bot-140/thanks.wav \
  "Thank you for that"

piper --model en-us-lessac-medium --output-file bot-140/goodbye.wav \
  "Goodbye and thanks"

# Regenerate bot-123 utterances (different voice if available, or same)
piper --model en-us-joe-medium --output-file bot-123/hello.wav \
  "Hello, nice to meet you"

# ... (remaining utterances)
```

Then update manifest.json with actual measured RMS/LUFS from the real WAV files.

## Asset List

### bot-140
- `hello.wav` (1500ms) - "Hello, how are you?"
- `thanks.wav` (1200ms) - "Thank you for that"
- `goodbye.wav` (1300ms) - "Goodbye and thanks"

### bot-123
- `hello.wav` (1400ms) - "Hello, nice to meet you"
- `im-fine.wav` (1600ms) - "I am doing fine, thanks"
- `great.wav` (1100ms) - "That sounds great"

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
