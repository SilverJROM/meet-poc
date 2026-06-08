# T1 Round 1 — synthesis (projcore, 6 verdicts: opus/codex55/gpt54/spark/sonnet/haiku)

STATUS tally: opus REVISE · codex55 REVISE · gpt54 AGREE · spark REVISE · sonnet AGREE · haiku AGREE.
Not unanimous + AGREEs point at DIFFERENT mechanisms → Round 2 required.

## Distinct findings (deduped, triaged) — Anomaly A (host hears NOBODY)
| ID | Mechanism | File:line | Raised by | Explains JROM "no banner"? |
|----|-----------|-----------|-----------|----------------------------|
| A1 | `output.play()` never called from join gesture because of the `sources.size>0` guard — at gesture time sources=0, so output element never pre-warmed; later play() is non-gestural → rejected | remote-audio.service.ts:294 | sonnet RC1, codex55, gpt54, spark, haiku | partial |
| A2 | Non-gesture `setTimeout(0)` unlock + watchdog/keepalive `resume()` rejected → AudioContext stays `suspended` → silence | room.page.ts:637; remote-audio.service.ts:263-278,357 | haiku(primary), sonnet RC2, codex55, gpt54 | NO — would show banner if sources>0 |
| **A3** | **Orphaned graph: `ensureGraph()` rebuilds AudioContext after `closed` but REUSES old gain/limiter/destination nodes → `addSource` connect throws InvalidStateError (swallowed) → sources.size stays 0 → `hasSources=false` → banner SUPPRESSED + silent** | remote-audio.service.ts:508-535 (no null), 466-478 (swallow) | **sonnet C1** | **YES — best fit** |
| A4 | sinkId routing: `setSinkId(selectedDevice)` on a Web-Audio destination stream routes to a non-default device that doesn't emit (or stale id) | remote-audio.service.ts:85-112,652; room.page.ts:2667 | opus, sonnet hole#2, gpt54 | YES (context running → no banner) |
| A5 | Architectural SPOF: ALL remote audio funnels through ONE shared mixer `<audio>` element (per-peer kickstarts muted) — one failure = everyone silent | remote-audio.service.ts:538,552 | opus | — |
| A6 | keepalive oscillator gain=0 may let Chrome auto-suspend the context as "inactive" | remote-audio.service.ts:624 | sonnet FIX-3 | — |

## Distinct findings — Anomaly B (one publisher at a time) — UNRESOLVED SPLIT
| ID | Claim | File:line | Raised by |
|----|-------|-----------|-----------|
| B1 | REAL bug: `midToEntry` overwrite in no-renegotiation subscribe branch — publisher B rebinds publisher A's mid, displacing A | sfu-client.service.ts ~1748-1766 | gpt54, codex55, spark |
| B2 | NOT a bug: sequential sessions — Windows PC went offline ~08:26:45, phone joined after the ~7s gap; processOntrack is additive, never removes A | sfu-client.service.ts:804-829; evidence gap timeline | sonnet |

## R3 diagnostics — STRONG convergence (the data blocker)
- **Why audioLevel/totalAudioEnergy are null:** Chrome 113+ moved them from `inbound-rtp` to the `media-playout` stat type; the collector only reads `inbound-rtp` (sfu-client.service.ts:749). [sonnet C5/D1-D2, opus, codex55, spark, gpt54]
- Add: `media-playout` capture (audioLevel/totalAudioEnergy/totalSamplesDuration) + inbound `totalAudioEnergy` + emit host `remoteAudioContextState` + per-publisher mixer/output state from `debugSnapshot()`.
- **Interpretation key (sonnet D2):** emitted climbing + media-playout.audioLevel>0 → reaching OS output → sinkId issue. emitted climbing + audioLevel=0 → decoded-not-played → context suspended / gain=0 / orphaned graph. → ONE future call row becomes definitive.

## Reconciliation with JROM's evidence (decisive)
no-banner + other-apps-audible + SPECIFIC output device selected + Google-Meet-worked-same-device:
- DEMOTES A2 (pure autoplay-suspend would show the banner when sources>0).
- PROMOTES **A3** (orphaned graph → sources=0 → no banner, silent) and **A4** (context running, sink mis-routed → no banner, silent).
- Device hardware is fine (Meet + other apps work) → failure is our app's DELIVERY to that device.

## Engineering read (projcore)
A1, A3, A4, A6, B1, and the R3 stat-type bug are EACH real defects on their own merits regardless of which is THE trigger — and the null-audioLevel data cannot fully disambiguate A3 vs A4 without a fresh instrumented call. Robust path = fix the high-confidence playout defects as a bundle (defense in depth) + ship R3 diagnostics so the next call is definitive. Round 2 must: (Q1) rank A-mechanisms vs JROM evidence; (Q2) resolve B1-vs-B2 from code (can two concurrent audio publishers coexist?); (Q3) converge the fix SET, incl. whether to move to Meet-style per-publisher unmuted `<audio>` elements to dissolve A1/A3/A4/A5 at once.
