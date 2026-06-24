---
date: 2026-06-23
type: bug + improvement
status: planned (implementation gated behind JROM post-call go)
agent: projcore
qa_verification: pending
---

# Transcription quality / phantom speaker / pluggable + versioned transcribers

## JROM verbatim
> "first is the transcription on my recent call with peer2 the transcript are a bit trash, and it seems
> like its detecting another party and being marked as ? on the transcript this is an issue, we should
> record each voice individually and add time stamps on it and aggregate the transcription together so
> there is no overlapping and no phantom transcription is being done, and also the transcription of whisper
> is not that accurate, can we have a way to plug in a better transciber or something here, please review
> and ask me your questions, i delete the previous transcription so its gone im trying to re-transcibe it
> with the larger whisper model, also for now can we have a version of the transcription until we find a
> better transcription so i can transcribe it with different models and see w/c is better"

## Disposition
Designed in `projcore-run-2026-06-23/` (north-star Issue #1, decisions, req-matrix R1.1–R1.10, plan/B1).
Root cause = per-word active-speaker diarization in `transcribe.py` inventing `?` on silence/gap
hallucinations. Fix = per-person-only owner-labeled transcripts + retire mixed diarization + real cloud
provider seam + versioned (per provider×model) transcripts. No implementation until JROM's post-call go.
