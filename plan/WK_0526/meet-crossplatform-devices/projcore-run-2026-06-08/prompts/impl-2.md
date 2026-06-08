# IMPL-2 — Reclaim-safe mid-overwrite guard (never silently drop a publisher's audio)

You are the IMPLEMENTER (codex). Verifier != fixer: projcore validates independently.

## FIRST tool call = callback append (streaming-order mandate)
`printf '[projcore callback] IMPL-2 STATUS: %s %s\n' "PROPOSED" "$(date -u +%FT%TZ)" >> <abs>/callbacks.md`
STATUS: PROPOSED (plan) → wait APPROVED-PLAN → implement → STATUS: DONE.

## Background (B5, from the 7-round deliberation — north-star: app must NEVER suppress a voice)
In `frontend/src/app/services/sfu-client.service.ts` the no-renegotiation subscribe branch (~L1747-1755) does `this.midToEntry.set(rt.mid, entry)` UNCONDITIONALLY. If Cloudflare returns a `mid` that already belongs to a DIFFERENT live publisher, this overwrites that publisher's entry → that publisher's inbound audio is orphaned = a silently-dropped voice. (This was the "one talker at a time" anomaly's latent mechanism; sequential in JROM's call, but a real latent bug.)

## SCOPE (this batch only)
- Make the mid binding RECLAIM-SAFE at sfu-client.service.ts ~L1747-1755 (and the renegotiation branch ~L1725-1730 if the same overwrite risk exists):
  - If `rt.mid` already maps to an entry for the SAME publisher+trackName → fine (idempotent), keep.
  - If it maps to a DIFFERENT publisherClientId/trackName that is STALE (publisher no longer in the current roster/presence) → clear that stale mapping, then set the new one.
  - If it maps to a DIFFERENT publisher that is STILL LIVE (true cross-publisher conflict) → do NOT silently overwrite; rollback this subscribe mutation via the existing `rollbackSubscribeMutation()` path and drive a safe retry/renegotiation. NEVER leave the new publisher permanently unsubscribed, and NEVER orphan the existing live one. Add a one-line `console.warn` with both clientIds + the mid.
- Reuse existing helpers (rollbackSubscribeMutation, the retry plan). Keep the diff tight.

## TEST (required)
Add a concurrent-2-publisher test to `sfu-client.service.spec.ts` (or the right existing spec): subscribe publisher A (audio), then publisher B (audio); assert BOTH mids coexist in `midToEntry` and BOTH appear in `remoteStreams` (no displacement). Add a mid-collision case asserting the reclaim-safe path does NOT orphan a live publisher.

## OUT OF SCOPE
- The remote-audio registry (IMPL-1, done). The diagnostics payload (IMPL-3).

## Constraints
- Frontend only; don't touch backend/recorder. Match style. Don't break existing subscribe specs.
- `cd frontend && npx tsc --noEmit` = 0; run the touched spec(s) via npx tsx; report commands+results in changes.md (append an IMPL-2 section). Do NOT git commit.

Reply STATUS: PROPOSED + your exact guard logic (the if/else branches) + the test you'll add. Wait for APPROVED-PLAN.
