# Batch B1c — Changes

## Summary

Frontend versioning UI on the transcripts page: list versions (provider+model, primary marked), add transcription with provider/model picker, delete version, set primary. Wired to B1b backend endpoints. Frontend only — no backend changes.

---

## Code Changes

### `frontend/src/app/services/recordings.service.ts`

- Added types: `TranscriptProvider`, `TranscriptVersion`, `TranscriptVersionsResponse`, `TranscribeOptions`.
- Added `provider?` to `Transcript`.
- New methods:
  - `listTranscriptVersions(filename)` → `GET .../transcript/versions`
  - `deleteTranscriptVersion(filename, provider, model)` → `DELETE .../transcript/versions?provider=&model=`
  - `setPrimaryTranscript(filename, provider, model)` → `PUT .../transcript/primary`
- Extended `transcribe()` to accept `{ force, provider, model }` (backward-compatible boolean `force` overload retained).

### `frontend/src/app/pages/transcripts/transcripts.page.ts`

- `transcriptVersions` signal; loaded alongside primary transcript in `viewTranscript`.
- Handlers: `addTranscription`, `deleteVersion`, `setPrimary`, `onAddProviderChange`.
- Curated model lists: local (`small`, `medium`, `large-v3`); openrouter (`openai/whisper-1`, `openai/gpt-4o-transcribe`).
- Polling extended to refresh versions + primary transcript while transcription pending.

### `frontend/src/app/pages/transcripts/transcripts.page.html`

- New **Versions** panel above track viewer: version rows with Primary badge, Set primary, Delete.
- Add transcription row: provider select, model select, Add transcription button.
- Transcript viewer header shows `provider / model · language`.

### `frontend/src/app/pages/transcripts/transcripts.page.scss`

- Styles for `.versions-panel`, `.version-row`, `.add-transcription` — density-light, consistent with existing panels.

### `e2e/tests/b1c-transcript-versions/transcript-versions.spec.ts` (proof)

- Seeds two versioned sidecars + primary pointer; opens Track; asserts versions panel DOM; captures screenshot.