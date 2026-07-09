# Batch B05 — Implementer L3 sonnet (capture-path)

Forced weak-signal gUM shim + stimulus verifier.

## §4b
impl L3 sonnet · val L3 opus · deliberation done (see decisions/2026-07-09-b05-deliberation.md) · redteam standard

## Scope
Playwright addInitScript shims getUserMedia → GainNode downstream of Chrome processing; expose intended r + measured stimulus verification. Acceptance: r=0.50 + invalid control → within ±20% or INVALID. No amplification PASS claim yet.

## Binding
Later A definition is same-speaker normal-vs-attenuated far-end. Design verifier so normal reference can be recorded first.

## Handshake
Write prompts/b05-proposed.md STATUS: PROPOSED. Wait APPROVED-PLAN. Then implement. Emit DONE.
