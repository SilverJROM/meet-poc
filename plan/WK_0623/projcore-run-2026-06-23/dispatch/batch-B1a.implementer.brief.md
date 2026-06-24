<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B1a: Kill the phantom-`?` speaker — per-person owner-only transcription, retire mixed-file diarization

Batch ID: batch-B1a
Plan: /home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/plan/B1-transcription.md
Branch: feat/recording-reliability-b5 (run branch — all batches accumulate; no commit)
Requirements assigned: R1.1 R1.2 R1.3 R1.4
North-star anchors: Issue #1 (transcription phantom-?), decision 2026-06-23-transcription-architecture.md (D-1, D-2, D-3).
Lifecycle: pre-live — Deferral policy: OFF. Read `~/.claude/JROM/style/deferral-policy.md`. No TODO/FIXME/follow-up shims without a queue.md row this run. Uncertainty = STATUS: NEEDS-INFO, not a defer.

Estimated duration: SHORT (atomic) — 30min

Effort tier (PROJCORE-PROPOSED — confirm or counter at PROPOSED): medium
  Mode chord: codex/grok effort medium
  Validator topology: 3-agent (validator=codex55, UI-PROOF/artifact-proof)
  Why: focused backend change (Python + TS), well-scoped; default medium.

Context:
On JROM's real 2-person call (host + Peer2), the transcript showed a phantom 3rd speaker labeled `?`. Root cause (already diagnosed): `backend/scripts/transcribe.py::speaker_for_ms()` re-attributes EVERY transcribed word to a speaker by testing which active-speaker SEGMENT window the word's timestamp falls into; words in gaps/overlaps → labeled `?`, and Whisper hallucinations during silence land in gaps → a phantom `?` party. The app ALREADY records per-person files (`*.participant.json` with `isPerUser:true`) and has a clean aggregator `GET /api/recordings/named-transcript/:sessionId` that labels each per-person file's lines by its owner. The fix: make per-person the SOLE transcription source and retire the segment-diarization that invents `?`.

Requirements section (verbatim from req-matrix.md):
"R1.1 No phantom speaker. A 2-person call produces a transcript with exactly the 2 real participants — never a ? / 3rd party. R1.2 Per-person is the sole transcription source. Each per-person file's lines are all attributed to that file's owner; no per-word segment guessing. R1.3 Mixed webm is never transcribed but stays downloadable. R1.4 Timestamped, aggregated, non-overlapping merged transcript across all participants."

Observed (current state, file:line):
- `backend/scripts/transcribe.py`: `speaker_for_ms(metadata, names, start_ms)` returns `?` when a word's timestamp is outside all segment windows; `build_lines()` groups by per-word `clientId`. This runs on EVERY file including the mixed webm.
- `backend/src/modules/recording/index.ts`: per-person files carry `{displayName, clientId, isPerUser:true}` (participant.json, ~line 87); `named-transcript/:sessionId` (~136) aggregates per-user files' lines labeled by file owner, sorted by startMs; `transcribeSessionRecordings` / `maybeAutoTranscribeSession` enqueue transcription.

Expected (acceptance criteria — implement ALL):
1. R1.2/R1.1: In `transcribe.py`, when transcribing a PER-PERSON file, attribute ALL words to that file's OWNER (from its `.participant.json` displayName/clientId) — remove the `speaker_for_ms` per-word segment lookup for per-person files so NO word can ever be labeled `?`. A per-person transcript's speaker = the file owner, period.
2. R1.3: Ensure ONLY per-person files (`isPerUser:true`) are enqueued for transcription (in `transcribeSessionRecordings` / `maybeAutoTranscribeSession`); the mixed webm is NEVER transcribed but remains downloadable/listed.
3. R1.4: The canonical meeting transcript = the `named-transcript/:sessionId` merge (per-line startMs/endMs, owner-labeled, time-sorted, interleaved). Confirm it is the surface used; no `?` possible.
4. Re-transcribe JROM's existing per-person files if present (the AGENTROOM dc411e/host webms under `recordings/`) to demonstrate zero `?` — OR provide a unit/fixture test proving owner-only labeling.

Likely files:
- backend/scripts/transcribe.py
- backend/src/modules/recording/index.ts
- (test) backend/scripts/ or a fixture/unit test for owner-only labeling

Scope:
- ONLY R1.1-R1.4 (phantom-? kill + per-person-only + merge). Do NOT build the OpenRouter cloud provider, model selector, or versioning (those are later slices B1b/B1c).
- Do NOT change the recording/upload path (B5) or the media path.
- Do NOT git commit. Surgical, tight diff.
- Robust proof: assert the OUTCOME (transcript has zero `?`, lines owner-labeled) — not just that transcription ran.

Plan handshake protocol (MANDATORY before implementation):
1. Read this brief + referenced files.
2. Reply with PROPOSED: mechanism-level diagnosis + planned files + risks + estimate confirmation.
3. Confirm or counter-propose the effort tier (one-line why). Higher wins.
4. End reply with: STATUS: PROPOSED — <one-line approach> · complexity: <confirmed-or-counter> · why: <one line>.
5. Wait for projcore APPROVED-PLAN before writing code.
6. If REVISE-PLAN returned, address gaps, re-emit STATUS: PROPOSED.

After APPROVED-PLAN:
7. Implement. If you touch backend TS, ensure it typechecks. Run transcribe.py on a per-person fixture to show zero `?`.
8. Reply with STATUS: DONE — <one-line summary> when done + proof green.

Required artifacts:
- batch-B1a/scenarios.md
- batch-B1a/changes.md (User Report verbatim + Root Cause mechanism + Code Changes per-file WHY)
- batch-B1a/review.md
- batch-B1a/test-report.md
- batch-B1a/independent-validation.md
- decisions/<YYYY-MM-DD>-<slug>.md per §1.15 (or state "Autonomous decisions: none").

---

## Streaming-order mandate
Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below) — not the first sentence, the first TOOL CALL, BEFORE any prose tokens stream. If interrupted between prose and the tool call, the callback never lands and projcore stalls. Append first, prose after.

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B1a <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states:   WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO

NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B1a[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo (human-readable mirror only)
End your reply with `STATUS: <STATE> — <same short note>`. Callback file is the detection path; if they differ, callback wins.
