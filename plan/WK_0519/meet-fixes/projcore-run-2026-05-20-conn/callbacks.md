# Codex -> Projcore Callback Channel (v2.0)

Codex appends one line per STATUS change as the final action of each reply:
`[projcore callback] <batch-id> <STATE> <note>`

---
[projcore callback] diag1 PROPOSED mechanism-level plan ready; recommend 2-batch split with reliability core first
[projcore callback] diag1 DONE Batch A DR-5/DR-4 committed at 5a41110; targeted tests pass, full e2e has pre-existing/out-of-scope failures
[projcore callback] diag1cf DONE Cloudflare TURN mint completed at 7a03c9d; backend/build/Run-1 69-spec regression pass and live curl returned turn URLs
[projcore callback] diagb1 PROPOSED plan ready; DR-9 needs small backend pending-list resync plus frontend quick-join/validation/doorbell work
[projcore callback] diagb1 DONE committed e92e514; DR-6/7/9/10 implemented with build/backend/e2e verification and pm2 restart complete
[projcore callback] diagb1 DONE iter1 committed f53da9a; Run-1 plus DIAGB1 gate passed 74/74 after mic-meter expander fix
[projcore callback] diagb2 PROPOSED plan ready; DR-1 helper plus DR-2 diagnostics/force-relay and DR-3 reconnect/resync scoped
