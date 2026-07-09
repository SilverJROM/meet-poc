# B03 Validation: Fixed-Clock Conversation Harness

## Verdict
PASS

## Target
- Commit: `27a5ef7a5f4e604a12daee8ed5bb33f933f927ae`
- Branch/HEAD: `batch-01-diagnosis-2026-07-08`
- Scope: fixed-clock conversation scheduler, async LLM brain path, pre-generated/synthetic speech assets

## Required Reproduction

Command:

```bash
cd /home/agjrom/websites/meet-poc/e2e
npx vitest run harness/__tests__/conversation-scheduler.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       19 passed (19)
Duration    6.35s
```

## Invariant Checks

| Check | Result | Evidence |
|---|---:|---|
| Speech path never awaits LLM | PASS | `ConversationScheduler.schedule()` triggers playback with `play(slot).catch(...)` and does not await playback or brain state. `AsyncBrain.dispatch()` returns `void`. |
| Fixed clock is independent of brain latency | PASS | Integration test dispatches a 2-second LLM invocation, scheduler completes in under 1 second, brain remains pending, and scheduled utterances are still `allOnTime`. |
| Pre-generated assets exist or are synthetic | PASS | Committed fixtures exist under `e2e/fixtures/bot-speech/`: six WAV files, two manifests, README, and `generate-synthetic-wavs.ts`. |

## Notes

- The requested test command was executed exactly from `e2e/`.
- Asset presence was verified directly because the manifest test is optional and checks existence before loading.
- No code changes were made; only this requested validation artifact was added.

## Callback

validator B03 STATUS: DONE — PASS
