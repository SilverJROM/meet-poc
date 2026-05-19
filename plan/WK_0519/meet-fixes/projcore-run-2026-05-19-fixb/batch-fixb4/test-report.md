# FIX-B4 Test Report

## Environment
- Python venv: `backend/.venv-transcribe`.
- STT package: `faster-whisper`.
- Model verification: `medium`, CPU, `int8`, cached in `~/.cache/huggingface/hub`.
- Synthetic audio fixture: `e2e/fixtures/audio/synth-taglish.webm`, duration 13.74s.

## Commands
- `backend/.venv-transcribe/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu', compute_type='int8'); print('medium loaded')"`: PASS.
- `npm run build -w backend`: PASS.
- `npm run build -w frontend`: PASS.
- `npm test -w backend`: PASS, 18 files, 59 tests.
- `npm test -w e2e -- tests/v3-fixb4-transcripts --config=playwright.live.config.ts --workers=1`: PASS, 1/1.
- Initial Run 1 regression: FAIL, 6 v2-b5 tests blocked because live DB was missing seeded `TEST_ROOM01`.
- Reseed: created `TEST_ROOM01`.
- Run 1 rerun: `npm test -w e2e -- tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1`: PASS, 45/45.

## Smoke Output Sample
Manual live smoke used a synthetic recording copied into `recordings/` with matching `.meta.json`, then:

```json
{
  "language": "en",
  "languageProbability": 0.9844,
  "model": "medium",
  "lineCount": 3,
  "wordCount": 30,
  "firstLines": [
    {
      "clientId": "speaker-one",
      "name": "Ari",
      "text": "Hello JROM, this is Speaker 1 starting the transcript test."
    },
    {
      "clientId": "speaker-two",
      "name": "Bela",
      "text": "Speaker 2 replies, CUMUSTA team, the audio fixture is ready."
    },
    {
      "clientId": "speaker-one",
      "name": "Ari",
      "text": "Speaker 1 closes with a final English sentence for verification."
    }
  ]
}
```

`GET /api/recordings/:filename/transcript` returned the same transcript, and `GET /api/recordings` reported `{ hasTranscript: true, transcribeStatus: "ready", speakerCount: 2, durationMs: 13740 }`.

## Screenshot
- `screenshots/transcripts-page.png`: live transcripts page with the synthetic transcript opened.
- `screenshots/transcripts-page-e2e.png`: focused E2E screenshot.
