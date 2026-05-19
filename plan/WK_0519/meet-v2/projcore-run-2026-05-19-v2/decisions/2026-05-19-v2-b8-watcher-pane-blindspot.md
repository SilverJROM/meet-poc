---
date: 2026-05-19
project: meet-poc
type: process-correction
source: projcore (caught by JROM)
priority: high
search_hooks: [watcher, confirmation-prompt, NEEDS-CONFIRM, B8, stall, blindspot, tmux pane scanning, §2.7a, §2.8 v3+]
---

**Incident:** During v2-B8 execution, codex hit a `rm -f e2e/fixtures/media/tone-440hz.wav` confirmation prompt from the Codex CLI's tool-confirmation gate. Codex was supposed to (per §2.7a) write `[projcore NEEDS-CONFIRM] rm -f e2e/fixtures/media/tone-440hz.wav — awaiting projcore approval` to callbacks.md BEFORE waiting on the prompt. Codex skipped that step and just waited at the prompt silently. My projcore-side watcher was watching only `callbacks.md` for the `v2-batch-8` line — it had no visibility into the pane. Result: codex stalled for an unknown but non-trivial amount of time until JROM caught it manually with the message *"you missed an action on codex, please check it and fix your watcher to properly catch this"*.

**Root cause (two-sided):**
1. **Codex side:** skipped the §2.7a file-flag step. Either codex didn't internalize the rule, or it was elided because the rm was framed as "minor cleanup of own generated fixture." Either way, the protocol exists precisely to cover this case.
2. **/projcore side:** my watcher was a single-source (callbacks.md only). §2.8 v3+ explicitly says watchers MUST also scan the pane every cycle for confirmation keywords ("Would you like to run", "Press enter to confirm", "Yes, proceed", etc.) — exactly to catch the case where codex didn't file-flag.

**Immediate response:**
- Approved the rm via tmux `1` + Enter (the file was codex's own scratch fixture, generated during B8 diagnosis, unused, safe to delete).
- Codex resumed; build + tests rerunning.

**Fix (durable):**
- Wrote `tmp/projcore-confirm-watcher.sh` — a reusable shell watcher that (a) scans tmux pane every 30s for confirmation-prompt keywords AND (b) watches callbacks.md for the expected STATUS line. Exits on either trigger so /projcore responds.
- Includes the §2.8 v3+ "same prompt detected in 2 consecutive cycles" escalation logic (would fire TG URGENT in a production setup; current implementation just exits + reports).
- Going forward, EVERY batch dispatch uses this script as the watcher, NOT the simple callbacks-only grep.

**Why this protocol exists:**
Codex hitting a tool-confirmation prompt is a normal Codex CLI behavior (`danger-full-access` mode still gates some commands). Without dual visibility (file-flag + pane-scan), projcore goes blind. The watcher must NEVER assume codex will write the file-flag correctly — pane-scan is the safety net.

**Surfaced to next briefs:** add "if codex hits any tool-confirmation prompt, the file-flag in callbacks.md is MANDATORY before waiting" to dispatch briefs as a non-negotiable bullet — codex was told this in B1 but the pattern repeated in B8.

**Time cost of the bug:** unknown — JROM caught it manually. With the pane-scan watcher, the same stall would have surfaced in ~60 seconds maximum (2 cycle detections).

**Promotion target:** `~/.claude/JROM/style/` candidate — "every /projcore watcher uses dual-source (pane + file) detection, not single-source file polling." Worth elevating after this run if the pattern repeats in Run 2 or Run 3.
