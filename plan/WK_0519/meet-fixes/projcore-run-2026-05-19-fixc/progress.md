# Run C — Progress

## 2026-05-19 — Run started

- Codex session: `lkcdx-meet-v4` (Pattern 2, tmux watch)
- Model: codex (gpt-5-codex high)
- Persona: codex builder, `-s danger-full-access`
- Projcore model: Opus 4.7 (per skill recommendation)

## Discussion phase

- **COMPLETE (4m 07s codex wall time).** Codex confirmed CLI smokes (Claude sonnet ✅, Codex literal `spark` ❌ → `gpt-5.3-codex-spark` ✅, Ollama active+generate ✅), inventoried installed Ollama models, proposed curated benchmark set (qwen2.5:14b-instruct, mistral-nemo:12b, phi4:14b, gpt-oss:20b, gemma2:9b), authored per-batch outline (~14 commits across 8 batches).
- **3 minor implementation alignments resolved by projcore** (codex model full-ID, Ollama candidate swap phi3→phi4, /join/:id route alias). See `decisions/2026-05-19-fixc-discussion-alignment.md`. No material disagreements requiring JROM escalation.
- og-requirements.md updated with corrected Codex model ID.
- **Next:** dispatch FIXC1 (camera-light fix) pending JROM ack.

## Batch log

### FIXC1 — Camera-light bug fix — **VERIFIED PASS** (2026-05-19, codex wall time 12m 17s)

- Branch: `fix/meet-fixc1-camera-light`
- Commits: a3b5b9a docs seed, 6e305f6 fix(frontend), b0e962e docs evidence
- Backend: 59/59, FIXC1 e2e: 4/4, Run 1 regression: **49/49** (R8.1 → 11 consecutive)
- Live URL HTTP 200, public smoke PASS, TEST_ROOM01 preserved
- R-C-3 → VERIFIED (browser-side); JROM hardware smoke is the final proof
- See `batch-fixc1/independent-validation.md`

### FIXC2 — Device modal + in-call hot-swap — **VERIFIED PASS** (2026-05-19, codex wall time 15m 19s)

- Branch: `fix/meet-fixc2-device-modal`
- Commits: 3cbcd71 fix(frontend): add device test dialog (21 files, 1083+/7-)
- Backend: 59/59, FIXC2 e2e: 4/4, Run 1 regression: **53/53** (R8.1 → 12 consecutive)
- Screenshots: lobby-modal.png + in-call-dialog.png (both soft-light theme conforming)
- R-C-1 → VERIFIED (with 650ms auto-start nuance flagged for JROM hardware smoke)
- R-C-2 → VERIFIED
- See `batch-fixc2/independent-validation.md`

### FIXC3 — Screen-share layout reflow — **VERIFIED PASS** (2026-05-19/20, codex wall time 18m 58s)

- Branch: `fix/meet-fixc3-share-reflow`
- Commits: 2894e40 fix(frontend): reflow screen share layout (21 files, 758+/21-)
- Backend: **60/60** (+1 new signaling test), FIXC3 e2e: 2/2, Run 1 regression: **55/55** (R8.1 → 13 consecutive)
- Screenshots: share-strip.png + share-collapsed.png (active-speaker float visible, soft-light conforming)
- R-C-4 → VERIFIED (single-sender caveat noted: remote camera tile is replaced by screen share when remote peer shares; local sharer unaffected)
- See `batch-fixc3/independent-validation.md`

### FIXC4 — Transcript delete + subtitle-style .txt download — **VERIFIED PASS** (2026-05-20, codex wall time 7m 35s)

- Branch: `fix/meet-fixc4-transcript-tools`
- Commits: 6823e9d fix(transcripts): add txt download and transcript delete (14 files, 616+/2-)
- Backend: **65/65** (+5 new endpoint tests), FIXC4 e2e: 3/3, Run 1 regression: **58/58** (R8.1 → 14 consecutive)
- Screenshot: transcripts-with-download-delete.png
- R-C-5 + R-C-6 + R-C-7 → all VERIFIED (R-C-7 by existing rooms-bulk-delete coverage)
- See `batch-fixc4/independent-validation.md`

## Halfway gate (4/8 batches, 7/13 requirements verified)

R-C-1, R-C-2, R-C-3, R-C-4, R-C-5, R-C-6, R-C-7 all VERIFIED. Remaining: R-C-8 (LLM providers), R-C-9 (settings UI), R-C-10 (Ollama benchmark), R-C-11/12 (question library), R-C-13 (transcriber dropdown). Run 1 holds at 14 consecutive PASS.
