# OG Requirements — Recording reliability v2 + call-drop diagnosis (2026-06-25)

**Source:** JROM real-call incident, room HRIS_TOJ (`11215094570c`), owner `silverjrom@gmail.com`, ~80-min call ended via close-room → recording NOT saved (zero `[rec] saved`); also a multi-minute mid-call media drop on the client side.

**Investigation already done (this session, evidence in chat + [[changes]]):** stale FE deploy (live bundle Jun 23 12:31, B5 fix committed Jun 24 — never built); `/upload` is owner-gated (403) + open-session-gated (409); close-room ends the meeting session → late upload of a long recording 409s silently; the fix `endForAll()→flushRecordingForExit()` (upload-before-close) exists in source but is not deployed.

These are **ISSUES** (previously-expected behavior broken) → §1.4h reproduce-first: validator reproduces on the rendered app BEFORE the fixer works.

| R# | Requirement | Acceptance (UI-proof / artifact) |
|----|-------------|----------------------------------|
| **R1** | A long real call's recording is reliably **SAVED** when the host ends the call via **close-room** (and via leave). The upload must survive the session close / page teardown. | On the deployed FE, a host records a multi-minute call, ends via Close room → backend logs `[rec] saved` AND the file appears in the recordings library. Reproduced-broken on old build first, then green. |
| **R2** | The recording upload runs in the **background** and **persists across close to confirm completion** — if interrupted (tab close / refresh), a pending marker drives a confirm/retry on next load so no recording is silently lost. (JROM #1: "do it in the background, when i close it persist if needed to confirm upload".) | Pending-marker reconciliation observable: simulate an interrupted upload → on next rooms/recordings load the recording is confirmed/retried, never silently dropped. |
| **R3** | Upload rejection/failure is **no longer silent** — a 403 (owner mismatch) / 409 (no open session) / write error is logged server-side AND surfaced to the host. The owner-match security gate stays intact. | Backend logs the rejection with reason; host sees the "couldn't save" notice. Owner-gate still returns 403 for a non-owner (unchanged). |
| **R4** | The HRIS_TOJ-class **mid-call drop is diagnosed**: classify **client-side internet vs app-caused** from `meeting_session_diagnostics` + logs. If client-side → documented as non-issue WITH proof. If anything in our app caused/worsened it → identified with evidence (and folded into the queue). (JROM #2: "if its here internet then its a non-issue, unless we can prove that there is nothing on our app that caused it".) | `validation/drop-diagnosis.md`: per-leg ICE/RTT/transport timeline for the 03:12→03:23 outage, verdict + evidence. |
| **R5** | **No regression**: short recordings, AGENTROOM, and the international call path still work; the owner/session gates are not weakened beyond R1's intent. | Short-record still saves; AGENTROOM unaffected; targeted tests green. |

**Run mandate:** final acceptance = a **real long call** (host + Peer2's machine relay) records and **saves through close-room**, per JROM real-call-acceptance rule. No synthetic-only pass.
