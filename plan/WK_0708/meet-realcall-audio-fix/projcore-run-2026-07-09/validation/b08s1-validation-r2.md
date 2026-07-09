# B08S-1 Validation R2

Validator: independent codex55 L2  
Target commits: `54ee377` plus `2d9c740`, `6d0e65a`  
Verdict: FAIL

## Required Command

`npx vitest run e2e/harness/__tests__/call-driver.test.ts`

Result: PASS

```
Test Files  1 passed (1)
Tests       5 passed | 2 skipped (7)
Duration    470ms
```

## Re-check Results

F1 original global/method defect: FIXED at the call site, but live publish sampling still fails.

- `e2e/harness/call-driver.ts` now reads `(window as any).__meetDebug?.sessionId`.
- `e2e/harness/call-driver.ts` now calls `(window as any).__meetDebug?.sfuGetStats?.()`.
- No `__MEET_DIAGNOSTICS` reference remains in `call-driver.ts`.
- Blocking remainder: the stats loop filters `stat.mediaType === 'audio'`, while the app exposes a raw `RTCStatsReport` from `pc.getStats()` and existing e2e code filters `stat.kind === 'audio'`.
- I confirmed `frontend/src/app/pages/room/room.page.ts` wires `sfuGetStats: () => this.sfuClient.getStats()`, and `frontend/src/app/services/sfu-client.service.ts` returns `this.pc.getStats()`.
- Existing repo consumers of the same debug surface use `report.forEach((s) => s.type === '...-rtp' && s.kind === 'audio')`.
- Probe with an RTCStatsReport-like `Map` containing `{ type: 'outbound-rtp', kind: 'audio', bytesSent: 5000 }` produced `callDriverLoopTotal=0`, while the repo pattern produced `repoPatternTotal=5000`.

F2 session ledger registration: FIXED.

- `joinDualBrowserCall()` now calls `registerCreatedID('session', result1.sessionId)` when browser 1 returns a session ID.
- It also calls `registerCreatedID('session', result2.sessionId)` when browser 2 returns a session ID.

Unit diagnostics stub: PRESENT and GREEN.

- `call-driver.test.ts` includes the requested diagnostics-path stub test.
- The stub uses array entries with `mediaType: 'audio'`, so it does not cover the live `RTCStatsReport`/`kind: 'audio'` path and cannot catch the remaining defect.

## Blocking Finding

R2-F1: `joinBrowser()` still returns `publishedBytes=0` for the live app stats shape.

Impact: B08S-1's dual-browser driver can still fail live join+publish validation even after switching to `__meetDebug.sfuGetStats`, because the filter does not match the app's raw `RTCStatsReport` audio outbound stats. This preserves the practical failure mode from the original F1: live publish evidence is not sampled correctly.

Expected fix: treat audio as `(stat.kind ?? stat.mediaType) === 'audio'` and iterate the `RTCStatsReport` with `forEach` or `Array.from(report.values())`, with a unit stub that uses the live `kind: 'audio'` shape.

## Verdict

FAIL. The requested unit test is green and F2 is fixed, but B08S-1 is not re-gated because live `sfuGetStats()` publish-byte sampling remains incompatible with the app's actual stats shape.
