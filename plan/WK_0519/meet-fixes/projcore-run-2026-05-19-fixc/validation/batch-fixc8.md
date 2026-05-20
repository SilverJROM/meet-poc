# FIXC8 — Projcore Independent Validation

**Verdict: PASS — VERIFIED. This closes R-C-13 — the FINAL requirement. Run is requirements-complete.**

> v2.0 plan-handshake worked cleanly: codex replied STATUS: PROPOSED (reuse llm_settings + WHISPER_MODEL env), projcore reviewed + sent APPROVED-PLAN with an owner-derivation-fallback note, codex implemented, callback-first watcher caught the DONE callback (no scrollback miss).

## Independent test execution (projcore, separate from codex's run)

| Gate | Command | Result |
|---|---|---|
| 1 | `git branch --show-current` | `fix/meet-fixc8-transcriber-config` |
| 2 | `git log --oneline -1` | b004d09 feat: add transcriber model setting (23 files, 652+/17-) |
| 3 | FIXC8 diff scope | transcribe.py (model arg), questions store+index (transcriber_model), recording spawn, settings page dropdown, tests, e2e spec, decision log — all in-scope for R-C-13 |
| 4 | `transcriber_model` persisted | `data/meet-poc.sqlite` llm_settings → `jrom@silverjrom.app:transcriber_model = medium` |
| 5 | `npm test -w backend` | **93 passed / 1 skipped** in 15.77s (+2 vs FIXC7: transcriber-model store + spawn-env tests) |
| 6 | `npm test -w e2e -- tests/v3-fixc8-transcriber-config --config=playwright.live.config.ts --workers=1` | **3/3** PASS in 9.3s |
| 7 | Run 1 regression (+FIXC8) | **67/67** PASS in 2.6m (R8.1 → 18 consecutive batches) |
| 8 | Spec evidence quality (§2.9 grep) | 11 real `page.goto/click/locator/getByRole/getByText` calls across 3 tests — genuine DOM exercise |

## Evidence Quality Gate (§1.11, 5 questions)

- **Q1 — Scenario coverage:** PASS. FIXC8.1 navigates to `/app/settings`, asserts the dropdown renders 3 options with medium default. FIXC8.3 forces a re-transcribe and asserts the resulting sidecar's `model` field.
- **Q2 — Proof at right level:** PASS. UI (dropdown render + persist + reload) proven via DOM; the transcribe-wiring proven via the sidecar `model` field assertion (the actual R-C-13 mechanism), not just a 200.
- **Q3 — Screenshot accuracy:** PASS. `settings-transcriber-dropdown.png` shows the real Transcriber Model section with the 3-option dropdown (medium selected) + option descriptions.
- **Q4 — Scenario-to-test consistency:** PASS. 3 scenarios map 1:1 to 3 tests.
- **Q5 — Requirement closure:** PASS. The dropdown is observable, the selection persists, and the selected model flows into transcription output (sidecar model field). R-C-13 fully delivered.

## Implementation spot-check

- **`transcribe.py`:** `candidate = (cli_model or os.environ.get("WHISPER_MODEL") or "medium")`, validated against `VALID_MODELS` (small/medium/large-v3), `--model` CLI arg added. `WhisperModel(model_name, ...)` uses the resolved model. Writes the model into the sidecar.
- **`questions/store.ts` + `index.ts`:** `transcriber_model` added to the owner-scoped settings store; GET/PUT `/api/llm/settings` extended with partial-update support (FIXC7's provider-default save still works).
- **`recording/index.ts`:** spawn passes the persisted `transcriber_model` as `WHISPER_MODEL` env; medium fallback when owner/setting can't be resolved (the approval note — confirmed in the diff).
- **`settings.page`:** Transcriber Model stub replaced with a real dropdown + persist-on-change + reload of persisted value.
- **Decision log:** `decisions/2026-05-20-fixc8-transcribe-test-stub.md` documents the test-stub choice for FIXC8.3 (avoids a real ~460MB small-model pull in CI) per §1.15.

## FIXC8.3 mechanism proof

The key R-C-13 proof: FIXC8.3 sets the model to a non-default value, forces a re-transcribe through a stubbed worker that echoes `WHISPER_MODEL` into the sidecar, and asserts the sidecar `model` field reflects the selection. This proves the persisted setting → spawn env → worker → sidecar chain end-to-end without a slow real-model download (stub decision logged).

## Requirement closure

| Req | Status |
|---|---|
| R-C-13 — Transcriber model dropdown (small/medium/large-v3) | **VERIFIED** |

## Regression check (R8.1)

18 consecutive batches now pass Run 1 desktop regression (67/67 = 64 prior + 3 new FIXC8 tests).

## Hygiene note

After the Run 1 regression, prior-batch committed screenshots showed timestamp/metadata churn (e2e specs regenerate them). Restored via `git checkout -- '*.png'` — not part of FIXC8. Tree clean except the expected `callbacks.md` append.
