# POSTFIX1 — Post-fix regression fan-out (handback gate: ZERO goal-blocking)

**Audit scope:** `git diff 427d1a7..HEAD -- frontend/src backend/src` (the entire run: ARCH-0 + B01-B21d + LEAN1 + TESTH1/2). ~4684 insertions / 471 deletions, 37 files.
**Pre-state:** frontend tsc 0, 25 specs pass, ng build green; backend 166 pass; DEV (fe+be) deployed, /login 200, TURN configured.
**Rule (JROM):** re-spin the model roster auditing ALL post-lean changes; 3 rounds; weight cheaper models ~2x; ANY blocking finding → fix → +2 more rounds until blocking-clean; ant-size OK. Adversarially verify every finding before acting. Handback only at ZERO goal-blocking.

## Roster (this runtime)
Agent tool: sonnet (cheap, 2x weight → most reviewers), haiku (cheap, 2x), opus (deep, riskiest areas). Codex-5.5 via meet-codex tmux on the highest-risk areas. (gpt-5.4 / codex-5.3-spark approximated by additional independent sonnet/haiku passes + the codex pass.)

## Areas (8) over the diff
1. Acquisition/media engine — media.service, media-acquisition, media-errors, local-media-recovery
2. SFU subscribe/publish/reconcile — sfu-client doSubscribeTracks/doPublish/register, sfu-mid-reconcile, sfu-roster-utils [HIGHEST RISK]
3. SFU transport recovery + timers — sfu-client transport recovery, subscribe retry/stuck/backoff timers
4. Recording — recorder.service, room-recording
5. Remote audio + leaks — remote-audio.service, active-speaker
6. Admit/signaling + relay/ice — backend signaling, ice-config.service + ice-config-utils + backend ice-config
7. UX/orchestration — room.page.ts (+852), room-decisions, room-lifecycle, room.page.html, device-dialog
8. Diagnostics + cross-cutting integration — meeting-sessions, transcripts, rooms.page, diagnostics payload, inter-batch seams

## Rounds
- R1: 8 area reviewers (sonnet-heavy + opus on 2&7 + haiku on 5&8) + codex-5.5 pass on 2&4. Collect findings.
- R2: adversarially verify each R1 finding (independent verifiers); targeted re-review; completeness critic.
- R3: final sweep + per-area sign-off.
- Any BLOCKING confirmed → fix batch → +2 rounds until blocking-clean.

## Findings log
(populated as rounds complete)

### R1 — dispatched
(pending)

### R1 — DISPATCHED @ 2026-06-04 (9 reviewers over 427d1a7..HEAD)
- A1 acquisition/media (sonnet) ae88dd4152bc1500d... 
- A2 SFU subscribe/reconcile (opus) — highest risk
- A3 SFU transport/timers (sonnet)
- A4 recording (sonnet)
- A5 remote-audio/leaks (haiku)
- A6 admit/signaling/relay (sonnet)
- A7 room.page orchestration (opus) — biggest diff
- A8 diagnostics/cross-cutting (haiku)
- codex-5.5 pass (tmux) on SFU+recording → codex55-review.md
Each classifies BLOCKING vs ANT. On completion: synthesize → adversarially verify any BLOCKING/real → fix if confirmed (+2 rounds) → else R2/R3 sign-off. Handback gate: ZERO goal-blocking.

