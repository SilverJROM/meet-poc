# FIXC8 Scenarios

## FIXC8.1 - Settings dropdown renders

- Open `/app/settings`.
- Confirm the Transcriber Model section contains a `Whisper model` dropdown.
- Confirm options are exactly `small`, `medium`, and `large-v3`.
- Confirm first-boot persisted default is `medium`.
- Capture `screenshots/settings-transcriber-dropdown.png`.

Expected: dropdown is visible, selectable, soft-light theme conforming, and stable on the settings page.

## FIXC8.2 - Selection persists

- Change the Transcriber Model dropdown to `large-v3`.
- Wait for the saved status.
- Reload `/app/settings`.

Expected: dropdown still shows `large-v3`, proving the value is persisted through `/api/llm/settings`.

## FIXC8.3 - Selected model reaches transcript sidecar

- Change the Transcriber Model dropdown to `small`.
- Trigger force transcription for a synthetic recording through `POST /api/recordings/:filename/transcribe`.
- Use the deterministic fake transcription worker to avoid downloading Whisper models during e2e.
- Read the generated transcript sidecar.

Expected: sidecar JSON contains `"model": "small"`.

## Backend coverage

- Settings defaults include `transcriberModel: "medium"`.
- Invalid transcriber model values return 400.
- Updating only `transcriberModel` preserves provider settings.
- Updating only `defaultProvider` preserves the selected transcriber model.
- Manual transcription spawn passes the persisted model through `WHISPER_MODEL`.
