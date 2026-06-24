# Batch B1b — Changes

## Summary

Replaced the inert `transcribeViaThirdParty` stub with a real **OpenRouter** integration and introduced **versioned transcript storage** keyed by `(recording × provider × model)` with a primary pointer. Backend only — no frontend UI (B1c).

---

## Code Changes

### `backend/src/modules/recording/openrouter-transcribe.ts` (new)

**R1.6/R1.7 — Real cloud STT via OpenRouter.**

- `POST https://openrouter.ai/api/v1/audio/transcriptions` with `Bearer $OPENROUTER_API_KEY`, multipart audio, no forced language.
- `normalizeOpenRouterTranscript()` maps `verbose_json` words/segments → `{lines, words}` schema.
- Owner-only labeling from `participant.json` (same B1a rule — never `?`).
- 25 MB limit: skip + log when exceeded.
- Missing key: logged no-op, returns `'skipped'` (R1.9).

### `backend/src/modules/recording/transcript-versions.ts` (new)

**R1.8 — Versioned storage + primary resolution.**

- Version path: `<file>.transcript.<provider>-<sanitized-model>.json`
- Primary pointer: `<file>.transcript.primary.json`
- `resolvePrimaryTranscriptPath()` — pointer → version file → legacy `.transcript.json` fallback
- `listTranscriptVersions`, `deleteTranscriptVersion`, `setPrimaryTranscript`, `deleteAllTranscriptSidecars`

### `backend/src/modules/recording/index.ts`

- Provider seam: `'thirdparty'` → `'openrouter'` (alias on read/write).
- `spawnTranscription` checks per-version existence; routes to OpenRouter or local Python.
- Transcribe job accepts `{ provider?, model?, force? }` on per-file and per-session endpoints.
- New endpoints:
  - `GET .../transcript/versions`
  - `DELETE .../transcript/versions?provider=&model=`
  - `PUT .../transcript/primary`
- All transcript reads (`GET transcript`, `.txt`, `named-transcript`, listings) resolve primary.

### `backend/src/modules/questions/store.ts`

- `TranscriptionProvider = 'local' | 'openrouter'`; `thirdparty` alias → `openrouter`.
- `getCloudTranscriberModel` / `setCloudTranscriberModel` for OpenRouter model id (default `openai/whisper-1`).

### `backend/scripts/transcribe.py`

- Writes versioned path `local-<model>.json`; adds `provider: "local"` to payload.
- Sets primary pointer on first transcription if unset.

### `backend/src/modules/questions/index.ts`

- Analysis path uses `resolvePrimaryTranscriptPath()` instead of hardcoded `.transcript.json`.

### `backend/tests/recording.test.ts`

- B1b: `normalizeOpenRouterTranscript` owner-only unit assertion.
- B1b: mocked OpenRouter HTTP → versioned owner-labeled file.
- B1b: missing `OPENROUTER_API_KEY` → no-op, no error.
- B1b: two versions coexist, delete one, primary switch.
- FIX-B4 manual transcribe updated for versioned local path.