### R1 findings — collecting
**A4 recording (sonnet) — DONE.** Self-refuted: REC4 (no hang), REC5 (finalize-once holds across timeout/discard/late-onstop/session2), REC2-evict (local guarded), REC3 (clean, no double-free), REC8 (Firefox ogg correctly labeled via recorder.mimeType). KEEPERS:
- CANDIDATE-1 [claims BLOCKING, projcore-classify=recording-quality not call-blocking] REC1/iOS: recorder's private AudioContext not resumed on iOS background mid-recording (B12 pageshow/visibilitychange resumes SFU but not recorder.ctx) → recording may capture silence after a background event. Fix: expose RecorderService.resumeAudioContext() + call from B12 handler. VERIFY: confirm resume path truly absent + iOS suspends recorder ctx.
- CANDIDATE-2 [ANT] REC2 churn: syncRecorderPeerStreams→addPeerStream re-runs every peers-signal change; addStream removes+re-adds existing source → micro audio glitch. Fix: skip re-add when same clientId+same stream.
**A5 remote-audio/leaks (haiku) — DONE. ZERO findings.** B13 sink fallback + ERR9 coalescer (no deadlock/latest-wins), LEAK3 analyser dedupe, LEAK5 prune, voice-recovery watchdog (no false-fire) all SAFE.
**A8 diagnostics/cross-cutting (haiku) — DONE. ZERO findings.** DiagnosticsPayload additive-only, NO secret leak, ERR6 dup-guard, ERR7 reset-on-cleanup, DatePipe/transcripts/contracts safe.
PENDING: A1 acquisition, A2 SFU-subscribe(opus), A3 SFU-transport, A6 admit/relay, A7 room.page(opus), codex-5.5.
**A3 SFU-transport/timers (sonnet) — DONE. 2 claimed-BLOCKING (VERIFY) + 2 ant(self-noted theoretical).**
- T-1 [VERIFY-BLOCKING] sfu-client ~483-490: full-republish creates new PC + installTransportStateHandlers while transportRecoveryInFlight=true; if new PC fails in that window, startTransportRecovery early-returns + finally doesn't re-check → possible permanent silence. Proposed fix: re-call handleTransportStateChange() in finally if this.pc exists. SCRUTINY: ICE failures are async (seconds), not synchronous during doPublish — reachability questionable; B11 was 3-agent SOLID.
- T-2 [VERIFY-BLOCKING] sfu-client ~471-492 + resetForTransportRecovery(409) external callers (room.page screen-error ~1651, pageshow ~2859): may not invalidate a sleeping backoff IIFE (transportRecoveryScheduled/InFlight) → stale recovery wakes on torn-down state → double-republish race. Proposed fix: generation counter incremented by resetForTransportRecovery, checked post-sleep. SCRUTINY: depends on reset firing DURING a backoff sleep + enqueue serialization.
- T-3 [ANT] ICE-restart-fails-mid-subscribe escalates to full republish (more disruptive but restores audio).
- T-4 [ANT] handleTransportStateChange reads live pc state — benign (theoretical).
=> R2 must adversarially verify T-1 + T-2 against ACTUAL async timing + enqueue semantics + existing B11 guards before any fix.
**A1 acquisition/media (sonnet) — DONE. ZERO blocking. 2 ant.** Audio fallback ladder/queue/acquire-before-destroy/no-double-deviceId/micOn-guard/error-norm all correct. ANT: (a) stopScreen re-entrancy window — suppressed by screenOn+dedup guards, no audio break; (b) setCameraTrackEnabled acquire-path no signaling-rollback — PRE-EXISTING, camera optional. Both non-goal-blocking.
PENDING: A2 SFU-subscribe(opus), A6 admit/relay, A7 room.page(opus), codex-5.5.
**A6 admit/signaling/relay (sonnet) — DONE. ZERO findings.** BK1 owner-election (no stuck-pending; promote on owner-leave/expiry; owner re-entry via isOwnerOf DB not clientKey), BK2 revoke only on kick/leave (drops reconnect-grace clean), B16 retry(3,250/750)+warn+Retry+JoinAnyway+real-refetch, single this.pc for pub+sub reuses TURN, health no-secret + dual env. NOTE for T-1/T-2 verify: there is ONE pc (publish+subscribe share this.pc).
PENDING: A2 SFU-subscribe(opus), A7 room.page(opus), codex-5.5.
**A2 SFU-subscribe/reconcile (opus, DEEPEST) — DONE. ZERO blocking. 4 ant.** Two-way audio/all-hear-all holds on all paths incl after rollback+retry, mic-on, reconnect-evict, transport recovery. KEY: A2 traced transport recovery + found it SOUND (no premature/nested recovery, no infinite loops) — does NOT corroborate A3 T-1/T-2. ANTs: (1) same-pub 2-video reconcile swap (documented residual, audio safe, rare); (2) stuck-watchdog vs in-flight-subscribe redundant double-subscribe (newly-reachable this run, audio flows + self-heals via rollback) — borderline-worth-fixing; (3) eviction-resubscribe relies on backend monotonic revision (currently safe, fragile); (4) orphaned remote track after rollback (benign, ended track no audio).
=> opus(A2) vs sonnet(A3) DIVERGE on transport: T-1/T-2 likely false-positive; MUST verify.
PENDING: A7 room.page(opus), codex-5.5.

**A7 room.page orchestration (opus) — DONE. ZERO blocking. 3 ant.** Every join path → two-way audio; camera-enable-after-no-cam-join FIXED; B16 relay flags one-shot correct; D1 gate correct; syncRecorderPeerStreams real fix; lifecycle B10/B12 recovers; no effect loops; timer/handle hygiene good. ANTs: host-receiving-meeting-ended no-nav (pre-existing latent, normal host self-navigates), narrow stray-PC leak on leave-during-publish-window (CF GC reclaims), redundant syncSelectedAudioIdToTrack on unmute (benign).
**codex-5.5 (tmux) — DONE. 2 claimed-BLOCKING.** (validation/POSTFIX1/codex55-review.md). Non-findings: reconcile audio-routing safe, recorder finalize-once + mime OK.
- C-1 [VERIFY-BLOCKING, NOVEL] doSubscribeTracks rollback only rollbackPendingLocalOffer (have-local-offer); if reconcile(1537)/createAnswer(1546)/SLD(1547) throws AFTER setRemoteDescription(1529) the PC is in have-remote-offer → rollback no-op → PC stuck → retry can't re-SRD → that peer silent. Fix: signaling-state-aware rollback (SRD {type:rollback} for have-remote-offer). A2(opus) did NOT catch this.
- C-2 [VERIFY-BLOCKING, =A2-ANT-3] handleSfuPresence evicts on cfSession change but if applyPresenceUpdate rejects (revision<=existing) remotePublishers not updated → effect no re-run → evict-no-resubscribe → silence. A2 says backend monotonic-revision makes it unreachable. Verify backend invariant.

