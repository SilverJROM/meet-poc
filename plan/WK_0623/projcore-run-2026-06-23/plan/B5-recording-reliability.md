# Batch plan — B5: Recording reliability (lost on call end)

> Gated: investigate+feedback DONE (read-only). No fix until JROM go. Covers req-matrix R5.1–R5.7.
> Decision: `decisions/2026-06-23-recording-upload-loss.md`. **HIGH PRIORITY — real-call data loss.**

## Affected surfaces
- `frontend/src/app/pages/room/room.page.ts` — `toggleRecording()` (~1410), `endForAll()` (~1564),
  cleanup/`directLeave` (~1555-1575): the 8s `withTimeout` upload + teardown sequence.
- `frontend/src/app/services/recorder.service.ts` — `stop()`, `upload()`, `uploadPerUser()` (fire-and-forget).
- `backend/src/modules/recording/index.ts` — `/upload` handler + `[rec] saved` log (server side, mostly fine).

## DELIBERATED — Phase 1 (THIS batch, Option B hardened teardown). Implementer: Sonnet (complex).

**B5-T1 — Remove the upload truncation.** Keep `withTimeout` only on `recorder.stop()` (8s); **replace the 8s
cap on `recorder.upload()` with a 5-min sane cap** (`room.page.ts` ~1433 toggleRecording, ~1571 endForAll).
Not unlimited (prevents indefinite hang on a dead uplink). (R5.3)
Test: large blob upload awaited to completion, not abandoned at 8s.

**B5-T2 — Finalize uploads BEFORE close-room (open-session race — all 3 panelists).** Reorder `endForAll`:
await mix upload AND per-user uploads, THEN `ws.send({close-room})`. `/upload` requires an open session;
close-room closes it + auto-transcribe scans files — so uploads must land first. Show blocking "Saving
recording… don't close" state. (R5.2)
Test: end-with-recording saves before session closes; no 409.

**B5-T3 — Per-user uploads awaited.** `await this.recorder.uploadPerUser(...)` (drop `void`) inside the guarded
flush in both toggleRecording (~1439) and endForAll (~1572). (R5.4)
Test: per-user webms + participant.json present after a long ended call.

**B5-T4 — keepalive on SMALL fetches ONLY (codex55 mandatory correction).** Add `keepalive: true` ONLY to
`uploadMetadata()` (~465) and the small reconciliation ping — **NOT** to `upload()` (~248) or `uploadPerUser()`
(~518) audio blobs. Browser keepalive is size-capped (~64KB) and can BREAK a 25MB+ blob fetch. The large
uploads rely on **await + finalize-before-close + beforeunload guard**, not keepalive. (R5.2)

**B5-T5 — beforeunload guard.** In `handlePageLifecycleLeave`/`beforeunload`: if `recorder.isUploading()`,
`preventDefault()` + `returnValue=''` → browser "changes may not be saved" dialog. Does NOT block the awaited
programmatic `endForAll`. (R5.2)

**B5-T6 — Loud host failure notice.** On upload failure in `endForAll` catch, surface a clear end-of-call
notice (reuse `callIssues`/leave-dialog from the speaker-banner fix), not a transient status line; offer
retry / gate leave on confirm. (R5.5)

**B5-T7 — localStorage reconciliation flag.** Set `recording-pending-<sessionId>` on `recording-state:started`,
clear on successful upload; on rooms-page load if the key persists → banner "A recording from your last
session may not have saved." Catches host-crash / hard-refresh / tab-close. (R5.6)

**B5-T8 — Capstone (real-shape + Peer2 e2e).** Record a **≥20-min** call, end-and-leave → confirm `[rec] saved`
+ file in Library + per-user files; force an upload failure → host is told; short record still works;
**full Peer2-machine e2e, no international regression** (run-level mandate). (R5.1, R5.4, R5.5, R5.7)

## Phase 2 — SCHEDULED follow-on (B5b, NOT built in this batch). Option A chunked durability.
Covers host-crash / tab-close / network-stall that Phase 1 can't. (codex55's architecture.)
- Backend recording-attempt **manifest/status model (persisted)** — reconciliation backed by DB state, not
  WS-only `recording-state`.
- `chunk-init` (auth + open-session) → indexed **chunk POST** (temp parts) → **finalize** (atomic assembly;
  reject if gaps; uploadId + monotonic index + manifest).
- RecorderService enqueues **throttled** chunk uploads from `ondataavailable` (batch 10–30s, one in-flight,
  bounded retry/backoff). **Do NOT upload per-user live in the first pass** (PH↔US call-quality risk).
- Manual stop → finalize (not blob upload); endForAll → finalize before close-room.
- Backend tests for missing-chunk / no-finalized-file / reconciliation.
→ Logged as a follow-on; gets its own deliberation when scheduled.

## Notes
- Root cause is client-side timing/teardown, not the server `/upload` handler.
- This is the highest-severity item in the queue (silent data loss on real calls). Recommend prioritizing
  B5 right after B1 when go is given — or even first.
