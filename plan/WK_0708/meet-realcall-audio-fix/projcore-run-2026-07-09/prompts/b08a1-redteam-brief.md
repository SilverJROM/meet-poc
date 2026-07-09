# Red-team B08A-1 (DIFF-level, verifier ≠ fixer)

Role: agj-panelist / adversarial reviewer. DO NOT fix code.

Commits: 0ca6670 (+ d7edd39 changes.md). Scope: extractOutboundLiveness, getOutboundLiveness, D29 diagnostics emit of 4 counters per outbound audio track.

Read: validation/b08a1-changes.md and git show 0ca6670 --stat + key hunks.

Lenses (rotate): wrong-side stats (capture vs playout), second getStats, silent throw swallowing, diagnostics not actually on payload path, sonnet overclaim.

Verdict: CLEAN | FINDINGS (severity + evidence). Write validation/b08a1-redteam.md.
Callback: [projcore callback] redteam B08A-1 STATUS: DONE — CLEAN|FINDINGS
