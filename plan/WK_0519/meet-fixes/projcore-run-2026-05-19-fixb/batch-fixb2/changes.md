# FIX-B2 Changes

## Source

JROM verbatim: "on the transcribing as well, think about having to log w/c voice is w/c so that when we transcribe them is easier to attach a name to the transcript discuss adding this as well"

## Scope Delivered

- Added sidecar speaker metadata upload at `POST /api/recordings/upload-metadata`.
- Stored sidecars as `<recording filename>.meta.json` next to the audio file.
- Enriched `GET /api/recordings` rows with `hasMetadata` and `speakerCount`.
- Added safe metadata deletion when the associated recording is deleted.
- Extended `ActiveSpeakerService` with an 8Hz `activeFrame` signal and local-peer analysis.
- Extended `RecorderService` to collect participant snapshots, join/leave updates, and collapsed active-speaker segments with a 250ms minimum segment duration.
- Wired `RoomPage` recording start/stop and peer join/leave events into recorder metadata.
- Added a recordings-page badge: `Speakers: N`.

## Sidecar Schema

```json
{
  "schemaVersion": 1,
  "sessionId": "string",
  "roomId": "string",
  "recordingStartedAtIso": "ISO8601",
  "recordingDurationMs": 1234,
  "participants": [
    { "clientId": "string", "displayName": "string", "isHost": true, "joinedAtMs": 0, "leftAtMs": null }
  ],
  "segments": [
    { "startMs": 0, "endMs": 500, "clientId": "string", "source": "active-speaker-rms" }
  ]
}
```

## Exclusions Honored

- No Whisper/STT integration.
- No transcripts UI changes.
- No per-peer audio stems.
