Batch-FIXC8: Configurable transcriber model (Whisper small / medium / large-v3)

Batch ID: fixc8
Plan: plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/implementation-plan.md
Branch: fix/meet-fixc8-transcriber-config (off fix/meet-fixc7-question-library tip)
Requirements assigned: R-C-13
Estimated duration: MEDIUM — 60min

**Protocol note:** This run is now on projcore v2.0. Two changes from prior FIXC batches:
1. **Plan handshake BEFORE code** — reply STATUS: PROPOSED first; wait for projcore APPROVED-PLAN before implementing.
2. **Callback discipline** — as the FINAL action of every STATUS-change reply, append one line to `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/callbacks.md`:
   `[projcore callback] fixc8 <STATE> <one-line note>`
   (projcore's watcher tails that file — bare STATUS tokens in the pane are missed.)

## Requirements section (verbatim from og-requirements.md)

> **R-C-13** Configurable transcriber model. Settings dropdown for Whisper model size: `small` / `medium` (current default) / `large-v3`. transcribe.py reads model from env or config; download triggered on first use.

JROM verbatim: *"and have an option as well to change the transciber as well on the config."*

## Observed (current state)

- `backend/scripts/transcribe.py` hardcodes `WhisperModel("medium", device="cpu", compute_type="int8")`.
- The transcript sidecar JSON already carries a `model` field (set to "medium" today).
- FIXC7 added a `llm_settings` table (key/value/owner_email) + a "Transcriber Model" stub section on the Settings page ("Local Whisper transcription is managed by the backend runtime.").
- FIXC7 added the `/api/llm/settings` GET/PUT pattern — reuse the same settings-persistence approach.

## Expected (acceptance criteria)

1. Settings page "Transcriber Model" section becomes a real dropdown: `small` / `medium` / `large-v3`, defaulting to the persisted value (medium on first boot).
2. Selecting a value persists it (reuse `llm_settings` table with a new key like `transcriber_model`, or a parallel settings store — your call, justify in PROPOSED).
3. `transcribe.py` reads the model from an env var (e.g. `WHISPER_MODEL`) or CLI arg; the backend transcribe-spawn passes the persisted setting.
4. The written transcript sidecar's `model` field reflects the selected model.
5. Default stays `medium`; `large-v3` downloads on first use (do NOT pre-download large-v3 in this batch — it's ~3GB; just wire the path).

## Likely files

- `backend/scripts/transcribe.py` — accept model from env/arg, default medium
- `backend/src/modules/recording/index.ts` — pass persisted transcriber model into the spawn env
- backend settings route — extend the FIXC7 settings store with `transcriber_model` (GET/PUT)
- `frontend/src/app/pages/settings/settings.page.*` — replace the Transcriber Model stub with a real dropdown
- `frontend/src/app/services/questions.service.ts` (or a settings service) — add get/set transcriber model
- backend tests + new e2e spec `e2e/tests/v3-fixc8-transcriber-config/`

## Scope

- Implement only R-C-13.
- Do NOT pre-download large-v3 (just wire the selection path; document that first large-v3 use triggers the ~3GB download).
- Do NOT change the LLM provider settings or question library (FIXC7 — done).
- Surgical only. No "while I'm in here" scope creep.

## Plan handshake protocol (MANDATORY before implementation)

1. Read this brief in full + the referenced files.
2. Reply with PROPOSED approach: where you'll persist the setting (reuse llm_settings vs new table — justify), how transcribe.py receives the model, how the spawn passes it, planned files, risks, estimate confirmation.
3. End reply with: `STATUS: PROPOSED — <one-line approach summary>` AND append the callback line to callbacks.md.
4. WAIT for projcore APPROVED-PLAN before writing code.
5. If projcore returns REVISE-PLAN, address the gaps, re-emit STATUS: PROPOSED.

## After APPROVED-PLAN

6. Implement on branch fix/meet-fixc8-transcriber-config.
7. COMMIT BEFORE STATUS: DONE (FIX-B1 pattern: ~2 commits — feat code + test/docs).
8. Reply STATUS: DONE when build + targeted tests green, with the usual block (branch, commits, test counts, screenshot).

## Test plan (Playwright)

`e2e/tests/v3-fixc8-transcriber-config/transcriber-config.spec.ts`:
1. FIXC8.1 — Settings dropdown renders with 3 options, default = persisted value.
2. FIXC8.2 — Changing the dropdown persists (PUT), survives reload.
3. FIXC8.3 — Force a re-transcribe with the model set to `small`, assert the resulting sidecar's `model` field == `small`. (Use the existing FIXC4/FIXB4 synthetic recording so it's fast — small model is ~460MB, may need a one-time pull; if the pull is too slow for CI, stub transcribe.py to echo the env model into the sidecar and document the stub.)

## Required artifacts at plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc8/

1. changes.md (User Report verbatim + Root Cause/mechanism + per-file WHY)
2. scenarios.md
3. review.md
4. test-report.md
5. screenshots/settings-transcriber-dropdown.png
6. batch-fixc8/independent-validation.md (your fresh-context validator view)
7. decisions/<date>-fixc8-*.md per §1.15 — OR state "Autonomous decisions: none — all matched brief defaults."

## Build + deploy

- Backend build + tests PASS
- Frontend build PASS
- pm2 restart meet-poc-fe meet-poc-be
- Live smoke: visit /app/settings, change the transcriber dropdown, confirm it persists on reload

## Validation gates (your self-checks)

- [ ] Tree clean before STATUS: DONE
- [ ] npm test -w backend PASS (≥93)
- [ ] npm test -w e2e -- tests/v3-fixc8-transcriber-config --config=playwright.live.config.ts --workers=1 PASS
- [ ] Run 1 regression PASS (the 64-spec set + new FIXC8) — R8.1's 18th consecutive batch
- [ ] screenshots/settings-transcriber-dropdown.png captured

## Completion protocol

End every reply with `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <short reason>` AND append `[projcore callback] fixc8 <STATE> <note>` to callbacks.md as the final action.
