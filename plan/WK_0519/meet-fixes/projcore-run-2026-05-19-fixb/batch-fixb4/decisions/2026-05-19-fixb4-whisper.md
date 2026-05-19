# Decision — FIX-B4 Whisper Transcription

## Venv vs System Pip
Use `backend/.venv-transcribe`.

Reason: faster-whisper and CTranslate2 bring large native dependencies. Keeping them out of system Python and Node workspaces limits dependency churn and makes the runtime path explicit.

## Medium vs Small
Use `medium`.

Reason: JROM asked for Tagalog + English quality. `medium` is slower on CPU but materially better for multilingual speech than `small`. The machine has enough CPU/RAM for this batch.

## int8 vs fp16
Use `compute_type="int8"` on CPU.

Reason: fp16 is GPU-oriented and this machine has no NVIDIA GPU. int8 is the practical CPU path for speed and memory.

## Auto-Detect vs Forced `tl`
Use `language=None`.

Reason: the expected real content is Taglish. Auto-detect allows English-only, Tagalog-only, and mixed meetings to route through one worker without a user-visible language setting.

## Auto-Trigger vs Queue
Use non-blocking `spawn` plus sidecar lock status.

Reason: this app stores recordings as files and does not yet have a job queue. A lock file gives pending status and safe cleanup without introducing new infrastructure. Manual POST covers retries and backfill.

## Synthetic Fixture vs Silent JROM Recording
Use committed synthetic WebM plus hand-authored FIX-B2 metadata for tests and smoke.

Reason: JROM clarified the existing recording is likely silent. The synthetic fixture proves the pipeline and attribution deterministically; real Taglish quality remains a user validation task with real audio.
