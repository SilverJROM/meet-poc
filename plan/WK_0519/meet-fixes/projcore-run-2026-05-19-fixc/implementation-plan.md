# Implementation Plan — Run C

ONE codex session (`lkcdx-meet-v4`, `-s danger-full-access`), 8 batches, each gated by independent projcore validation. Discussion phase first.

## Branch strategy

Per-batch branch (mirrors fixb pattern):

- FIXC1 → `fix/meet-fixc1-camera-light`
- FIXC2 → `fix/meet-fixc2-device-modal`
- FIXC3 → `fix/meet-fixc3-share-reflow`
- FIXC4 → `fix/meet-fixc4-transcript-tools`
- FIXC5 → `fix/meet-fixc5-llm-providers`
- FIXC6 → `fix/meet-fixc6-ollama-benchmark`
- FIXC7 → `fix/meet-fixc7-question-library`
- FIXC8 → `fix/meet-fixc8-transcriber-config`

Discussion-phase decisions land on `plan/` only (no code branch).

## Batch dependency graph

```
FIXC1 (independent, fastest)
   ↓
FIXC2 (device modal — touches lobby/join flow)
   ↓
FIXC3 (screen-share layout — touches grid + sidebar)
   ↓
FIXC4 (transcript delete/download — touches transcripts page only)
   ↓
FIXC5 (LLM provider abstraction — backend foundation)
   ↓
FIXC6 (Ollama benchmark — uses FIXC5 wrapper to call providers)
   ↓
FIXC7 (question library — uses FIXC5 wrapper, FIXC6 default model)
   ↓
FIXC8 (transcriber dropdown — settings UI extension)
```

Strict sequential dispatch. No parallelism inside a single codex session.

## Per-batch gates (projcore-side)

1. Codex `STATUS: DONE` posted
2. Tree clean on per-batch branch
3. `npm run build -w backend && npm run build -w frontend` PASS
4. `npm test -w backend` PASS (full suite — Run 1 regression target = 59/59 + new tests)
5. `npm test -w e2e -- <new-spec> --config=playwright.live.config.ts --workers=1` PASS
6. Run 1 desktop regression PASS (40 tests minimum; grows as new specs land)
7. Live URL smoke: Playwright screenshot of the touched surface
8. On-disk artifact verification (e.g., sidecar JSON well-formed, settings persistence survives backend restart)
9. Decision log row written if non-trivial autonomous choice was made

Each batch produces `batch-fixc<N>/` folder with `changes.md`, `scenarios-implemented.md`, `test-report.md`, `review.md`, `independent-validation.md`, `screenshots/`.

## Test authority

- Targeted Playwright specs per batch: authorized
- Run 1 desktop regression after every batch: authorized
- Backend full suite after every batch: authorized
- Manual operator validation on real hardware (camera LED for FIXC3): JROM's call at the end

## Stop policy

- Codex 3× fails the same gate → escalate to JROM with NEEDS-INFO
- Codex breaks commit-before-DONE rule → single-gap correction per §1.3.4 then re-validate (no full re-implementation)
- Codex proposes alternative that materially changes a locked requirement → escalate to JROM before accepting

## End-of-run deliverables

- All 13 R-C-X rows in `req-matrix.md` = VERIFIED
- `og-validation-report.md` summarizing each requirement vs. its evidence
- Decision logs mirrored to `~/.claude/JROM/decisions/` (per projcore §2.3)
- Weekly issue list entry for the original ask (`plan/WK_0519/list/2026-05-19-meet-ux-llm.md`)
- Codex session `lkcdx-meet-v4` closed