## R1 TALLY: 9 reviewers. ZERO confirmed blocking. Blocking CANDIDATES to verify in R2: C-1 (codex, novel, credible), C-2 (codex/A2 — reachability), T-1+T-2 (A3 sonnet — A2 opus says transport sound), REC1-iOS (A4 — recording-quality). Ant pile (non-goal-blocking): A1×2, A2×4, A3×2, A4×1, A7×3.

### R2 — verification (projcore + verifiers)
- REC1-iOS [projcore-verified REAL, classify=recording-quality NOT live-call-goal-blocking]: recorder.ctx (private:84) resumed ONLY in start():136; NO resumeAudioContext accessor + NO call from B12 resume handler → iOS background mid-recording → silent recording rest of session. Live call unaffected. Per JROM eliminate-ants → FIX (small additive: expose resumeAudioContext() + call from resumeAfterLifecycleFreeze/pageshow). Not a handback blocker by itself.
- C-1 → V1 (opus) verifying [a0313f22]
- C-2 → V2 (sonnet) verifying backend revision invariant [a68fb408]
- T-1/T-2 → V3 (sonnet) verifying reachability vs A2-opus-sound [a4eb3eb7]
PLAN: when V1/V2/V3 return → assemble fix set (C-1 if confirmed-blocking=priority + REC1-iOS + cheap-safe ants e.g. REC2-churn / A2-watchdog-double-subscribe) → ONE consolidated fix batch to codex → validate+commit → if any BLOCKING was fixed, +2 MORE fan-out rounds (JROM rule); else continue 3-round count. Handback only at ZERO goal-blocking.
- C-2 → V2 VERDICT: **NOT-REACHABLE** (no fix). Backend sfuPresenceRevision is room-global monotonic (incr on every sfu-publish, resets only on room teardown→all clients reconnect); reconnect always carries strictly-higher revision so applyPresenceUpdate never rejects. Backstops: effect re-fires (publisher stays in remotePublishers), roster applyRosterSnapshot unconditional overwrite. codex over-claimed; A2 was right.
- C-1 → V1 (opus) VERDICT: **NOT-A-BUG** (no fix). Premise right (reconcile-throw leaves PC have-remote-offer; rollbackPendingLocalOffer no-op there; retry reuses pc) but consequence WRONG per WebRTC spec: setRemoteDescription(offer) is LEGAL in have-remote-offer (re-offer case) → next subscribe retry's SRD self-heals; InvalidStateError only in have-local-offer/closed. Corroborated by doClose comment. Optional signaling-aware-rollback hardening NOT worth handback risk. codex over-claimed; A2-opus right.
=> Both codex blocking claims (C-1, C-2) DISMISSED. Only confirmed real = REC1-iOS (recording-quality ant). Awaiting V3 (T-1/T-2).
- T-1 → V3 VERDICT: **NOT-REACHABLE** (false positive). installTransportStateHandlers stale-PC guard mutes old-PC events; new-PC-fail-in-window self-resolves (doPublish-throw clears flags+re-arms; isLocalPublishHealthy safety net). Optional zero-risk finally-recheck noted, NOT needed.
- T-2 → V3 VERDICT: **NOT-REACHABLE** (false positive). enqueue serializer + opQueue reset + doRestartIceRenegotiate null-PC guard + publishInitialSfuWithRetry published-guard prevent concurrent double-publish; sleeping-IIFE-into-cleared-state handled.

## ===== POSTFIX1 R1 RESULT: ZERO confirmed goal-blocking. =====
All 4 blocking candidates (C-1, C-2, T-1, T-2) DISMISSED by decisive verification (over-claims, not shipped bugs). Only confirmed real = REC1-iOS (recording-quality ANT). Ant pile (non-goal-blocking, logged): REC1-iOS, REC2-churn, A2×4 (2-video-swap residual / watchdog-double-subscribe self-heals / revision-coupling-safe / orphaned-track-benign), A1×2 (stopScreen-reentrancy-guarded / setCamera-no-rollback-preexisting), A7×3 (host-meeting-ended-latent / stray-PC-CF-GC / redundant-sync-benign).
=> R1 = BLOCKING-CLEAN round 1 of 3.
DECISION: fix the two clear-win reals (REC1-iOS silent-recording + REC2-churn glitch) in FIX1, then R2+R3 confirm over final code. Other ants = benign/pre-existing/documented-residual → log to handback, not worth pre-handback risk. NO +2 rounds (no blocking fixed).

