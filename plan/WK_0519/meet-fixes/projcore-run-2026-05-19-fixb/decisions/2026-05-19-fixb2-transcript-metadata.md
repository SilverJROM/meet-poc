# Decision: FIX-B2 Transcript Speaker Metadata

## Decisions

- Store speaker attribution as sidecar JSON files next to recordings instead of adding database tables.
- Use the mixed recording plus active-speaker RMS timeline, not per-peer stems.
- Collapse consecutive same-speaker 8Hz frames into segments and drop segments shorter than 250ms.
- Treat metadata upload as best-effort after audio upload succeeds.

## Rationale

- Sidecar JSON matches the existing file-backed recordings model and keeps the future transcription pipeline close to the audio artifact it will process.
- A database table would add migration and lifecycle overhead without improving the immediate transcription handoff.
- The 250ms floor filters jitter from the 8Hz active-speaker signal while retaining useful speaker windows.
- Audio is the primary artifact; if metadata upload fails after audio is saved, the user should not lose the recording.

## Consequences

- Future STT can map transcript timestamps to `segments[]` and then to `participants[]`.
- Speaker attribution is approximate because it is based on dominant speaker detection, not isolated stems.
- Recording delete now removes the sidecar to avoid orphan metadata files.
