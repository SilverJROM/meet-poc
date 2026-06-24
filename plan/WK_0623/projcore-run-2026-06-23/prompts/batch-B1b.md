<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B1b: Pluggable transcriber backend — OpenRouter provider + versioned transcripts (per recording×provider×model)

Batch ID: batch-B1b
Plan: /home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/plan/B1-transcription.md
Branch: feat/recording-reliability-b5 (run branch — accumulate; no commit)
Requirements assigned: R1.5 R1.6 R1.7 R1.8 R1.9 (backend)
North-star anchors: Issue #1, decision 2026-06-23-transcription-architecture.md (D-4 OpenRouter, D-6 versioning).
Lifecycle: pre-live — Deferral OFF. No TODO/FIXME/follow-up shims without a queue.md row this run. Uncertainty = STATUS: NEEDS-INFO.

Estimated duration: SHORT/atomic-ish — 30min (backend only; UI is the separate B1c slice)

Effort tier (PROJCORE-PROPOSED): medium · validator=codex55 (artifact-proof). Why: well-scoped backend integration + storage.

Context:
B1a made per-person the sole transcription source (owner-only labels, zero `?`). Now make the transcriber PLUGGABLE + VERSIONED. Today `backend/src/modules/recording/index.ts` has an INERT `transcribeViaThirdParty` stub (~L558) that logs "integration pending" and a single `<file>.transcript.json` overwritten on re-run. Decision: cloud = OpenRouter (one key → many STT models via its OpenAI-compatible `POST https://openrouter.ai/api/v1/audio/transcriptions`); local Whisper stays the free default; transcripts become versioned per (recording × provider × model). NOTE: `OPENROUTER_API_KEY` is NOT set yet (JROM provides later) — build it so it works by config alone, MOCK-test it, and missing key = logged no-op (never errors the call path).

Requirements (verbatim):
"R1.5 Pluggable transcriber — local Whisper models selectable (small/medium/large-v3); transcript records which model produced it. R1.6 At least one real cloud STT vendor integrated behind the seam (OpenRouter) — normalized owner-labeled timestamped lines. R1.7 Bilingual Tagalog+English on the chosen path. R1.8 Versioned transcription: store transcripts per (recording×provider×model), keep multiple, delete one, mark one primary — without destroying others. R1.9 Fail-safe: provider with no key/endpoint = logged no-op, never errors the recording path."

Expected (acceptance — implement ALL, BACKEND only):
1. R1.6/R1.7: Replace the inert `transcribeViaThirdParty` with a real OpenRouter call — `POST https://openrouter.ai/api/v1/audio/transcriptions` with `Authorization: Bearer $OPENROUTER_API_KEY`, model from config, multipart audio; normalize the response to the SAME `{lines, words}` schema as local (owner-labeled from the per-person file's participant.json owner — same owner-only rule as B1a; timestamped). Handle the 25MB/file limit (skip+log if over, or note chunking as a follow-on queue row). Multilingual (Tagalog+English) — do not force a language.
2. R1.9: If `OPENROUTER_API_KEY` unset (or provider=local) → logged no-op for the cloud path; the recording/call path NEVER errors. Provider selection via existing `getTranscriptionProvider` (extend its meaning to 'local'|'openrouter').
3. R1.5: model passthrough — the chosen model id (local whisper size OR an OpenRouter model like `openai/whisper-1`, `openai/gpt-4o-transcribe`) flows to the transcriber and is recorded in the transcript payload (`model` + new `provider` field).
4. R1.8 (backend): store transcripts keyed by (recording × provider × model), e.g. `<file>.transcript.<provider>-<model>.json` (sanitize the model id for the filename); a per-recording (or per-session) "primary" pointer; endpoints to: add a transcription (provider+model) [reuse/extend the existing on-demand transcribe endpoints], LIST versions for a recording/session, DELETE one version, SET primary. Existing single `<file>.transcript.json` read paths migrate to resolve the primary version (back-compat: treat a bare `.transcript.json` as a legacy version).
5. Tests: a MOCKED OpenRouter HTTP test → normalized owner-labeled transcript; missing-key → no-op (R1.9); versioning: two model runs coexist, delete one leaves the other, primary resolves.

Likely files:
- backend/src/modules/recording/index.ts (transcribeViaThirdParty, spawnTranscription provider/model selection ~L504/540/576, transcript path helpers, on-demand endpoints, named-transcript primary resolution)
- backend/src/modules/questions/store.ts (TranscriptionProvider enum → add 'openrouter'; model getters)
- backend/scripts/transcribe.py (only if the local path needs the model/provider field in payload — keep owner-only)
- backend tests (recording.test.ts or a new spec)

Scope:
- BACKEND ONLY. Do NOT build the frontend selector/versioning UI (that's B1c).
- Do NOT change B1a's owner-only labeling or the recording/upload path (B5).
- Do NOT commit. Tight diff. Key stays in `.env` (never hardcode); never echo the key value.
- Robust proof: mocked HTTP (no live key), assert the normalized OUTPUT (owner-labeled + provider/model recorded) + versioning behavior.

Plan handshake (MANDATORY):
1. Read brief + files. 2. Reply PROPOSED: mechanism + files + risks + estimate. 3. Confirm/counter tier. 4. End with STATUS: PROPOSED — <approach> · complexity: <x> · why: <one line>. 5. Wait for APPROVED-PLAN. 6. On REVISE-PLAN, fix + re-emit.
After APPROVED-PLAN: 7. Implement; typecheck TS; run the mocked tests. 8. STATUS: DONE when green.

Required artifacts: batch-B1b/{scenarios,changes,review,test-report,independent-validation}.md + decisions/<date>-<slug>.md (or "Autonomous decisions: none").

---

## Streaming-order mandate
Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below) — not the first sentence, the first TOOL CALL, BEFORE any prose tokens stream. Append first, prose after.

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B1b <STATE> "<note>"
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
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B1b[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <same short note>`. Callback file wins on mismatch.
