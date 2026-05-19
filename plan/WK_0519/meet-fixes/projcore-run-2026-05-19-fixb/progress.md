# progress.md — meet-fixes (post-Run-3 bug-fix run)

Live state of the fix run. Codex appends callbacks in `## Callbacks log`.

## Run state

- **Started:** 2026-05-19
- **Trigger:** JROM live-call test reported: no peer video/voice, controls invisible, recording untested, ask for transcript speaker-tagging
- **Coordinator:** Claude `/projcore`
- **Implementer:** Codex (`$lead`) in `lkvcdx-39`
- **Pattern:** 2 (supervisor-across-tmux)

## Batch states

| Batch | State | Iter | Dispatched | Callback | Validated | Verdict |
|-------|-------|------|------------|----------|-----------|---------|
| FIX-B1 | DONE | 1 | 2026-05-19 | 2026-05-19 | 2026-05-19 | PASS |
| FIX-B2 | QUEUED | — | — | — | — | — |
| FIX-B3 | DONE | 1 | 2026-05-19 | 2026-05-19 | — | — |

**FIX-B2 scope:** Transcript speaker-tagging — stable clientId per peer, ActiveSpeakerService 8Hz timeline export, sidecar `<recording>.meta.json` with `{participants, segments:[{startMs,endMs,clientId,name}]}`. Future transcription pipeline maps transcript timestamps → names.

**FIX-B3 scope (added 2026-05-19 after FIX-B1 PASS):** Recordings batch-delete — mirror the rooms-bulk-delete pattern I shipped earlier today. Per-row checkbox + Select all on page + Delete selected (N) action bar on `/app/recordings`. New `POST /api/recordings/bulk-delete` endpoint accepting filenames or IDs, ownership-gated. Source: JROM ask verbatim "a folder or tab on the ui shows these and can ba batch deleted as well".

**Dispatch order:** FIX-B3 first (lower-risk, mirrors known-good pattern, user-visible feature JROM just asked for) → FIX-B2 second (transcript tagging is a real feature, more design work).

## Callbacks log

(codex appends here)

[projcore callback] fixb1 DONE — signaling race buffered + bg-tab UA-gated + controls contrast
[projcore verdict] fixb1 PASS (iter 1) — Signaling race buffer-and-drain resolves no-video + no-voice + recording-missing-remote-audio in one fix (codex's triage diagnosis confirmed by FIX-B1.1+1.2 specs). 4 atomic commits (d22889a race+UA-gate / 1fd0b07 controls contrast / 278c15f spec / 306f371 evidence). My independent reruns: FIX-B1 spec 4/4 in 14.0s, Backend 47/47 in 10.8s, **Run 1 desktop regression 40/40 in 1.1m (R8.1 held 7 consecutive batches M-B1→FIX-B1)**. Visual evidence: controls-light.png shows 6 buttons visibly distinct on light bar. Buffer cap=20 per sender; drained on peer-joined; cleared on peer-leave/call-end. UA-gate fix prevents narrow desktop windows from triggering bg-pause. Commit-before-DONE held (false alarm on my side — I read git mid-commit). 1 decision. See validation/batch-fixb1.md. Dispatching FIX-B2 (transcript speaker-tagging) next per JROM's approved plan.
[projcore callback] fixb3 DONE — recordings bulk-delete + single-delete + tab UI
[projcore callback] fixb3 RECOMMIT — FIX-B3 working files, e2e spec, evidence artifacts, and decision file are committed
