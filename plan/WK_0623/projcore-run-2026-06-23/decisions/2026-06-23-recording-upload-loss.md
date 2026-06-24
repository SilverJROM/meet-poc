---
date: 2026-06-23
slug: recording-upload-loss
source: projcore
issue: "#5 — recording lost on call end (8s upload timeout + page-teardown abort)"
status: investigated + diagnosed (mechanism-level); fix gated behind JROM go
---

# Decision — Recording lost on call end (real-call bug)

## JROM's verbatim ask
> "can you add as well a check or validation as i just got off the call, and i believed i hit record but the
> app didnt record the call, can you double check if there is an issue here. check this and give me a feedback
> before making adjustment on the app … or adding to the list"

## Investigation (2026-06-23, read-only — no app changes)
- **DB (`data/meet-poc.sqlite`):** session room `a78ae0bd02b6` ("ReceiptBOT", host silverjrom@gmail.com),
  **started 2026-06-23T01:54:29Z, ended 02:49:28Z (~55 min)**.
- **Logs:** `type=recording-state` fired **started @02:18:58Z** and **stopped @02:49:20Z** (≈31 min of
  recording), stop coinciding with session end. **Zero `[rec] saved` lines today** (a successful save always
  logs `[rec] saved <file> (<KB>)`; last real one 2026-06-22T23:40). → recording was ON but **no file saved**.
- **Disk:** newest webm is 2026-06-22T23:40 (yesterday). Nothing from today's call.

## Root cause (mechanism-level)
Recording is captured client-side (host browser MediaRecorder) and uploaded as ONE blob to `POST /upload`
when recording stops. The stop+upload path (`frontend/src/app/pages/room/room.page.ts`):
- `toggleRecording()` / `endForAll()` / cleanup: `blob = await withTimeout(recorder.stop(), 8000, null)`
  then `await withTimeout(recorder.upload(blob), 8000, null)`.
- **`withTimeout` is `Promise.race` (does NOT abort the fetch)** — but it returns `null` after 8s and the
  caller treats that as "upload timed out", moving on.
- A real recording (~31 min ≈ 25 MB+; the 58-min call on 06-22 was 48 MB) **cannot upload in 8 seconds** on
  a normal/international uplink.
- Because the host **stopped by ending/leaving the call**, the page tears down right after (`endForAll`:
  `close-room` + `await delay(1000)` → teardown; or `directLeave`), which **aborts the still-in-flight
  upload fetch**. Server never receives the body → no `[rec] saved` → recording lost.

### Why tests passed but the real call failed
Agent/e2e recordings are short (3–4 MB) and upload in <8 s, so they survive. Real-length calls exceed the
8 s window and die on teardown. Synthetic-passes / real-fails — directly the real-call-acceptance risk.

### Secondary
- **Per-user uploads are fire-and-forget** (`void this.recorder.uploadPerUser(...)`) — even more exposed to
  teardown; explains the missing per-user files (today AND the 06-22 JROMRoom call had none).
- The only user signal was a transient status line ("Recording stopped, but upload timed out."). Easy to miss
  (ties to the end-of-call host-notice theme from the speaker-banner fix).

## Recommended fix direction (NOT to be built until JROM go)
1. **Stream/chunk the recording to the server during the call** (incremental `ondataavailable` POSTs / resumable
   upload), so there is no large end-of-call blob to lose. Strongest fix.
   *(If too big for this batch:)*
2. **Block teardown until upload completes** — a real "Saving recording… don't close the tab" guard that awaits
   the actual upload (and per-user uploads) before `close-room`/navigation; **remove the 8 s cap on upload**
   (keep a timeout only on MediaRecorder `stop()`); add `beforeunload` protection while uploading.
3. **Surface failure loudly** — if a recording can't be saved, tell the host clearly at end-of-call (reuse the
   `callIssues`/leave-dialog notice mechanism), not a transient status line.
4. **Validation/check JROM asked for**: a post-session reconciliation — if `recording-state started` was seen
   but no file landed, flag it (log + host notice) so a lost recording is never silent again.

## Open question for JROM (non-blocking)
- Fix depth: **(1) streaming/chunked upload** (robust, larger) vs **(2) block-teardown + remove-timeout**
  (smaller, still solid). Recommend (2) first as a fast reliability win, (1) as the durable follow-on.

## DELIBERATION OUTCOME — LOCKED (2026-06-23)
Panel: Sonnet + codex55 (gpt-5.5) + grok build (Composer 2.5), each read the code independently.
- **Sonnet → Option B now** (A = 4-6 sessions of mid-call server surface; B fixes the actual causal chain).
  Sharp adds: `keepalive:true` on fetch, 5-min sane cap (not unlimited), await per-user, beforeunload guard,
  localStorage reconciliation for host-crash.
- **grok → Option B now, defer A** until B is validated on a real ≥20-min call.
- **codex55 → hybrid, A as the durable fix** ("pure B is a useful stopgap"); B alone still loses data on
  tab-close/crash/network-stall; beforeunload only warns. Wants chunk→manifest→atomic-finalize + persisted
  recording-attempt state (so reconciliation is backend-backed, not WS-only).
- **ALL THREE** flagged the backend race: `/upload` requires an OPEN meeting session, but `close-room` closes
  it immediately → **uploads must finalize BEFORE close-room** (reorder endForAll).

### projcore synthesis (2-of-3 ship-B-now; A is the agreed durable layer) → PHASED:
**Phase 1 (THIS batch, B5) — Option B hardened teardown.** Fixes the guaranteed, happening-now loss (host
ends call → upload aborted). Tasks: remove 8s upload cap → 5-min sane cap (keep 8s only on MediaRecorder.stop);
await `uploadPerUser`; `keepalive:true` on upload/uploadPerUser/uploadMetadata; **finalize uploads before
`close-room`** (fix open-session race); beforeunload guard while uploading; loud end-of-call host failure
notice (reuse `callIssues`/leave-dialog); localStorage `recording-pending-<sessionId>` reconciliation → banner
on rooms page; real ≥20-min call + Peer2 e2e acceptance.
**Phase 2 (follow-on B5b, scheduled NOT built now) — Option A chunked durability.** Backend recording-attempt
manifest/status (persisted); chunk-init + indexed chunk POST + atomic finalize (reject gaps via uploadId +
monotonic index + manifest); RecorderService enqueues throttled chunk uploads from `ondataavailable` (batch
10-30s, one in-flight, bounded retry; NOT per-user live first pass — call-quality risk). Covers
host-crash / tab-close / network-stall.
This honors codex55's concern (A scheduled) while shipping the urgent fix (B) the panel majority endorsed.
