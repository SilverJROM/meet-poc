# B00S-SPEECH Validation

Validator: L2 codex55
Commit: `ad702ac7d6386968ee15fc3dc4f072a18e2fc115`
Date: `2026-07-09T08:15:07+00:00`

## Verdict: PASS

device_mode: n/a (fixture-only batch)
stimulus: speech for bot fixtures / tone for negative control

## Gate Checks

- Bot-speech fixtures are real speech, not tones: PASS. The new gate Whisper-round-trips every registered fixture and requires non-empty STT for all entries plus scripted keyword matches for bot fixtures (`e2e/harness/__tests__/bot-speech-whisper-roundtrip.test.ts:37`, `e2e/harness/__tests__/bot-speech-whisper-roundtrip.test.ts:99`, `e2e/harness/__tests__/bot-speech-whisper-roundtrip.test.ts:102`).
- Two voices: PASS. Registry has `en_US-amy-medium` for `bot-140` and `en_US-ryan-medium` for `bot-123` (`e2e/fixtures/bot-speech/fixtures-registry.json:3`, `e2e/fixtures/bot-speech/fixtures-registry.json:21`).
- Fixtures registry present and wired: PASS. Registry includes six scripted bot fixtures plus two `already-valid` speech fixtures (`e2e/fixtures/bot-speech/fixtures-registry.json:1`).
- Same backend stack with `--force`: PASS. Test invokes `backend/.venv-transcribe/bin/python backend/scripts/transcribe.py --provider local --force` (`e2e/harness/__tests__/bot-speech-whisper-roundtrip.test.ts:24`, `e2e/harness/__tests__/bot-speech-whisper-roundtrip.test.ts:45`).
- Tone negative control: PASS. The same pipeline asserts `tone-440.wav` yields zero words (`e2e/harness/__tests__/bot-speech-whisper-roundtrip.test.ts:116`).
- Bot-speech file formats: PASS. Independent `ffprobe` check shows all six `e2e/fixtures/bot-speech/bot-*/*.wav` files are `pcm_s16le,16000,1,16`.
- Piper binary in repo: PASS. `find . -path './node_modules' -prune -o -type f -name 'piper' -print -o -type f -name 'piper.exe' -print -o -type f -name 'piper-*' -print` returned no files.

## Reproduction

Command:

```bash
npx vitest run e2e/harness/__tests__/bot-speech-whisper-roundtrip.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       10 passed (10)
Duration    30.27s
```

Passing cases included all six scripted bot fixtures, both already-valid speech fixtures, and the pure-tone negative control.

## Format Evidence

```text
e2e/fixtures/bot-speech/bot-140/goodbye.wav pcm_s16le,16000,1,16
e2e/fixtures/bot-speech/bot-140/hello.wav   pcm_s16le,16000,1,16
e2e/fixtures/bot-speech/bot-140/thanks.wav  pcm_s16le,16000,1,16
e2e/fixtures/bot-speech/bot-123/great.wav   pcm_s16le,16000,1,16
e2e/fixtures/bot-speech/bot-123/hello.wav   pcm_s16le,16000,1,16
e2e/fixtures/bot-speech/bot-123/im-fine.wav pcm_s16le,16000,1,16
```

Note: the registry's reused `../audio/speech/{alice-host,bob-local}.wav` fixtures and `tone-440.wav` negative control are mono PCM 48 kHz. I did not count that against the 16 kHz check because the gate request scoped the Piper replacement to bot-speech fixtures, and all bot-speech Piper fixtures are 16 kHz mono.

STATUS: DONE
