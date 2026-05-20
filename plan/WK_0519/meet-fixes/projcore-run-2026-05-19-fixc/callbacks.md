# Codex → Projcore Callback Channel (v2.0)

Codex appends one line per STATUS change as the final action of each reply:
`[projcore callback] <batch-id> <STATE> <note>`

Projcore's watcher tails this file (not the pane) — robust against scrollback loss.

---
[projcore callback] fixc8 PROPOSED Reuse llm_settings for transcriber_model; pass WHISPER_MODEL into transcribe.py spawn; implement settings dropdown after approval.
