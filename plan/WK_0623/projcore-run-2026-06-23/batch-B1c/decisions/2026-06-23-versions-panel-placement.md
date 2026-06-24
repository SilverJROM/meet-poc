# Decision: Versions panel placement

**Date:** 2026-06-23  
**Batch:** B1c

## Context

B1b added backend versioning; B1c needs UI to manage versions per recording.

## Decision

Place the **Versions** panel inside the track transcript viewer flow (when `selectedTranscript` is set), above the line-stream viewer and below the recording list. Meeting-level named transcripts do not show versioning (versions are per-file, not per-session merge).

## Rationale

- Matches JROM intent: pick a better transcription on a given meeting track.
- Keeps density-light: one panel, no new route or settings dependency.
- Reuses existing polling for pending transcriptions.

## Alternatives considered

- Settings default provider/model selector — deferred; add flow has inline picker.
- Versions on recordings page — transcripts page is the canonical transcript surface.