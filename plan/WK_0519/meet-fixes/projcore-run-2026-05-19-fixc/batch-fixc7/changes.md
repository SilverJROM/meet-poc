# FIXC7 Changes

- Added SQLite migration `0004_questions_and_llm_settings.sql` with `questions` and `llm_settings`.
- Added authenticated question/settings APIs:
  - `GET/POST /api/questions`
  - `PUT/DELETE /api/questions/:id`
  - `POST /api/questions/:id/star`
  - `GET/PUT /api/llm/settings`
  - `POST /api/recordings/:filename/analyze`
  - `GET /api/recordings/:filename/analysis`
- Seeded per-owner defaults: `Summarize meeting` auto-run/default and `Extract action items` manual.
- Default provider is `ollama`; default Ollama model is `mistral-nemo:12b`.
- Added sidecar analysis persistence as `<filename>.analysis.<question-slug>.json`.
- Added auto-run queue after successful transcription and recording delete cascade for analysis sidecars.
- Replaced settings stub with provider default controls, question CRUD, auto-run toggle, provider override, and default-question star.
- Added transcript analysis panel with per-question Run buttons and persisted results.
- Updated stale shell regression for `/app/settings` now that settings is implemented.

Screenshots:
- `screenshots/settings-question-library.png`
- `screenshots/transcript-with-analysis.png`
