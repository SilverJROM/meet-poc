# DELIBERATION T1 — host-inaudible-remote-audio — ROUND 2
# (Your role = the model you run as: opus | codex55 | gpt54 | spark | sonnet | haiku.)

## 0. READ FIRST (in this dir)
- `anchor.md` — binding frame (unchanged, do NOT renegotiate).
- `round1-synthesis.md` — the deduped Round-1 findings table (A1–A6, B1–B2, R3). THIS is your starting point.
- `jrom-evidence-addendum.md` — the HOST's direct observations. Treat as ground truth.

## 1. New ground-truth from the host (decisive — weight heavily)
During the failing call, on the HOST screen: **NO audio-blocked / tap-to-enable banner ever appeared.**
Host speaker/volume normal; **other apps' audio worked**; host **had selected a SPECIFIC output device**
(not default); and switching to **Google Meet with the SAME devices worked immediately**. JROM: "the
problem is our app." → Hardware/device/network are fine; the OS output device is audible; our app fails
to deliver remote audio to it, and fails SILENTLY (no banner).

## 2. Round-1 result
6 verdicts collected. NOT unanimous; the two AGREEs (sonnet, haiku) point at DIFFERENT mechanisms
(sonnet: orphaned-graph A3 + gesture A1; haiku: autoplay-suspend A2). Round-1 surfaced ≥6 distinct real
defects (A1 gesture-guard, A2 autoplay, A3 orphaned-graph, A4 sinkId-routing, A6 keepalive-gain-0, B1
mid-overwrite, plus the R3 media-playout stat-type bug). See round1-synthesis.md for file:line on each.

## 3. Your task this round — answer THREE questions, with code evidence at file:line
**Q1 — RANK the Anomaly-A mechanisms against the host evidence.** Which single mechanism BEST explains
ALL FOUR facts simultaneously: (no banner) AND (silence) AND (specific device selected) AND (other
apps + Meet audible on same device)? Rank A1/A2/A3/A4/A5/A6 from most→least likely. Key discriminators:
 - The banner fires only when `hasSources` is true AND not playing (room.page.ts:650-658). If sources.size
   stays 0 (e.g. A3 orphaned-graph swallow), the banner is SUPPRESSED → matches "no banner". Verify the
   banner-suppression logic and whether A3's InvalidStateError path actually leaves sources=0.
 - A2 (suspended WITH sources>0) SHOULD show the banner → does the no-banner fact rule A2 out? Confirm.
 - A4 (context running, setSinkId mis-routes Web-Audio destination stream to the selected device) →
   context running + outputPlaying true → no banner. Is setSinkId on a `MediaStreamAudioDestinationNode`
   stream actually honored by Chrome, or silently ignored/routed-to-default? State what you can prove.
**Q2 — RESOLVE Anomaly B (B1 real-overwrite vs B2 sequential-sessions).** From the CODE: can two
CONCURRENT remote audio publishers both stay subscribed (distinct mids in `midToEntry`, distinct streams
in `remoteStreams`, both mixed)? Trace the subscribe path for publisher-2 while publisher-1 is live
(sfu-client.service.ts subscribe / reconcileSubscribedMids / processOntrack ~L804-829, ~L1700-1770). Does
anything overwrite/evict publisher-1? Decide: real concurrency bug, or benign sequential. Evidence-based.
**Q3 — CONVERGE on the FIX SET.** Given the data can't fully disambiguate A3 vs A4 without a fresh
instrumented call, propose the minimal fix BUNDLE that closes the goal robustly (defense-in-depth across
the confirmed defects) PLUS the R3 diagnostics. Specifically decide: should we replace the single shared
Web-Audio mixer output with **per-publisher UNMUTED `<audio>` elements** (Meet-style, srcObject = each
publisher stream, setSinkId per element) — which would dissolve A1/A3/A4/A5 at once — or keep the mixer
and patch each defect? Give the concrete file:line change list you would commit.

## 4. Also: hunt for anything Round 1 MISSED
New holes, regressions, or a 7th mechanism. If you find nothing new beyond round1-synthesis.md, say so
explicitly ("no new issue beyond R1") — that is what lets the loop converge.

## 5. Output — write `<role>-verdict-r2.md` in this dir:
```
# <role> verdict — T1 round 2
## Q1 — A-mechanism ranking (with the discriminator evidence file:line)
## Q2 — Anomaly B verdict: REAL-BUG (B1) or SEQUENTIAL (B2) — proof file:line
## Q3 — Fix set: [per-publisher-elements | patch-mixer] + concrete change list (file:line) + R3 diag fields
## New issues found this round (or "no new issue beyond R1")
STATUS: AGREE — <one line: the root cause ranking + the fix set you'd commit>
   OR
STATUS: REVISE — <one-line top blocker to convergence>
```
Evidence-dense, no production code edits, only your verdict file.
