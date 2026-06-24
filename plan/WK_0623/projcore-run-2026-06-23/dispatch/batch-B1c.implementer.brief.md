<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B1c: Transcription UI — per-transcription model/provider picker + versioning (add / list / delete / set-primary)

Batch ID: batch-B1c
Plan: /home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/plan/B1-transcription.md
Branch: feat/recording-reliability-b5 (run branch — accumulate; no commit)
Requirements assigned: R1.5 (UI) R1.8 (UI)
Lifecycle: pre-live — Deferral OFF. Uncertainty = STATUS: NEEDS-INFO.

Estimated duration: SHORT/atomic — 30min. Effort: medium · validator=codex55 (UI-PROOF).

Context:
B1b shipped the BACKEND: OpenRouter provider + versioned transcripts per (recording×provider×model) with endpoints — `GET /api/recordings/:filename/transcript/versions`, `DELETE /api/recordings/:filename/transcript/versions` (body: provider, model), `PUT /api/recordings/:filename/transcript/primary` (body: provider, model), and add-a-transcription via `POST /api/recordings/:filename/transcribe` (body: force, provider, model). Now build the FRONTEND so the host can try different transcribers + manage versions. JROM: "i can select to add a new transcription and delete a previous one on a given meeting so i can pick a better one."

Expected (acceptance — implement ALL, FRONTEND only):
1. R1.5/R1.8: On the transcripts/recordings view (frontend/src/app/pages/transcripts/), for a recording show its transcript VERSIONS (from the versions endpoint), each labeled by provider+model, with the PRIMARY marked.
2. "Add transcription" control: pick a provider (local | openrouter) + model (local: small/medium/large-v3; openrouter: e.g. openai/whisper-1, openai/gpt-4o-transcribe — a small curated list is fine), then POST to the transcribe endpoint with {force:true, provider, model}. New version appears (poll/refresh) without destroying existing ones.
3. Delete a version (DELETE endpoint) — other versions remain.
4. Set a version primary (PUT primary endpoint) — the primary marker moves; the main transcript view shows the primary.
5. Wire the client service (frontend/src/app/services/recordings.service.ts or questions.service.ts) with the 4 calls. Reflect provider+model in the displayed transcript metadata.

Likely files:
- frontend/src/app/pages/transcripts/transcripts.page.{ts,html,scss}
- frontend/src/app/services/recordings.service.ts (and/or questions.service.ts)
- (maybe) frontend/src/app/pages/settings/* if a default provider/model selector belongs there (optional — keep minimal)

Scope:
- FRONTEND only. Backend endpoints already exist (B1b) — do NOT change them.
- Minimal, clean UI consistent with the app's existing transcripts page style (density-light per JROM).
- Do NOT commit. Build the frontend (`cd frontend && npm run build`) until green.
- Proof: rendered DOM — a Playwright/headless check (or screenshot) showing the versions list + add/delete/set-primary controls + the primary reflected. (UI-PROOF, not API-only.)

Plan handshake (MANDATORY): 1. Read brief + the B1b endpoints + the transcripts page. 2. PROPOSED: mechanism + files + risks + estimate. 3. Confirm/counter tier. 4. End STATUS: PROPOSED — <approach> · complexity: <x> · why: <one line>. 5. Wait APPROVED-PLAN. 6. REVISE→re-emit.
After APPROVED-PLAN: 7. Implement; build green; capture a rendered-DOM proof. 8. STATUS: DONE.

Required artifacts: batch-B1c/{scenarios,changes,review,test-report,independent-validation}.md + screenshots/ + decisions/<date>-<slug>.md (or "Autonomous decisions: none").

---

## Streaming-order mandate
Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below) — not the first sentence, the first TOOL CALL, BEFORE any prose tokens stream. Append first, prose after.

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B1c <STATE> "<note>"
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
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B1c[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <same short note>`. Callback file wins on mismatch.
