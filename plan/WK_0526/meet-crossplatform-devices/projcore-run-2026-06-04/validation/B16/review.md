# B16 Review

## Scope

Touched only B16-owned ICE config, SFU publish ICE source, diagnostics payload/wire-up, backend ice-config env/health, focused tests, and B16 artifacts.

## Checks

- No changes to B06 register flow.
- No changes to B08 subscribe retry.
- No changes to B11 transport recovery state machine; only publish PC ICE server source changed.
- No changes to B15 signaling state machines.
- No media acquisition, recorder, or subscribe state-machine edits.

## Residual Risks

- Join anyway intentionally allows STUN-only fallback after warning. Restrictive-network users may still fail if they choose this escape hatch before relay config recovers.
- `window.__meetDebug.forceRelayDiagnostics()` is the force-relay diagnostic entry point; this is diagnostics-only and does not change normal call policy.
- Full backend suite has unrelated pre-existing failures in legacy auth/room/waiting-room expectations. Touched backend ICE tests pass.
