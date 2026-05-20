# Batch FIXC7 — Question library + Settings UI + auto/manual execution

**Persona:** Codex builder, `-s danger-full-access`. FIXC1-6 PASSED. R8.1 holds 16 consecutive batches. **COMMIT BEFORE STATUS: DONE.**

## Scope: requirements R-C-9, R-C-11, R-C-12

JROM verbatim:
> "yes have a way to add a question library that we can setup and have it run either automatically or on-demand using the LLM choices."
> "have an option to change default by the star or something"

Spec rows:
- **R-C-9** Settings UI lists all three providers (Claude, Codex, Ollama) with star-icon default-selector. Star-click sets the global default; per-question override available in question-library UI.
- **R-C-11** Question library CRUD. Each question: `{id, name, prompt, autoRun:bool, providerOverride:nullable, isDefault:bool}`.
- **R-C-12** Question execution. On transcript-ready event, every `autoRun:true` question executes and writes `<audio>.analysis.<question-slug>.json`. Transcript-view page has manual Run button per question + results panel. Results persist across reloads.

## Branch

```
git checkout -b fix/meet-fixc7-question-library fix/meet-fixc6-ollama-benchmark
```

## Implementation (your discussion-phase plan)

> Files: new migration for questions/settings, backend/src/modules/questions/* or llm/*, recording/index.ts, frontend/src/app/pages/settings-*, frontend/src/app/pages/transcripts/*, new frontend service, backend tests, Playwright specs.
> Approach: SQLite-backed question CRUD with {id,name,prompt,autoRun,providerOverride,isDefault}; settings UI lists providers with star default; transcript view has Run buttons/results panel; auto-run hooks from transcribe child close success and writes <audio>.analysis.<slug>.json.
> Gotcha: run auto questions sequentially per transcript to avoid Ollama OOM and CLI contention.
> Tests: backend CRUD + execution sidecar; Playwright create/edit/star/delete, manual run, auto-run persistence after reload.
> Commits: 3.

### Backend

1. **Migration:** `backend/db/migrations/0004_questions_and_llm_settings.sql` (or whatever the next number is)
   - Table `questions`: `id TEXT PK, name TEXT NOT NULL, prompt TEXT NOT NULL, auto_run INTEGER NOT NULL DEFAULT 0, provider_override TEXT, is_default INTEGER NOT NULL DEFAULT 0, owner_email TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL`
   - Table `llm_settings`: `key TEXT PK, value TEXT NOT NULL, owner_email TEXT NOT NULL, updated_at INTEGER NOT NULL` (used to persist the default provider — e.g., key `default_provider` value `ollama`)
   - Migration must be idempotent (CREATE TABLE IF NOT EXISTS)
   - Seed 2 default questions for first-time users: "Summarize meeting" (autoRun=true) and "Extract action items" (autoRun=false). Use the same prompts from FIXC6's benchmark, lightly polished.

2. **New module `backend/src/modules/questions/`:**
   - `store.ts` — better-sqlite3-backed CRUD: `listQuestions(ownerEmail)`, `getQuestion(id, ownerEmail)`, `createQuestion(...)`, `updateQuestion(id, patch, ownerEmail)`, `deleteQuestion(id, ownerEmail)`, `setDefault(id, ownerEmail)`. Plus `getLlmSetting(key, ownerEmail) / setLlmSetting(key, value, ownerEmail)` for the default-provider toggle.
   - `index.ts` — Express router:
     - `GET /api/questions` → list
     - `POST /api/questions` → create
     - `PUT /api/questions/:id` → update
     - `DELETE /api/questions/:id` → delete
     - `POST /api/questions/:id/star` → set as default (set `isDefault=1` on this, `=0` on all others for the owner)
     - `GET /api/llm/settings` → return `{ defaultProvider: 'claude'|'codex'|'ollama' }`
     - `PUT /api/llm/settings` → update default provider (body `{ defaultProvider }`)
     - `POST /api/recordings/:filename/analyze` → manual analyze: body `{ questionId, providerOverride? }`. Loads the question, loads the transcript, calls `LlmService.get(provider).invoke({prompt})` where prompt = `${question.prompt}\n\n${transcriptText}`. Writes sidecar `<filename>.analysis.<question-slug>.json` (slug = kebab-case of question name). Returns the result. Auth + ownership-gated.
     - `GET /api/recordings/:filename/analysis` → list all analysis sidecars for this recording with their content
   - All endpoints auth-gated + ownership filter.

3. **Auto-run hook:** in `backend/src/modules/recording/index.ts`, when the transcribe child-process closes successfully (currently the path that writes `<file>.transcript.json`), iterate `autoRun=true` questions and run them sequentially. Use a per-recording queue so concurrent uploads don't overwhelm Ollama. Log per-question start/finish to PM2 stdout. Don't await — let the recording endpoint return; analysis happens in background.

4. **Recording-delete cascade:** when the recording is deleted, also remove all `<file>.analysis.*.json` sidecars (extend the existing unlink loop).

5. **Backend tests** (`backend/tests/questions.test.ts` + `backend/tests/llm-settings.test.ts` + `backend/tests/analyze-endpoint.test.ts`):
   - questions CRUD round-trip (create → list → update → star → delete)
   - star endpoint flips `isDefault` to one row only
   - llm-settings GET/PUT round-trip
   - analyze endpoint loads question + transcript, calls a mocked `LlmService`, writes sidecar
   - Recording delete also removes analysis sidecars
   - Auth required on all new endpoints
   - Ownership filter: user A can't see user B's questions

### Frontend

1. **New service:** `frontend/src/app/services/questions.service.ts`
   - `list()`, `create(name, prompt, autoRun, providerOverride?)`, `update(id, patch)`, `delete(id)`, `setDefault(id)`, `getLlmSettings()`, `setDefaultProvider(id)`, `analyze(filename, questionId, providerOverride?)`, `listAnalyses(filename)`

2. **Settings page:** new `frontend/src/app/pages/settings/settings.page.{ts,html,scss}` (or extend the existing settings page if one exists — check `app.routes.ts`)
   - **Section A: LLM Provider Default**
     - 3 rows (Claude, Codex, Ollama) with star icon
     - Click star → calls `setDefaultProvider('claude'|'codex'|'ollama')`, refreshes UI, star fills on the chosen row
   - **Section B: Question Library**
     - Table of questions: Name | Prompt (truncated) | Auto-run toggle | Provider override (dropdown w/ "default" option) | Star (set as default) | Edit/Delete actions
     - "New question" button opens an inline form or modal: Name + Prompt + Auto-run checkbox + Provider override dropdown + Save
   - **Section C: Transcriber model** (placeholder for FIXC8; OK to leave a stub)

3. **Transcripts page additions:**
   - Below the existing transcript viewer, add an **Analysis** panel
   - For each question in the library, show a row: Question name + "Run" button + (if an analysis sidecar exists) the result text
   - Manual Run button calls `analyze(filename, questionId)`, shows a spinner, then renders the result
   - Auto-run results show automatically when present
   - Persist across reload (server-backed via `listAnalyses`)
   - Auto-poll every 5s when analyses are pending (transcribeStatus pending + autoRun:true questions present)

### Defaults (per FIXC6 ranking)

- Default LLM provider on first boot: **`ollama`** (cheap, local, private). Persist via `llm_settings` so JROM can change it.
- For Ollama, when no `providerOverride.model` is set, the analyze endpoint should pass `model: 'mistral-nemo:12b'` (rank 1 from FIXC6).
- Seed questions:
  1. "Summarize meeting" — autoRun=true, isDefault=true, prompt = the FIXC6 summarize prompt
  2. "Extract action items" — autoRun=false, prompt = the FIXC6 action-items prompt

### Test plan (Playwright)

`e2e/tests/v3-fixc7-question-library/question-library.spec.ts`:

1. **FIXC7.1 — Settings page lists providers + question library.** Visit `/app/settings`, assert 3 provider rows + at least 2 seed questions.
2. **FIXC7.2 — Star sets default provider.** Click star on Ollama row, refresh, assert it remains starred.
3. **FIXC7.3 — Create new question.** Click "New question", fill fields, save, assert appears in list.
4. **FIXC7.4 — Edit + delete question.** Edit a question's prompt, delete it, assert list shrinks.
5. **FIXC7.5 — Manual Run on transcript shows result.** Visit transcripts page, open a transcript that has ≥1 question in the library, click Run, assert result text appears (mock the LLM call via env var if needed for determinism).
6. **FIXC7.6 — Auto-run sidecar persists across reload.** Create a question with autoRun=true. Trigger a transcribe (use existing FIXC4 seed pattern), wait for transcript-ready, assert auto-run sidecar appears on disk + the transcripts page shows the analysis result. Reload page, assert result persists.

Mock the LLM provider in tests to avoid burning real API/local-CPU time. Codex CLI mock: stub `child_process.spawn` for `codex exec`. Or use Ollama with a fast prompt like "Reply: ok" against `qwen2.5:7b`.

## Required artifacts at `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc7/`

1. `changes.md`
2. `scenarios-implemented.md`
3. `test-report.md`
4. `review.md`
5. `independent-validation.md` (placeholder)
6. `screenshots/settings-question-library.png` (full Settings page with provider stars + question table)
7. `screenshots/transcript-with-analysis.png` (transcript viewer showing an analysis result)

## Build + deploy

- Backend build + tests PASS
- Frontend build PASS
- Migration runs cleanly on existing DB (`backend/data/meet-poc.sqlite`) — questions + llm_settings tables created, default questions seeded
- `pm2 restart meet-poc-fe meet-poc-be`
- Live URL smoke: visit `/app/settings`, see the new sections; visit `/app/transcripts`, open a transcript, click Run on a question

## Validation gates (your self-checks)

- [ ] Tree clean before STATUS: DONE
- [ ] `npm test -w backend` PASS — expect ≥95/95 (81 prior + ~15 new)
- [ ] `npm test -w e2e -- tests/v3-fixc7-question-library --config=playwright.live.config.ts --workers=1` PASS
- [ ] Run 1 regression PASS — R8.1's 17th consecutive batch

## Completion

End with STATUS: DONE. I'll validate independently before dispatching FIXC8.
