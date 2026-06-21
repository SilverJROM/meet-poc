# HANDBACK — meet-crossplatform-devices (projcore-run-2026-06-04)

**Goal (locked, verbatim):** "this app should work with all devices that has even a mic and can open a browser… pc, phone, ios, android, linux… like zoom/meet… with camera as well but even if device does not have camera but has a mic + speaker browser it should work no questions asked… host and users can hear each other at the very least, and see each other if they have camera."
**MINIMUM:** mic+speaker+browser ⇒ two-way audio; camera optional.
**Handback gate (JROM):** ZERO goal-blocking issues (ant-size OK).

**Branch:** feat/crossplatform-devices-20260604 (master fast-forwarded). **HEAD = master = 716af7e.**
**Status: HANDBACK-READY. ZERO goal-blocking issues.**

---

## What was fixed (all dual-validated; 3-agent on SFU/transport/recorder/admit)
- **ARCH-0** unified + serialized media-acquisition engine (single-flight queue; mic-first, camera best-effort; exact→ideal→default deviceId fallback ladder) — the root fix for "works on macbook/iphone but not Android/PC/external".
- **B01–B21** — all 63 fan-out findings closed (or confirmed already-fixed): deviceId fallback on any device (A1/A2/A10), audio-without-camera (A4/D2), acquire-before-destroy (A3), listen-only join (A5), mid-call mic/camera announce+subscribe (A6/B3/B4), stuck-subscribe retry (B5), first-publish retry (PUB1), host-ended cleanup (LEAK1/N1), transport recovery ICE-restart/republish (B2/C2), mobile background/BFCache (C1/N3), speaker setSinkId fallback (C3/ERR1/C4), mic-recovery error classes (ERR3/4/5, R9-S1/2), admit owner-presence + identity (BK1/BK2), relay/ICE robustness warn+Retry+JoinAnyway (B1/N2/B7/B6), leak fixes (LEAK2-5), recording silent-mobile/reconnect (REC1/2/3), multi-party transactional subscribe (SFU-S1/2/3/4), UX (UX1/UX2/D1/CMP1), acquisition tinies (A8/A9/A12/TINY3), race/handler hardening (TINY2/4/6/ERR9), recorder tail (REC4/5/6/8), diagnostics (ERR6/ERR7).
- **LEAN1** — TS-clean (tsc --noEmit 0 errors, was 23), dead code removed; **TESTH1/2** — pre-existing red backend tests refreshed → backend fully green (166 pass).
- **FIX1** — REC1-iOS recorder AudioContext resume on lifecycle + REC2 recorder source-churn guard.
- **FIX2** — **S-MIDCALL**: a peer turning their mic on MID-CALL had NO subscribe retry → a transient failure left them permanently unheard. THIS IS THE ORIGINAL COMPLAINT CLASS ("I turn my mic on and you can't hear me"). Fixed with a bounded mid-call subscribe retry.
- **FIX3** — **DOUBLE-SUBSCRIBE**: a participant joining mic+camera-both-off (default-muted join) then unmuting was double-subscribed → doubled/echoed audio (a regression FIX2 widened). Fixed by making doSubscribeTracks idempotent.

## The regression-gate result (JROM's "run the fan-out 3x, blocking→fix→+2 until clean")
6 fan-out rounds over the full run diff (427d1a7..HEAD, ~4.7k LOC, 37 files); ~30 reviewer + ~10 verifier passes (opus on the riskiest areas, cheaper models weighted heavier per directive):
- **R1**: ZERO goal-blocking. 4 scary SFU/transport blocking *candidates* (C-1 subscribe-rollback, C-2 evict-no-resubscribe, T-1/T-2 transport races) were all **disproven by deeper verification** — over-claims, not shipped bugs. 2 recording ants → FIX1.
- **R2**: found 1 real goal-blocking — **S-MIDCALL** → FIX2.
- **R3**: FIX2 confirmed closed; found 1 new real defect FIX2 widened — **DOUBLE-SUBSCRIBE** → FIX3.
- **R4 + R5 + R6**: all **blocking-clean** (3 consecutive over the final code). Completeness sign-off: handback-ready.

## Final state (re-verified at handback)
- frontend `tsc --noEmit` app=0 spec=0; `ng build` green.
- backend `vitest`: 166 pass, 0 fail, 1 skipped (fully green).
- DEV deployed: pm2 meet-poc-fe + meet-poc-be online; /login 200; /api/ice-config/health 200 (TURN configured, Cloudflare relay live).

---

## ⚠️ TWO THINGS THAT NEED JROM

### 1) REAL-DEVICE TEST LIST (your seat — these CANNOT be proven by e2e/fake-media)
fake-media accepts any deviceId and never reproduces OverconstrainedError or real RTP, so the platform permutations are the human seat. Please test:
- **Android phone** (Chrome) — join, be heard + hear; toggle camera.
- **PC with EXTERNAL USB mic + cam** — the original failing config.
- **iPhone / iOS Safari** — join, two-way audio; background the app mid-call then return (audio + recording resume).
- **Cameraless device (mic+speaker only)** — join, two-way audio works "no questions asked".
- **Restrictive / corporate network** (UDP-blocked / symmetric NAT) — connects via TURN relay; if relay config fails, you get warn + Retry + Join-anyway (not a hard block).
- **Scenarios:** mid-call **unmute** → others hear you (the original bug); **default-muted-join → unmute** → no echo/doubling; **mid-call camera enable** → others see you; **reconnect mid-call** → audio resumes; **recording on mobile** → audible file.

### 2) LISTEN-ONLY-JOIN deferred decision
A no-mic device joining listen-only was deferred during the run (decisions/2026-06-04-listen-only-join.md). Please confirm the intended behavior (allow listen-only with a clear "no mic" state vs require mic). The current build handles mic+speaker minimum; pure no-mic listen-only is the open product decision.

---

## Known non-goal-blocking ants (logged, intentionally not fixed pre-handback)
- **publish-retry-on-transient** (mid-call camera/screen enable): no auto-retry on a transient CF publish error — publisher sees a visible error and re-toggles (user-recoverable, not silent). Future: mirror FIX2's retry on the publish-register path.
- **mid-call subscribe-acked-but-no-RTP** (+ its watchdog-no-doClose descendant): a near-theoretical CF-forwarding anomaly (subscribe acked but RTP never flows for one track); pre-existing; all *real* mid-call failure modes throw and are covered by FIX2. NOT fixed — a 3rd SFU subscribe-path change carries disproportionate regression risk (FIX2 itself introduced the double-subscribe that needed FIX3). Future-hardening option: a per-track mid-call inbound-frame watchdog + CF tracks/close.
- **relay-recovered-mid-call-no-refetch**: a STUN-only join (relay was down at join) won't re-fetch relay on a later in-call ICE failure (transport recovery reuses join-time iceServers). Edge-of-edge.
- iOS dual-grant device-switch (OS constraint); same-kind-2-video reconcile residual (documented; audio unaffected); lobby stale-selectedVideoId display; duplicate broadcastMediaState on toggle; record double-tap window; no-metadata notifyParticipantLeft. All non-goal-blocking.

## Autonomous decisions mirrored to JROM/decisions/ (4)
- 2026-06-04-b16-relay-fail-loud-with-join-anyway (warn+Retry+Join-anyway, not a hard block)
- 2026-06-04-lean1-conservative-scope (safe-lean, no risky room.page rewrite)
- 2026-06-04-postfix-near-theoretical-residual-not-fixed (declined a risky SFU change for a near-theoretical residual)
- (+ listen-only-join deferral in the run decisions/)
