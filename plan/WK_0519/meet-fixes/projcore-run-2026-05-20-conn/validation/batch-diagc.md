# Batch C (diagc / DR-11) — Projcore Independent Validation

**Verdict: PASS — VERIFIED. DR-11 voice-first resilience + audio-priority delivered.**

## Independent execution

| Check | Result |
|---|---|
| Commit | cbaa018 (22 files, +431 in webrtc.service) on fix/meet-conn-diag |
| `npm test -w backend` | 103 passed / 1 skipped |
| DR-11 + call-path specs (diagc, fixc3, fixb2, diag1, diagb2) **in isolation** | **12/12 PASS** — no WebRTC regression from DR-11 |
| Audio-priority code (the JROM ask) | **Verified by reading** webrtc.service.ts: audio sender `priority='high'`+`networkPriority='high'` (L751-752), video sender `priority='low'` + `maxBitrate` cap (L755-757), exposed in diagnostics. Exactly "audio first, video gets the remainder." |
| Screenshots | weak-connection-banner.png ("Weak connection - audio only" + "AUDIO ONLY" badge on weak peer), audio-only-toggle, quality-pill — all confirm DR-11 |
| codex's gate | 78/78 on isolated DB (self-seeding, the correct clean-DB validation) |

## DR-11 mechanism (as built, matches approved plan + amendments)

- Quality from getStats (loss/jitter/RTT/bitrate), classify good/weak/poor; **delta-based** loss.
- Hysteresis: degrade after 3 poor (~7.5s), restore after 5 good (~12.5s).
- `receiver-video-policy` control over the signal relay: weak RECEIVER tells senders to pause video TO it (the asymmetric-downlink case).
- Manual audio-only toggle (wins over auto); per-peer quality pill + banner.
- **Audio-priority allocation always-on** (DR-11e): audio high-priority, video low-priority + maxBitrate cap; audio-only is the last resort. Audio sender never stopped (asserted).
- Test seam: `__meetDebug.sampleConnectionQualityForTest()` injects quality through the production path (Chromium can't reliably override native getStats in Playwright — decision logged).

## Full-live-DB gate note (NOT a DR-11 regression)

A full Run-1 + all-diag run on the LIVE DB showed 12 failures in **data-dependent specs** (v2-b4-tabs, fixb4, fixc4, fixc7, fixc8). Root cause = live-DB test pollution (83 accrued rooms) + consumed seed recordings/transcripts + WAL/pagination read effects — NOT DR-11 (which is frontend WebRTC only and passed 12/12 in isolation; codex's isolated-DB run was 78/78). The live DB has since been cleaned to just TEST_ROOM01. The data specs self-seed and pass on a clean DB.

## Cleanup (JROM request 2026-05-20)

Bulk-deleted all test rooms via the owner-scoped API; **API authoritative view = 1 room (TEST_ROOM01)**. (CLI sqlite3 count lagged at 83 due to better-sqlite3 WAL not yet checkpointed — backend view is the truth.)

## Requirement closure

| Req | Status |
|---|---|
| DR-11 — voice-first weak-connection resilience (auto-degrade + manual toggle + quality pill + audio-priority) | **VERIFIED** |

## Outstanding in conn-run

- DR-12 (join-prereqs popout, supersedes DR-7 grey-out) — queued, not yet dispatched.
- DR-8 cross-network field-proof — JROM live PH↔US re-test (relay live).