### FIX1 — APPROVED-PLAN @ 2026-06-04, codex implementing (3-agent)
REC1 resumeAudioContext (no-op unless recording+suspended, never throws, wired into resumeAfterLifecycleFreeze guarded by isRecording, B12 republish untouched). REC2 streamFor map → addStream no-op on same-stream (kept in lockstep with sourceFor: delete on removePeerStream + clear on cleanupAudioGraph/start). Specs for both. tsc 0 + build + recorder specs gate.

### FIX1 — DONE (commit 1c07bc3) @ 2026-06-04. 3-agent both SOLID.
Both R1 ants fixed (REC1-iOS resume, REC2 churn-guard). recorder specs + tsc 0 + ng build green; no regression.

### R2 — DISPATCHED @ 2026-06-04 (6 fresh reviewers over post-FIX1 427d1a7..HEAD, confirmation round)
recording+FIX1-delta(sonnet), room.page-orchestration(sonnet), SFU-subscribe/reconcile(opus), acquisition+media(sonnet), transport-recovery(sonnet), completeness-critic(haiku). Classify blocking vs ant; verify any NEW finding. R1 was blocking-clean=round1.

#### R2 findings — collecting
**R2-recording (sonnet) — DONE. NO findings.** 10 adversarial scenarios traced+refuted: streamFor never drops a needed source (sourceFor.has-first), resumeAudioContext guarded by isRecording (no finalize interaction), finalize-once exactly-once across stop/discard/late-onstop/timeout, eviction removes stale + 'local' protected, recording audible (resume in start + on lifecycle), mime actual, no hang, peer-resumed recapture clean. FIX1 correct, zero regression.
PENDING: SFU-subscribe(opus), orchestration, acquisition, transport, completeness-critic.
**R2-transport (sonnet) — DONE. NO findings.** Re-confirmed T-1+T-2 dismissals; 7 more checks ANT/self-resolving; ICE-restart+republish-both-fail = intended cap→UI-manual-retry (not permanent silence); wifi↔cellular handoff self-resolves. No goal-blocking permanent-silence path.
**R2-acquisition (sonnet) — DONE. NO blocking. 6 ant.** iOS dual-grant device-switch (pre-existing OS constraint), OverconstrainedError→no-devices (fallback reaches default + succeeds), micOnFromTrack correct, queue no-deadlock, camera-never-blocks-audio, resolveInitialStage correct.
**R2-completeness-critic (haiku) — DONE. NO new bugs; coverage-gap map.** Refuted concern (password-gate): projcore verified continueAsGuest opens passwordPromptOpen + RETURNs BEFORE prepareLobbyDeviceCheck (acquire) → prompt NOT buried. Remaining gaps = real-device seat (Android/PC/external fallback, cameraless-camera-enable frame delivery, multi-party 3-5 churn) → handback test list. One HONEST LIMITATION to surface: a user who joins STUN-only (relay exhausted at join) won't re-fetch relay on a later in-call ICE failure (transport recovery reuses join-time iceServers) — edge-of-edge, log for handback/future-hardening.
PENDING: SFU-subscribe(opus), room.page-orchestration(sonnet).

**R2-SFU-subscribe (opus) — DONE. 1 NEW VERIFY-BLOCKING candidate + 1 known ant.**
- S-MIDCALL [VERIFY-BLOCKING, NEW — R1 missed it] sfu-client subscribeNewRemoteTracks (~978-982): mid-call new-track subscribe (peer unmutes mid-call) does `void enqueue(doSubscribeTracks)` with NO .catch/retry/watchdog/version-bump (resilient retry is join-path only). A transient failure (CF not_found_track_error within ms of publish / SDP timeout / reconcile mismatch) → rollback+re-throw into dropped promise → next presence filters audio out (prev.tracks has it) → NEVER retried → subscriber permanently can't hear that peer's mic. Reachable (B06 unmute-mid-call goal scenario); no self-heal short of publisher-reconnect/rejoin. Regression from B06 broadening subscribeNewScreenTrack→subscribeNewRemoteTracks without porting the retry. → opus verifier a1bdf5a1 + minimal-fix.
- ANT same-kind-2-video reconcile swap (documented residual; only batched at initial-subscribe-of-already-screensharing-peer; not silence; self-corrects).
=> If S-MIDCALL confirmed REAL-BLOCKING → fix (port join-path resilience to mid-call subscribe) + per JROM +2 MORE rounds. THIS IS THE GATE WORKING (R2 opus caught what R1 missed).
PENDING: R2 room.page-orchestration(sonnet), S-MIDCALL verifier.

