# Batch B08A-2 — AC15b capture-vs-sender discriminator + dual injection

**Role:** implementer L3 (sonnet)  
**Run dir:** `/home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09`  
**Branch:** `batch-01-diagnosis-2026-07-08`

## §4b
- impl_tier: L3 (sonnet) · validator_tier: L3 (opus) · deliberation: yes (PROPOSED gate) · redteam: standard

## Depends on
B08A-1 VERIFIED (`0ca6670`) — use `extractOutboundLiveness` / `getOutboundLiveness`.

## Exact scope
1. Pure `classifySenderLiveness(window)` → one of: `both-advancing` | `capture-dead` | `sender-dead` | `indeterminate`.
2. Dual injection, independent:
   - **Sender-dead (binding):** `sender.setParameters({encodings:[{...e, active:false}]})` — RTP stalls, capture energy still advances.  
     **`replaceTrack(null)` and `track.enabled=false` are WRONG** (forge capture-dead).
   - **Capture-dead:** reuse B07 Mode A/B frozen/silent patterns.
3. Browser-context test (B07 `.browser.test.ts` precedent) proves each injection → correct classification, neither indeterminate.

## D29
- R1/classifyMicCapture is blind to sender-dead — do not hang classifier off R1.
- Closes **discrimination clause only**. **AC15 NOT VERIFIED here** (live clause = B08A-3).
- Zero call burn.

## Out of scope
Remedy, B13W watchdog, live dual-browser AC15, diagnostics emit (done), gain path.

## Handshake
PROPOSED first → wait APPROVED-PLAN.  
Callback: `[projcore callback] impl B08A-2 STATUS: …` to callbacks.md  
On DONE: commits + validation/b08a2-changes.md + test results.
