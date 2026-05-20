# FIXC8 Changes

User report:

> "and have an option as well to change the transciber as well on the config."

Root cause / mechanism:

- The Settings page had only a static Transcriber Model stub.
- `backend/scripts/transcribe.py` hardcoded `WhisperModel("medium", ...)`, so the existing transcript sidecar `model` field could not reflect a user-selected model.
- The backend transcription spawn did not derive a per-owner setting and did not pass any model choice to the Python worker.

Changes:

- Reused `llm_settings` for the new `transcriber_model` key with default `medium`.
- Extended `GET/PUT /api/llm/settings` to return and partially update `transcriberModel` without requiring provider settings to be resent.
- Added backend validation for allowed model values: `small`, `medium`, `large-v3`.
- Updated transcription spawn to resolve the recording owner and pass `WHISPER_MODEL` to the worker.
- Added orphan/missing-room fallback to `medium` so auto-transcribe never fails because a settings owner cannot be derived.
- Updated `transcribe.py` to accept `--model` or `WHISPER_MODEL`, default to `medium`, and write the selected value into the sidecar `model` field.
- Replaced the Settings page Transcriber Model stub with a persisted dropdown and model details.
- Added backend coverage for settings persistence/validation and spawn env propagation.
- Added FIXC8 Playwright coverage for dropdown render, persistence, and sidecar model propagation.

Files:

- `backend/src/modules/questions/store.ts` - transcriber setting default, validation, get/set helpers.
- `backend/src/modules/questions/index.ts` - settings GET/PUT response and partial update support.
- `backend/src/modules/recording/index.ts` - resolve recording owner's model, fallback to `medium`, pass `WHISPER_MODEL`.
- `backend/scripts/transcribe.py` - model selection from CLI/env/default and sidecar model write.
- `frontend/src/app/services/questions.service.ts` - `TranscriberModel` type and partial settings update payload.
- `frontend/src/app/pages/settings/settings.page.*` - dropdown UI and persisted selection handling.
- `backend/tests/questions.test.ts` - settings default, invalid value, partial update persistence.
- `backend/tests/recording.test.ts` - fake worker asserts spawned `WHISPER_MODEL` reaches sidecar.
- `e2e/tests/v3-fixc8-transcriber-config/transcriber-config.spec.ts` - live dropdown and sidecar coverage.

Screenshot:

- `screenshots/settings-transcriber-dropdown.png`
