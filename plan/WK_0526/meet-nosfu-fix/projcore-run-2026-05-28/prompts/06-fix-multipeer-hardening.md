# Multi-peer hardening — three fixes converged from code audit + web research

Both audits identified the same three real risks at N=4-8 peers. Implementing now.

## Audit convergence

**Codex code audit STATUS: AUDIT-COMPLETE** — no critical breakers, but 3 RISK items:
- A. Reconcile correctness — positional assumption, no count/kind validation
- D. Simulcast layer pref — no peer-count downgrade (always 'h' on desktop)
- E. Peer-leave cleanup — orphan `pendingOntrack` entries not cleared

**Research agent (CF docs + community)** corroborates:
- "Positional reconcile is the HIGHEST RISK" — CF does NOT guarantee `responseTracks[]` order matches m-line ordering; WebRTC does NOT guarantee ontrack fire order matches m-line order. **Safe correlation is by mid + kind, not by index.**
- CF documented limits: 50 API calls/sec/session, 64 tracks per API call, no upper limit on tracks per session. We have headroom.
- Peer-leave: explicit purge of midToEntry + MediaStream refs + pending state required.

## Scope — three small focused fixes

### Fix 1 — Reconcile validation (kind cross-check + length guard) [CRITICAL]

File: `frontend/src/app/services/sfu-mid-reconcile.ts`

Current `reconcileSubscribedMids(responseTracks, newTransceiverMids, kindMap, publisherClientId)`:
- Pairs responseTracks[i] with newTransceiverMids[i] positionally.
- No validation that kinds match.

Add:
1. If `responseTracks.length !== newTransceiverMids.length`, log a warning and **throw** so the subscribe op rejects, opQueue's wrapper catches, retry kicks in (via the existing watchdog/retry path).
2. For each `responseTracks[i] / newTransceiverMids[i]` pair, look up the transceiver by `newTransceiverMids[i]` from a passed-in `pc.getTransceivers()` snapshot. Check `transceiver.receiver.track.kind === kindMap.get(responseTracks[i].trackName)`. If mismatch (e.g., audio paired with video transceiver), log warning + throw.
3. Update the caller in `sfu-client.service.ts` (around line 906) to pass the necessary additional arg (or do the lookup inline).

Why this works: the positional assumption HOLDS for now (most likely, even though CF doesn't document it). The validation makes it SAFE — if it breaks, we get a loud retry instead of silent stream-mis-routing. Two-sided guard (length + kind).

### Fix 2 — Peer-count-aware simulcast downgrade [HIGH]

File: `frontend/src/app/services/sfu-client.service.ts`

Locate `cameraRidNow()` (around line 368-400). Currently returns:
- `'l'` if mobile or screen-share active
- `'h'` otherwise (desktop default)

Change to factor in subscribed video count:
- 1-2 subscribed video peers → keep 'h' (high)
- 3-4 → 'm' (medium)
- 5+ → 'l' (low)

Plus: trigger `updateCameraLayer()` when subscribed-publisher count changes (after each successful subscribe, after each peer-leave cleanup).

Why: at N=8 with 'h' from everyone, downlink bandwidth saturates. Auto-downgrade keeps it usable.

### Fix 3 — Orphan pendingOntrack cleanup on peer-leave [MEDIUM]

File: `frontend/src/app/services/sfu-client.service.ts`

Locate peer-leave/`removePeer`/`handleSfuRosterRemoved` cleanup (around line 441-469). It clears subscribedClientIds, midToEntry, retry state, etc., but does NOT iterate `pendingOntrack` to remove entries whose mid was associated with the leaving peer.

Add: iterate `this.pendingOntrack` and delete entries where `event.transceiver.mid` corresponds to a mid that was in midToEntry for the leaving peer (or simpler — when we delete from midToEntry, also delete from pendingOntrack the same mid keys).

Why: bounded memory. Without this, pendingOntrack accumulates dead entries for peers who came and went.

## Hard constraints

- ONLY touch `sfu-client.service.ts` and `sfu-mid-reconcile.ts`. No backend changes.
- Do not change opQueue or subscribe-effect logic — both audits confirmed they're correct.
- Do not touch UI grid CSS — audit confirmed it handles N=12 fine.
- Do not change `pc.ontrack` handler shape — only add cleanup paths to pendingOntrack.

## Acceptance gate

1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — 4/4 PASS. The connecting-window stuck-warning should still be `false` on both sides (regression check).
4. **Add a multi-peer Playwright spec** at `e2e/tests/fixloop-banner/multipeer.spec.ts` that:
   - Creates a room
   - Joins host
   - Spawns 3-4 guest contexts that all knock + get admitted in quick succession
   - Asserts: all peer tiles eventually reach `data-state="connected"` within 20s
   - Asserts: no `[sfu] subscribe stuck >10s` console warnings on the host
   - (You may use the same fixtures from `e2e/fixtures/rooms.ts`. If room admit needs special API for batch admit, just sequentially admit each.)
5. Run the new spec: `npx playwright test tests/fixloop-banner/multipeer.spec.ts --reporter=line` — 1/1 PASS.
6. Write `validation/multipeer-hardening.md`: files touched, the three risks closed, the new spec coverage.
7. Commit: `fix(sfu): multi-peer hardening — reconcile validation + simulcast downgrade + ontrack-buffer cleanup`. One commit.

## Stop conditions

- 3× build failure → STOP, write `validation/multipeer-blocker.md`, do NOT push.
- If adding count/kind validation causes the existing 2-peer flow to regress (reconcile throws when it shouldn't), STOP and report — the validation logic may be over-strict.
- If the multi-peer spec fails consistently, STOP — there's a real bug we haven't yet diagnosed; report findings and don't push the spec.

Final line MUST be: `STATUS: DONE — multi-peer hardening ready for validation`.
