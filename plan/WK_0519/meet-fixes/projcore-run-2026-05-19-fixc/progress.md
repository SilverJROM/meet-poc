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
