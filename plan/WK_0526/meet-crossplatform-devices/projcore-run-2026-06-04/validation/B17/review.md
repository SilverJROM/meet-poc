# B17 Review

## Scope Review

Touched only approved implementation files and tests:

- `frontend/src/app/services/recorder.service.ts`
- `frontend/src/app/services/active-speaker.service.ts`
- `frontend/src/app/services/sfu-client.service.ts`
- `frontend/src/app/services/media.service.ts`
- focused service specs

No changes were made to B06 register, B08 `planSubscribeRetry` decision logic, B11 transport recovery state machine, B15 signaling, B16 ICE config, or media acquisition ladder logic.

## Mechanism Review

- Recorder replacement now actively disconnects the previous source for a reused `clientId`.
- Active-speaker replacement now disconnects the previous per-peer graph before retaining the new entry.
- SFU subscribe backoff timers now share teardown discipline with subscribe stuck watchdogs while preserving retry behavior.
- Debug track registry now prunes ended tracks deterministically instead of retaining every acquired track forever.

## Residual Risk

Low. The diff is narrow and covered by deterministic unit assertions. Real long-call memory/CPU profiling was not performed in this batch.

