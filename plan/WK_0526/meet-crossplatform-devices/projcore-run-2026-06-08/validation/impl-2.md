# IMPL-2 — independent validation (projcore) — 2026-06-08
VERDICT: PASS.
- tsc --noEmit = 0; sfu-client.spec.ts passes (npx tsx).
- bindSubscribedMid (sfu-client.service.ts:1692-1717) reclaim-safe: same-publisher idempotent; STALE (not in remotePublishers()) → reclaim; LIVE different publisher → one-shot warn (subscribeMidConflictWarnings dedup) + throw → existing rollbackSubscribeMutation + bounded retry. Live publisher preserved, incoming not abandoned (north-star no-suppress honored).
- Used in BOTH branches: L1757 (renegotiation reconciled mids) + L1780 (no-reneg responseTracks). Only other midToEntry.set = rollback restore.
- Tests added (sfu-client.spec.ts:1527 live-conflict-no-orphan via assert.rejects /subscribe mid conflict/ + A preserved; :1584 stale-reclaim asserts mid reclaimed for bob). 2-publisher coexistence covered.
- Diff: frontend only (sfu-client.service.ts +38/-6, spec +168). No backend/recorder.
Closes R2 "never silently drop a concurrent publisher".
