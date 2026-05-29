# north-star — SFU optimization (locked 2026-05-28)

## NS1 — Lifecycle
pre-live, deferral OFF. No TODO/stubs; everything in scope ships complete or is a blocker.

## NS2 — Goal
Faster + more reliable: fewer disconnects, less lag. NOT mesh/local-routing for its own sake. Cloudflare Calls already does geo-local edge routing (anycast); optimize within the SFU.

## NS3 — Execution
**Codex-in-tmux (gpt-5.5) is the implementer** (JROM: "use codex5.5 as implementer"). Session `lkvc-codex`. projcore (Claude/Opus) supervises + independently validates each slice (verifier ≠ fixer). Plan handshake (PROPOSED → APPROVED-PLAN) before each slice. One slice at a time.

## NS4 — Scope
LOCAL + deploy to voice.silverjrom.app (PM2 restart per project_specs §8.3). Each slice verifiable on the live URL / via API + getStats.

## NS5 — Testing
Targeted (backend assertions, getStats-based checks) + manual verification. No full e2e capstone. Do NOT regress existing SFU behavior (publish/subscribe, screen-share, reconnect, recording).

## NS6 — Hard scope guards for codex
No mesh/P2P plane. No forced relay. Do not change recording/screen-share/reconnect pipelines except where SR3/SR4 explicitly require reading stats. Surgical diffs, one slice each.
