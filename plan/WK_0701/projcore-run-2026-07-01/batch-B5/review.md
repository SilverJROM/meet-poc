# Batch B5 — Review

## Requirements coverage

| Req | Status | Evidence |
|-----|--------|----------|
| R5a — 406 not `lastGumError` | ✅ PASS | `diagnostics-gum-error.ts` gates via `isLastGumErrorCandidate()`; `diagnostics-layer-honesty.spec.ts` asserts 406 → `null` and subscribe layer holds HTTP 406 |
| R5b — per-layer fields | ✅ PASS | `DiagnosticsLayerSnapshot` on payload; wired from `lastSubscribeFailureEvidence`, `lastRecoveryEvent`, `sfuRejoinThrottled`, `publishRecoveryFailed`, `localPublishState`, `remoteAudioPlayout`, inbound tracks |
| R5c — advertised-not-subscribed obvious | ✅ PASS | Diagnostics page blocks + screenshot `b5-layer-diagnostics-advertised-not-subscribed.png` |

## Scope discipline

- ✅ No recovery logic touched (`sfu-client.service.ts` recovery coordinator, retry/rejoin/publish paths unchanged)
- ✅ Reused B1 primitives (`isLastGumErrorCandidate`, `extractSubscribeFailureEvidence`)
- ✅ Additive payload only (`layerDiagnostics?`; flat `lastGumError` retained)

## Risks / notes

- `lastGumError` flat field and `layerDiagnostics.device.lastGumError` mirror the same signal — intentional backward compat.
- E2E posts a crafted admitted diagnostics row to prove page rendering; honesty mechanism is unit-tested against real 406 → subscribe routing.