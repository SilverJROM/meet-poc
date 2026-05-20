# Batch FIXC4 Scenarios Implemented

## FIXC4.1 Subtitle TXT Download
- Seed an owned recording with a three-line transcript.
- Open `/app/transcripts`.
- Assert Download and Delete transcript actions are visible.
- Click Download and assert the saved file is `.txt`.
- Assert each line matches `[mm:ss] Speaker: text`.
- Assert downloaded content has Ari/Bela/Ari lines.

## FIXC4.2 Transcript-Only Delete
- Seed an owned recording with audio, metadata, transcript, and an old mtime.
- Click Delete transcript and confirm.
- Assert the row loses View and Download actions.
- Assert the row shows Transcribe again.
- Assert `/api/recordings` reports `hasTranscript: false`.
- Assert audio and `.meta.json` remain on disk while `.transcript.json` is gone.

## FIXC4.3 Viewer Clears After Delete
- Open the transcript viewer.
- Delete the same transcript.
- Assert the viewer panel and transcript lines are removed from the DOM.

## R-C-7 Past Meetings Delete
- No new UI/code by design.
- Existing rooms bulk-delete remains the canonical past-meeting delete path.
- Verified by `npm test -w backend` including rooms bulk-delete coverage.
