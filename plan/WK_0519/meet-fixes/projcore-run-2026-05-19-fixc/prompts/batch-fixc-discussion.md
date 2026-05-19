# Run C — Discussion Phase (codex pre-build alignment)

**Persona:** Run as the codex builder. You have `-s danger-full-access`. Pattern 2 (tmux watch).

**No code yet.** Discussion phase only. Read the spec + batch plan, push back where unclear, propose per-batch implementation outline. STATUS: DISCUSSION-COMPLETE when aligned.

## Source

JROM verbatim brief at: `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/og-requirements.md`

Implementation plan at: `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/implementation-plan.md`

JROM explicit instruction: *"have you guys agree on the specs, plan and implementation"* before any code. After alignment, you build batch-by-batch. I (projcore) validate each batch with full Run 1 regression + new spec + live URL smoke before dispatching the next.

## What I need from you in this discussion

### 1. CLI flag verification (blocking — must resolve before FIXC5)

Confirm or correct the exact CLI invocations:

- **Claude sonnet:** I have `claude -p --model sonnet "<prompt>"`. Confirm flag name (`--model`? `-m`?), confirm `sonnet` is the right alias (or do we need `claude-sonnet-4-6` / similar?). Run a quick smoke: `claude -p --model sonnet "Reply with exactly: hello"` and tell me what you get.
- **Codex spark:** I have `codex exec --model spark "<prompt>"`. Confirm `exec` subcommand exists in current codex CLI, confirm `--model spark` accepted, confirm `spark` is the right alias. Run smoke. If `spark` isn't accepted, tell me the actual model ID (e.g. `gpt-5-spark`).
- **Ollama:** `curl -s http://localhost:11434/api/generate -d '{"model":"<model>","prompt":"<text>","stream":false}'`. Confirm Ollama is running (`systemctl is-active ollama` or `ps aux | grep ollama`). List currently installed models with `ollama list`.

### 2. Ollama candidates (blocking — must resolve before FIXC6)

Propose 3-5 local candidates for the benchmark. My starter list:
- `llama3.1:8b`
- `qwen2.5:14b-instruct`
- `mistral-nemo:12b`
- `phi3:medium`
- `gemma2:9b`

Tell me which of these are already installed (no pull needed) vs need pulling (and size). Propose additions or substitutions. **Constraint:** keep total disk for benchmark candidates under ~50 GB.

Benchmark task fixture: use a real transcript from the recordings/ directory if one has content; otherwise generate a synthetic 2-3 minute Taglish transcript via the same FFmpeg flite TTS approach we used for FIX-B4. Scoring rubric: accuracy (subjective 1-5 against a hand-written gold summary + action items) first, speed (wall-clock ms) second.

### 3. Per-batch implementation outline

For each of FIXC1 through FIXC8 (8 batches), give me:
- The files you expect to touch (or create)
- The key technical approach (especially for non-obvious ones below)
- Any gotchas you see that I haven't flagged
- Test plan (which Playwright spec, which backend test)
- Estimated commits count

**Non-obvious approach questions I want your opinion on:**

- **FIXC2 — mic VU meter:** AudioContext + AnalyserNode + RMS computation, render as animated bar? Confirm Chrome's getUserMedia preview-stream lifecycle works without disrupting the eventual "real" join.
- **FIXC2 — speaker test tone:** Generate via WebAudio OscillatorNode (440 Hz beep for 1s), or play a pre-recorded `.mp3`/`.wav`?
- **FIXC2 — custom permission overlay:** how do we bridge a styled "Click Allow when prompted" overlay with the actual browser `getUserMedia()` ask? Browser-natively we can't suppress the OS-level prompt — we can only stage our overlay BEFORE the request so the user knows what's coming. Confirm UX.
- **FIXC2 — hot-swap mid-call:** `RTCRtpSender.replaceTrack()` should let us swap camera mid-call without renegotiation. Confirm + flag any peer compat issues with the full-mesh topology.
- **FIXC3 — share detection:** how does the existing code detect that a remote peer is sharing? Is there a screen-share signaling message, or do we infer from track metadata? Confirm.
- **FIXC3 — active speaker float:** can we reuse the existing 8Hz `activeFrame` signal from `active-speaker.service.ts` (added in FIX-B2)? It emits RMS per peer; we should be able to sort the strip by RMS descending.
- **FIXC4 — .txt generation:** server-side from the JSON, or client-side blob? My pref: server-side endpoint `GET /api/recordings/:filename/transcript.txt` so the same logic works for future export formats.
- **FIXC5 — provider invocation:** spawn child_process for claude/codex CLI; HTTP for ollama. Timeout behavior: 60s per call max? Confirm.
- **FIXC5 — secrets:** Claude CLI auth lives in `~/.claude/`. Codex CLI auth lives in `~/.codex/`. Backend runs as JROM's user already (PM2 process), so no extra credential plumbing needed. Confirm.
- **FIXC7 — auto-run hook:** when transcribe.py finishes and writes `.transcript.json`, where do we trigger the autoRun questions? My pref: backend transcribe-trigger spawn watches for completion (fs watch or post-spawn promise) and enqueues the autoRun questions. Confirm.
- **FIXC7 — concurrency:** if multiple autoRun questions exist, run sequentially per transcript? Or parallel? Sequential keeps Ollama from OOMing on large models. Confirm.

### 4. Locked-spec disagreements

If you see anything in og-requirements.md that you think should change (technically, not stylistically), call it out. I will bring material disagreements to JROM; minor implementation details we resolve directly.

### 5. Things you should NOT do in this phase

- DO NOT write any application code.
- DO NOT create branches.
- DO NOT pull Ollama models yet (just inventory what's there).
- DO NOT run the CLI smokes against external paid endpoints if you have any doubt about authorization — but Claude CLI + Codex CLI on this machine are authorized.

## Output expected

A single response from you containing:
1. Smoke results for the three CLI invocations + Ollama health
2. Curated Ollama candidate list with install status + sizes
3. Per-batch outline (FIXC1 through FIXC8) — files, approach, gotchas, test plan, est commits
4. Any locked-spec disagreements + your proposed alternative + reasoning

End with: `STATUS: DISCUSSION-COMPLETE` so I know to validate + dispatch FIXC1.

## Reminder for the build phases that follow

**COMMIT BEFORE STATUS: DONE.** Past sessions broke this rule on M-B6, FIX-B3, FIX-B2 — please don't make it four.

Atomic commits per batch (FIX-B1 pattern). Tree clean before STATUS: DONE.

I will validate via Playwright + curl + on-disk artifact check. Only on PASS do I dispatch the next batch. Run 1 desktop regression must hold through every batch (R8.1 currently at 10 consecutive PASS).