- S-MIDCALL → opus verifier VERDICT: **REAL — GOAL-BLOCKING (CONFIRMED).** subscribeNewRemoteTracks no catch/retry; after transient mid-call audio-subscribe failure → rollback+rethrow→dropped→next presence filters audio (prev.tracks has it)→never retried; watchdog disarmed+frame-poisoned (hasFirstFrame=true→healthy/no-retry); roster never re-subscribes; version-effect short-circuits on subscribedClientIds.has. NO self-heal short of publisher-reconnect/rejoin. Reachable (code's own not_found_track_error comment = the mid-call race). The original "I can't hear you when you unmute" bug class.
  FIX caveats (verifier): use a SEPARATE capped mid-call retry counter (NOT the frame-poisoned subscribeFirstFrameAt/subscribeRetryAttempts gate which returns healthy/no-retry); re-derive newTracks from ACTUAL subscribed state (midToEntry track names) not prev.tracks; backoff + cap (~SUBSCRIBE_RETRY_CAP) → no infinite loop; mid-call retry must drive doSubscribeTracks directly (version-effect short-circuits on subscribedClientIds.has); midToEntry/alreadySubscribed guards prevent double-subscribe.

## ===== POSTFIX1 R2 RESULT: 1 CONFIRMED GOAL-BLOCKING (S-MIDCALL). =====
R2 is NOT blocking-clean. Streak resets. → FIX2 (3-agent SFU) → then +2 MORE blocking-clean rounds required (JROM rule) before handback. All other R2 areas clean (recording/transport/acquisition/completeness/password-gate). orchestration(sonnet) pending — fold any real finding into FIX2.
**R2-orchestration (sonnet) — DONE. NO goal-blocking.** All join paths→two-way audio; publishInitialSfuWithRetry runId-guarded; B12 lifecycle/B10 meeting-ended/toggle/cleanup clean; FIX1 recorder-resume correctly placed. 2 ANT (display-only stale selectedVideoId after audio-only fallback — no join impact). Logged ant.
=> R2 complete: 1 confirmed blocking (S-MIDCALL) → FIX2. R2 streak=0.

### FIX2 — APPROVED-PLAN @ 2026-06-04, codex implementing (3-agent SFU)
Separate capped mid-call retry state (NOT frame-poisoned gate), re-derive missing from midToEntry+subscribedTracks filtered to advertised, bounded failure-timer with stop-on (cfSession-change / track-removed / already-subscribed), drive doSubscribeTracks directly, churn-free success, teardown cleanup all paths, doSubscribeTracks as-is (no join/rollback/reconcile/transport change). Cap=SUBSCRIBE_RETRY_CAP, no dangling timer. 3-agent: projcore + opus 2nd validator before commit.

### FIX2 — DONE (commit 0a0608e) @ 2026-06-04. 3-agent (projcore + opus 2nd) both SOLID. S-MIDCALL CLOSED.
Bounded mid-call subscribe retry (separate keyed state, hasFirstFrame:false poison-sidestep, cap+backoff, re-derive from actual subscribed state, all stop-conditions, teardown complete, no regression). Specs + tsc app/spec 0/0 + ng build green. Original 'unmute→can't-hear' class fixed before handback.

### R3 — DISPATCHED @ 2026-06-04 (post-FIX2, +2-rounds rule). 6 fresh reviewers over 427d1a7..HEAD.
SFU-subscribe(OPUS: confirm S-MIDCALL closed + no new gap + no regression), recording(sonnet), orchestration(sonnet), acquisition(sonnet), transport(sonnet), completeness-critic(haiku). Need R3+R4 blocking-clean over final code.

#### R3 findings — collecting
**R3-completeness-critic (haiku) — DONE. NO new code bug; coverage-gap map.**
- #1 video/screen mid-call retry asymmetry → REFUTED by projcore: missingAdvertisedRemoteTracks + selectNewRemoteTracks filter by trackName NOT kind → FIX2 retry is KIND-AGNOSTIC (covers audio+video+screen). Mid-call camera-enable gets same resilience. Only tests are audio (test-thinness, not a bug).
- #2 device-switch mid-call publish failure → publisher-side doReplaceLocalTrackAndPublishIfNeeded has rollback-to-previous-track (B06) so audio not lost; not goal-blocking (SFU-opus to confirm).
- #3-9 real-device-seat / self-healing / low-prob / unit-coverage-thin (multi-peer churn during retry, transport+retry interleave [opus-FIX2-validator already noted self-correcting], recording+transport-recovery, screen+device-switch, wifi-roaming). None confirmed bugs.
- Riskiest residuals: cameraless two-way audio + restrictive-net mid-call = JROM real-device seat (handback list) + the logged honest relay-no-refetch limitation.
PENDING: R3 SFU-subscribe(opus), recording(sonnet), orchestration+acquisition(sonnet).
**R3-recording (sonnet) — DONE. NO findings.** finalize-once / stop-discard-race / streamFor churn-guard / local-eviction-protected / peer-resumed / resumeAudioContext / mime all clean. 1 ant (no-metadata notifyParticipantLeft skips removePeerStream but sync-effect evicts on next peers() change immediately — no silent peer).
PENDING: R3 SFU-subscribe(opus), orchestration+acquisition(sonnet).
**R3-orchestration+acquisition (sonnet) — DONE. NO findings.** All join paths→two-way audio; fallback ladder A8/A9 correct; queue no-deadlock; lifecycle/cleanup correct. 1 ant (duplicate broadcastMediaState on toggleMic→replaceInCallAudio success — identical msgs, wasteful not breaking).
=> R3 so far: critic + recording + orch/acq all clean. PENDING: SFU-subscribe(opus) — decisive S-MIDCALL-closed confirmation.
**R3-SFU-subscribe (opus) — DONE. S-MIDCALL CLOSED confirmed. 1 NEW candidate (VERIFY — projcore NOT accepting ant classification yet).**
- FIX2 closes S-MIDCALL: mid-call retry makes unmuting peer audible, teardown-safe (clearAll in all reset paths + cfSession guard), repeated unmute mints new trackName (cap not exhausted), transport/reconcile clean. ✓
- DOUBLE-SUBSCRIBE [VERIFY] sfu-client subscribeNewRemoteTracks + room.page effect subscribeIfNeeded: a peer joining mic+camera BOTH off (tracks:[], not in subscribedClientIds) then UNMUTING triggers BOTH the mid-call subscribe (doesn't set subscribedClientIds) AND the effect's subscribeIfNeeded (now has tracks, guard doesn't short-circuit) → 2 subscribes for same trackName → claimed duplicate transceiver + doubled/echoed playback. Reviewer says ANT (peer IS heard); projcore: doubled/echoed audio on join-muted→unmute (COMMON path) is a Zoom/Meet-QUALITY defect + possible FIX2-widened regression → NOT accepting ant without verification. → opus verifier a8479ea4: real-doubling vs dedup-benign + new-vs-preexisting + minimal fix.
=> R3 verdict PENDING the double-subscribe verification. If real-doubling → FIX3 (+reset streak/+rounds). If dedup-benign → true ant → R3 blocking-clean.

- DOUBLE-SUBSCRIBE → opus verifier VERDICT: **REAL — doubled/echoed audio on join-muted+camera-off→unmute (COMMON path). NEW (FIX2-widened).** Both paths fire (mid-call subscribeNewRemoteTracks doesn't set subscribedClientIds → effect subscribeIfNeeded also fires); doSubscribeTracks does NOT dedup → 2nd POST → 2nd transceiver → 2 distinct track instances in remoteStreams (addTrack doesn't dedup distinct instances) → audible double. FIX2 broadened the mid-call branch screen-only→all-tracks, exposing the zero-track-at-join case (latent before: audio-on-join publishers were in subscribedClientIds so the effect short-circuited).
  FIX (verifier, surgical): make doSubscribeTracks IDEMPOTENT — at the top (after `if (!tracks.length) return;`) filter `tracks` to those NOT isTrackSubscribed(publisher.clientId, trackName); if none, return early (BEFORE subscribeInitiatedAt stamp + POST + any mutation). Both ops serialize via opQueue; op#1 populates midToEntry before op#2 → op#2 dedups to no-op. Single chokepoint for join+mid-call paths; doesn't break FIX2 retry / join / transactional rollback. Low risk.

## ===== POSTFIX1 R3 RESULT: FIX2 closes S-MIDCALL ✓ BUT R3 found a NEW real defect (DOUBLE-SUBSCRIBE doubled audio, FIX2-introduced). =====
projcore classifies doubled-audio-on-common-path as a must-fix Zoom/Meet-quality regression (not shippable). R3 NOT clean → FIX3 → +2 rounds (R4,R5 post-FIX3 must be clean). The gate is catching cascading issues: FIX2 fixed the blocker, introduced a quality regression, R3 caught it. All other R3 areas clean (critic/recording/orch/acq).

### FIX3 — APPROVED-PLAN @ 2026-06-04, codex implementing (3-agent SFU)
doSubscribeTracks idempotency filter (tracksToSubscribe = tracks not isTrackSubscribed; early-return before stamp/existingMids/snapshots/POST; downstream kindMap+body+reconcile use tracksToSubscribe). Contained to doSubscribeTracks. No FIX2/join/rollback/reconcile-logic/transport/presence change. 3-agent: projcore + opus 2nd validator.

### FIX3 — DONE (commit 716af7e) @ 2026-06-04. 3-agent (projcore + opus 2nd) both SOLID. DOUBLE-SUBSCRIBE CLOSED.
doSubscribeTracks idempotency filter (dedup before stamp/POST/mutation; tracksToSubscribe downstream). No doubled audio on default-muted-join→unmute; S-MIDCALL stays closed; no regression. specs + tsc app/spec 0/0 + ng build green.

### R4 — DISPATCHED @ 2026-06-04 (post-FIX3, +2-rounds rule, round 1 of 2). 5 fresh reviewers over 427d1a7..HEAD.
SFU-subscribe(OPUS: confirm S-MIDCALL closed AND double-subscribe closed + no new gap/regression), recording(sonnet), orchestration+acquisition(sonnet), transport(sonnet), completeness-critic(haiku). Need R4+R5 both blocking-clean.

#### R4 findings — collecting
**R4-completeness-critic (haiku) — DONE. NO confirmed bug, but 2 Priority-1 PUBLISH-side candidates analogous to S-MIDCALL (VERIFY):**
- P1-CAM [VERIFY] mid-call CAMERA enable from zero-track join: doRegisterFirstAddedLocalTrack publish (/api/sfu/tracks) has NO retry on transient CF error → local preview shows but remotes don't see video until user re-toggles. Goal-ADJACENT (JROM original complaint = camera-enable-in-call). BUT publisher-side: visible error + user-recoverable (re-toggle) vs S-MIDCALL silent/unrecoverable. Severity TBD by SFU-opus.
- P1-SCREEN [VERIFY] screen-share START mid-call publish failure: same no-retry. Screen = P2 secondary, user-recoverable.
- P1-SENDER [check] sender state after publish-rollback (replaceTrack(prev) where prev=null for first-camera) — re-toggle recovers; confirm clean.
- P2/P3 (mobile-pause-mid-unmute, recording-5-party-churn, relay-exhaustion-subscribe, rapid-trackName-change) — thin/real-device-seat/low-prob.
DECISION: let R4 SFU-opus (covers publisher register path) weigh in; if it corroborates P1-CAM as a real robustness gap → verify + FIX4 (port FIX2-style retry to mid-call publish-register). If user-re-toggle-recovery deemed sufficient → log as ant.
PENDING: R4 SFU-subscribe(opus), recording(sonnet), orchestration+acquisition(sonnet).
**R4-orchestration+acquisition (sonnet) — DONE. NO findings.** acquisition ladder/queue/camera-optional/join-paths/lifecycle/toggle-dead-track-routing/FIX2-FIX3-idempotency/cleanupCall all clean. 6 ants (stopScreen ordering/re-entrancy, toggleMic acquire, micOn-optimistic-reset, preflight-2-run, visibility-guard — all benign).
PENDING: R4 SFU-subscribe(opus, key — informs P1-CAM publish-retry verdict), recording(sonnet).
**R4-recording (sonnet) — DONE. NO goal-blocking. 3 ant.** record double-tap window during start await (marginal), stop() early-return if MediaRecorder externally inactive (pre-existing device-loss edge), notifyParticipantJoined dup-clientId metadata gap (metadata-only).
=> R4 so far: critic + orch/acq + recording all clean. PENDING: SFU-subscribe(opus) — decisive (both-fixes-closed + P1-CAM publish-retry verdict).
**R4-SFU-subscribe (opus) — DONE. Both fixes CONFIRMED CLOSED. 1 pre-existing residual (VERIFY).**
- S-MIDCALL closed ✓ (FIX2 retry on rejection; FIX3 idempotency doesn't block genuine subscribe). DOUBLE-SUBSCRIBE closed ✓ (FIX3 filter + opQueue serialize + single presence trigger; camera-enable/screen+camera/reconnect all one-transceiver). FIX2+FIX3 interaction clean.
- P1-CAM / P1-SCREEN (completeness-critic publish-retry) → projcore classify ANT: publisher-side, VISIBLE error + USER-RECOVERABLE (re-toggle); not silent/unrecoverable like S-MIDCALL. Log as robustness-ant.
- SILENT-SUCCESS-WATCHDOG [VERIFY] mid-call added track whose subscribe SUCCEEDS but inbound RTP/ontrack never flows (while peer's earlier video flowed) → FIX2 retry doesn't fire (only on rejection), join watchdog per-publisher+disarmed → peer's mid-call audio unheard, no SFU-layer recovery. Same goal-class as S-MIDCALL, different/narrower trigger. Reviewer: PRE-EXISTING (per-publisher first-frame predates FIX2/FIX3), narrow. → opus verifier a3df2b50: reachability + does B2 voice-watchdog/roster/transport recover it + pre-existing? + minimal-risk fix.
=> R4 verdict PENDING the silent-success verification. If real-reachable-no-recovery → FIX5 (per-track mid-call inbound watchdog) + +2 rounds. If near-theoretical/recovered/pre-existing-narrow → log residual, R4 clean.

- SILENT-SUCCESS-WATCHDOG → opus verifier VERDICT: **REAL-but-near-theoretical → ANT (log, do NOT fix).** Nothing recovers it (B2 watchdog ignores flat-bytes by design; roster/transport don't re-subscribe one track) BUT trigger = CF-forwarding anomaly (ack-but-no-RTP for one track while video flows), NOT field-reachable; all REAL mid-call failure modes throw → covered by FIX2. STRICTLY PRE-EXISTING (baseline bare fire-and-forget; FIX2/FIX3 don't touch success-path watchdog). Fix = 3rd SFU-subscribe actor = medium-high regression risk → NOT justified. Decision mirrored JROM/decisions/2026-06-04-postfix-near-theoretical-residual-not-fixed.md. Future-hardening option noted for handback.

## ===== POSTFIX1 R4 RESULT: BLOCKING-CLEAN. =====
Both fixes confirmed closed (S-MIDCALL, double-subscribe). All reviewers clean. P1-CAM/P1-SCREEN = user-recoverable robustness ants. Silent-success = near-theoretical pre-existing ant. R4 = post-FIX3 blocking-clean round 1 of 2.

### R5 — DISPATCHED @ 2026-06-04 (post-FIX3 blocking-clean round 2 of 3 needed). 4 reviewers over 427d1a7..HEAD.
SFU-subscribe(OPUS), recording(sonnet), orchestration+acquisition(sonnet), completeness-critic(haiku). R4 clean=1; need R5+R6 clean → 3 consecutive over final code → HANDBACK.

#### R5 findings — collecting
**R5-recording (sonnet) — DONE. NO findings.** finalize-once / discard-while-stop (withTimeout net) / local-eviction-protected / stream-null-guard / stream-replacement / mime / no-peer-missing all clean.
PENDING: R5 SFU-subscribe(opus), orchestration+acquisition(sonnet), completeness-critic(haiku).
**R5-completeness-critic (haiku) — DONE. ZERO goal-blocking gaps.** Walked all 8 north-star scenarios — each fixed or logged-ant. Verdict: ready for handback. Riskiest residual = publish-retry-transient (logged ant, user-recoverable).
PENDING: R5 SFU-subscribe(opus), orchestration+acquisition(sonnet).
**R5-orchestration+acquisition (sonnet) — DONE. NO findings.** default-muted→unmute / cameraless-mic-only two-way audio / camera-enable-after-no-cam-join-reaches-remotes / queue-no-deadlock / recovery+lifecycle+rejoin+handler-staleness all clean. 1 ant (video-error→audio-only fallback broadened — increases audio reliability).
=> R5 so far: recording + completeness + orch/acq all clean. PENDING: SFU-subscribe(opus) final sign-off.
**R5-SFU-subscribe (opus, final) — DONE. NO new goal-blocking.** 3 stacked SFU changes consistent; S-MIDCALL + double-subscribe stay closed; rollback/reconnect/transport/reconcile sound; no loops/leaked-timers (all timer sets cleared in teardown). 1 ANT (logged): stuck-watchdog re-subscribe (clearPublisherSubscriptionStateForRetry) lacks CF tracks/close → doubled-audio ONLY if acked-but-no-RTP residual AND delayed-RTP-on-abandoned-path = SECOND-ORDER improbable, self-heal-bounded; descendant of the logged near-theoretical residual → log, don't fix (consistent risk discipline).

## ===== POSTFIX1 R5 RESULT: BLOCKING-CLEAN. ===== (post-FIX3 round 2 of 3)
All 4 reviewers clean. completeness-critic: zero goal-blocking gaps across 8 north-star scenarios, "ready for handback". 2 new ants (video-err→audio-only-fallback-broadening = improves audio; watchdog-no-doClose = 2nd-order improbable). R4+R5 clean; need R6 → 3 consecutive over final code.

### R6 — DISPATCHED @ 2026-06-04 (post-FIX3 blocking-clean round 3 of 3, FINAL). 4 reviewers over 427d1a7..HEAD.
SFU-subscribe(OPUS), recording(sonnet), orchestration+acquisition(sonnet), completeness-critic(haiku). If clean → 3 consecutive (R4+R5+R6) → POSTFIX1 DONE → HANDBACK1.

#### R6 findings — collecting
**R6-recording (sonnet) — DONE. NO findings.** (one path = already-logged stop()-early-return device-loss ant).
PENDING: R6 SFU-subscribe(opus), orchestration+acquisition(sonnet), completeness-critic(haiku).
**R6-completeness-critic (haiku) — DONE. ZERO goal-blocking. HANDBACK-READY.** All 8 north-star scenarios fixed or logged-ant; no new findings.
PENDING: R6 SFU-subscribe(opus), orchestration+acquisition(sonnet).
**R6-SFU-subscribe (opus, final-final) — DONE. NO findings.** Dual-subscribe no-double/drop, reconnect re-subscribe, transport-recovery all-hear-all preserved, doSubscribeTracks transactional, first-track register-once, reconcile consistent. "Handback-ready modulo logged ants. No new goal-blocking bug."
=> R6: recording + completeness + SFU-opus all clean. PENDING: orchestration+acquisition(sonnet) — last reviewer before gate closes.
**R6-orchestration+acquisition (sonnet) — DONE. NO findings.** cameraless-mic-only ladder + all paths clean.

## ===== POSTFIX1 R6 RESULT: BLOCKING-CLEAN. =====
## ===== POSTFIX1 GATE SATISFIED: R4 + R5 + R6 = 3 CONSECUTIVE BLOCKING-CLEAN over final post-FIX3 code. → HANDBACK. =====
Total: 6 fan-out rounds (~30 reviewer + ~10 verifier passes). R1 zero-blocking (4 over-claims dismissed). R2 found+fixed S-MIDCALL. R3 found+fixed double-subscribe. R4/R5/R6 clean. Completeness sign-off: handback-ready.
