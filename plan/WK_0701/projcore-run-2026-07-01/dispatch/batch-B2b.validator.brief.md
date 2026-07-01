<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B2b RED-TEAM + validation (adversarial): break the full SFU rejoin (R2 complete)

Role: adversarial red-team + independent validator (codex55). Your job is to BREAK the B2b rung-3 full
rejoin, not to bless it. Default to finding a flaw. Changes UNCOMMITTED on fix/sfu-selfheal-20260701.
Implementer: Sonnet. Read `git diff` (sfu-client.service.ts +149, room.page.ts/.html, coordinator spec +252,
new e2e/tests/sfu-b2b-rejoin-ui/).

Batch ID: batch-B2b · Requirement R2 (completes it — rung-3 rejoin + rung-4 UI).
Design spec: deliberation/B0-recovery-ladder/consensus.md §Full SFU Rejoin Mechanism.

## Attack these 5 regression classes (JROM named these as the reason for the red-team). For EACH, try to
## construct an input/interleaving that breaks it; if you can't, say why it's safe with code cites.
1. **Duplicate subscriptions:** can any interleaving (needs-rejoin during an in-flight subscribe, presence
   update racing subscribeAllAdvertisedRemotes, retryFullSfuRejoinNow mashing) produce two live
   subscriptions / two <audio> elements for one publisher? (Check subscribedClientIds gating + enqueue serialization.)
2. **Ghost / orphan remote streams:** after resetForTransportRecovery() + rebuild, can a stale remoteStream /
   subscribedTracks entry / <audio> element survive for a publisher that rotated? (Check clearLocalTransportSessionState
   + RemoteAudioService.syncPeers identity diff.)
3. **Clobbering healthy remote streams:** a rejoin resets ALL remote inbound then resubscribes all. Construct
   a case where a PREVIOUSLY-HEALTHY peer ends up PERMANENTLY unheard after a rejoin (not just a transient
   glitch). If subscribeAllAdvertisedRemotes fails for that peer, does it recover (escalation ladder) or stay lost?
4. **Retry storms:** can the coalescing lock (rejoinScheduled) + throttle (≤1/15s, ≤2/2min) be defeated —
   e.g. many publishers, rapid needs-rejoin, retry button, epoch resets — to produce >2 rejoins/2min or a
   tight rotate loop? Check the finally() flag reset timing vs a synchronous re-trigger.
5. **Silent UI failure:** when throttle exhausts, is sfuRejoinThrottled reliably surfaced (rung-4 banner) AND
   does the per-publisher 30s low-freq continuation keep trying? Can the banner get stuck true after recovery,
   or false while still broken?

## Also check
- The test-only `debugForceRejoinThrottledForTest()` in the PRODUCTION service: confirm it is gated to
  localhost at the call site (room.page.ts debug object) and cannot fire in a shipped build. If reachable in
  prod → REPRO-STILL-PRESENT.
- Epoch guard holds through the rotation (freshEpoch capture + per-iteration check in subscribeAllAdvertisedRemotes).
- Tests honest + TERMINATE: `cd frontend && timeout 40 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts`.
  Confirm the 4 new B2b tests assert OUTCOMES (coalesce=1, throttle blocks, resubscribe-all, banner state), not
  just call counts. Verify the e2e screenshot (batch-B2b/screenshots/rung4-unrecovered-banner.png) shows the
  actual banner (not a blank/login page).

## Output
Append "## B2b red-team" to batch-B2b/independent-validation.md — per-lens verdict (SAFE with cite, or BREAK
with the exact interleaving). Overall.

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh validator batch-B2b <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states: WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Emit **REPRO-CLEARED-ON-LOCAL** if all 5 classes are safe + tests honest + UI proof real;
**REPRO-STILL-PRESENT** if you break ANY class (name the exact interleaving).

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-B2b[[:space:]]+RECEIVED[[:space:]]+REPRO-CLEARED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: WORKING
