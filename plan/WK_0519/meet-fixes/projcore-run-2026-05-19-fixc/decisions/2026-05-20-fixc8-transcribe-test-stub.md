# FIXC8 Decision - Transcribe E2E Stub

Decision: use a deterministic fake transcription worker for FIXC8.3 live e2e.

Reasoning:

- R-C-13 needs proof that the selected settings value reaches the transcription sidecar.
- Pulling or running real Whisper models, especially `large-v3`, is expensive and explicitly out of scope for FIXC8.
- The brief allowed stubbing `transcribe.py` for CI if model pull/runtime was too slow.

Implementation:

- The Playwright spec temporarily restarts PM2 backend with `MEET_TRANSCRIBE_PYTHON=process.execPath` and `MEET_TRANSCRIBE_SCRIPT=<fake-worker>`.
- The fake worker writes `<audio>.transcript.json` with `model: process.env.WHISPER_MODEL`.
- The test sets the persisted model to `small`, triggers force transcription, and asserts the sidecar model is `small`.
- After the suite, PM2 is restarted back to the normal backend script path.

Impact:

- Production code still uses `backend/scripts/transcribe.py` and faster-whisper.
- No Whisper model downloads are triggered by the e2e test.
