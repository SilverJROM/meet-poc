# FIX-B4 Scenarios Implemented

- `FIX-B4.WORKER.1` Given a WebM and matching FIX-B2 sidecar, `backend/scripts/transcribe.py` writes a transcript JSON with words and speaker-attributed lines.
- `FIX-B4.WORKER.2` Given an existing transcript and no `--force`, the worker exits successfully with `already transcribed`.
- `FIX-B4.API.1` `GET /api/recordings/:filename/transcript` returns an owned transcript JSON and requires authentication/ownership.
- `FIX-B4.API.2` `POST /api/recordings/:filename/transcribe` starts the configured worker and returns `{ ok: true, status: "started" }`.
- `FIX-B4.API.3` `GET /api/recordings` enriches rows with `hasTranscript`, `transcribeStatus`, `durationMs`, and speaker count.
- `FIX-B4.API.4` Single and bulk recording delete remove transcript and lock sidecars.
- `FIX-B4.UI.1` `/app/transcripts` lists recordings, shows View for ready transcripts, and opens a speaker-attributed transcript viewer.
- `FIX-B4.UI.2` `/app/transcripts` shows Transcribe for recordings without transcripts and auto-polls pending rows.
- `FIX-B4.E2E.1` Synthetic fixture proves View and Transcribe states without depending on the silent JROM recording.
