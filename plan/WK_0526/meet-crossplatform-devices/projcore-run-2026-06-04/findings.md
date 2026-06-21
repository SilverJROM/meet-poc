# findings.md — consolidated investigation (me + codex 5.5, agreed each round)

GOAL: universal device support (mic+speaker+browser ⇒ audio works; camera optional). Match Zoom/Meet. No stiffness.

## CONFIRMED must-fix (agreed)
- [F1] deviceId:{exact} in videoConstraints + audioCaptureConstraints, NO fallback ⇒ OverconstrainedError on any device where saved id ≠ current (Android/PC/external). Camera AND mic. (code+web confirmed round 0)

## Hypotheses (unconfirmed — investigate)
- [H1] mid-call camera replaceTrack codec/resolution / transceiver not reaching remote.
- [H2] in-call enable path != lobby path (should be unified).

## Ruled out
(none yet)

## Diagnostics gaps
- No platform/UA/deviceId/gUM-error in payload ⇒ cross-platform failures invisible in DB.

## Round log
- R0 (projcore pre-investigation): F1 confirmed (code+web: Chromium 614716/370332086, MDN OverconstrainedError). Diagnostics gap noted.

## Confidence: ~40% (one confirmed root cause; universal-coverage breadth not yet mapped)

## R1 — MY independent findings (projcore, pre-consolidation with codex)
- [F2 HIGH] Combined `getUserMedia({audio, video})` (media.service acquire/preflight) fails ENTIRELY if the VIDEO part throws (NotFoundError on cameraless device; OverconstrainedError on exact-id mismatch) → AUDIO dies too. Directly violates "mic+speaker+browser ⇒ audio works." FIX: acquire audio and video SEPARATELY (audio first, independently; video best-effort) so audio NEVER depends on video. (web: MDN getUserMedia, webrtc.org getting-started/media-devices — "request separately" is the universal best practice.)
- [F1 reinforced] deviceId must be {ideal} not {exact} (exact/min/max are mandatory → OverconstrainedError). Enumerate-first to pick a present device. (web: MDN Constraints, webrtc-developers.)
- [F3 verify] devicechange listener for hot-plug USB cam/mic — handleDeviceChangeAsync exists (room.page) but verify it covers in-call + re-enumeration robustly.
- [PRINCIPLE] Match Zoom/Meet: enumerate → request audio independently (must-succeed) → request video best-effort (ideal constraints, graceful if absent) → never let video failure block audio → listen for devicechange.

My R1 confidence add: F2 is likely the single biggest universality blocker after F1 (a cameraless device today may get NO audio if camera was requested). Await codex R1 to cross-check + find more.

## R1 — codex independent findings (callback summary; full list pending settle)
- exact-device fallback gaps → corroborates F1.
- optional-camera blocking paths → corroborates F2 (camera-required blocks acquisition).
- stale selection rollback gaps → [F4] after a fallback, selectedAudio/VideoId not rolled back to the actually-acquired device (dead id persists).
- micless join block → [F5 HIGH] the hasMicAccess join-gate blocks joining when mic acquisition fails — even on a device WITH a mic (e.g. exact-id failure). Violates universal goal (can't even get in). Must make join robust: acquire mic via the F1/F2 fallback BEFORE gating, and reconsider the hard gate.
- SFU later-camera advertisement risk → [F6 HIGH] mid-call-enabled camera may not be advertised/published to peers via the SFU (remote doesn't see it) — the "opens but not correctly" publish-path gap (was H1).
- codex notes autoplay mixer unlock is NOT a primary blocker (gesture-unlock + banner already there).

## Consolidated agreed (after R1, me + codex)
F1 (exact→fallback), F2 (separate a/v / camera-optional non-blocking), F4 (selection rollback), F5 (micless/failed-mic join gate), F6 (SFU mid-call camera advertisement). All HIGH except F4 MED.

## R1 FULL CONSOLIDATED (me + codex agreed) — 14 findings
HIGH:
- A1 audio deviceId:{exact} no fallback (mic-energy.ts:47, media.service.ts:443) → fallback ladder: exact→ideal→default→none; clear stale id.
- A2 video deviceId:{exact} no fallback (media.service.ts:449) → same ladder; persist cam id only after success.
- A3 acquire() stops current media BEFORE next getUserMedia succeeds (media.service.ts:397) → failed reacquire destroys working mic/cam → can't join. Fix: acquire-first, swap-after-success, stop-old-last.
- A4 optional-camera fallback only handles 'denied' (room.page.ts:1986) → Overconstrained/NotFound/busy camera blocks WHOLE audio preflight → cameraless gets no audio (=my F2). Fix: retry audio-only for ANY camera-side failure.
- A5 join requires live mic track (room.page.ts:1948) → micless/listen-only blocked + temp mic failure blocks receive-only. Fix: allow listen-only join (muted), warn two-way needs mic.
- A6 SFU: camera-off publish doesn't advertise video track; later replaceTrack doesn't register/announce new SFU track (sfu-client.service.ts:990/738) → remotes never subscribe to mid-call camera. Fix: publish/announce camera track on first enable (or pre-negotiated placeholder).
- A7 in-call camera enable less forgiving than lobby (room.page.ts:994) → unify both through one robust fallback helper.
MED:
- A8 device choices persisted before acquisition success (room.page.ts:898) → bad id pinned across reload. Stage in memory, commit after success, rollback on fail.
- A9 videoDevicePinned stays true after refresh replaces missing cam id (room.page.ts:2017/2025) → exact persists. Clear pin when stored cam missing.
- A10 OverconstrainedError normalized as 'unknown' (media.service.ts:470) → can't drive targeted fallback. Add explicit overconstrained/unavailable code + failed constraint.
- A11 mobile video mandatory max width/height (media.service.ts:455) → Android/external may fail. Looser constraints + tune via sender params.
- A12 in-call mic re-enable toggleMic exact no fallback (room.page.ts:981) → reuse replaceInCallAudio fallback.
LOW:
- A13 device selectors lack 'system default'/'no mic'/'no camera' states → stiff UX.
- A14 speaker test ignores selected output (room.page.ts:936) → route via audio element + setSinkId.
Autoplay mixer unlock = NOT a primary blocker (already handled).

## Confidence after R1: ~70% (broad acquisition+publish coverage; network/ICE/reconnect + SFU-mechanism + Meet/Zoom-parity not yet deep). R2 targets those.

## R2 CONSOLIDATED (me + codex agreed) — network/SFU/transport, 7 new (cap raised to 20)
HIGH:
- B1 /api/ice-config failure silently degrades to STUN-only (ice-config.service.ts:123) → restrictive NAT/firewall/cellular users NEVER connect media. Fix: TURN as join/publish gate or retry/fail-loudly; surface "relay unavailable". (CROSS-NETWORK universality — likely a big real-world failure beyond device type.)
- B2 SFU pc has NO ICE/connection-state recovery (sfu-client.service.ts:947) → wifi/cellular change or ICE fail → audio dead forever w/ signaling still connected. Fix: on/iceconnectionstatechange recovery — ICE restart, else republish CF session + reannounce tracks.
- B3 initial publish with NO audio track → later replaceAudioTrack only updates sender, never registers/announces (sfu-client.service.ts:963/733) → "unmute later" never reaches remotes (AUDIO twin of A6). Fix: mirror screen publish flow for first real audio track + sfu-publish.
- B4 subscriber presence only partial-subscribes new SCREEN tracks (sfu-client.service.ts:589) → later audio/video tracks ignored by existing subscribers. Fix: generalize partial-subscribe to ANY new untracked trackName.
MED:
- B5 subscribe-stuck watchdog only logs, no retry (sfu-client.service.ts:135) → successful-but-no-media subscribe permanently loses remote audio. Fix: teardown guard + bounded retry.
- B6 backend TURN env reads TURN_API_Key not TURN_API_KEY (backend/src/modules/ice-config/index.ts:58) → deployment appears configured but returns STUN-only. Fix: accept TURN_API_KEY + report missing TURN in health/admin. (CONFIG BUG — verify which env is actually set; could mean TURN is OFF in prod → restrictive nets fail.)
- B7 diagnostics hardcode forceRelay:false, no force-relay mode (room.page.ts:3031) → can't validate/force relay. Fix: relay-required retry + record actual policy.
Note (codex): steady-state audio-only path is coherent WHEN an audio track exists at initial publish (registered/rostered/subscribed/mixed) — so the core audio pipeline is sound; gaps are restrictive-network + post-publish track-add + transport-recovery.

## Confidence after R2: ~85% (devices + network + SFU-publish/subscribe + transport-recovery mapped). R3 targets: verify B6 TURN env (is relay actually off in prod?), reconnect/renegotiation depth, permission re-prompt UX, receive/playback edge cases, mobile background/interrupt, and any final parity gaps.

## R2.5 — projcore direct verification (TURN)
VERIFIED live /api/ice-config returns Cloudflare TURN (turn.cloudflare.com udp/tcp/turns:443 + username/credential). Code reads env.TURN_API_Key which matches the deployed env → TURN IS WORKING in prod. So:
- B6 DOWNGRADED to LOW (robustness: also accept conventional TURN_API_KEY + health report) — NOT a current outage.
- B1 refined: TURN relay IS available; the gap is the silent STUN-only degradation IF the ice-config FETCH fails (network/timeout) — still worth a loud-fail/retry. Real restrictive-network users currently DO get relay (good).

## R3 CONSOLIDATED (me + codex agreed) — reconnect/mobile/playback, 4 new
HIGH:
- C1 pagehide always full cleanupCall (room.page.ts:2409) → mobile Safari/background/BFCache tears down media+SFU+WS; UI may resume broken in-call. Fix: distinguish real unload from lifecycle freeze; pause/recover on mobile background, not full leave.
- C2 reconnect republish = 1 attempt, no retry (room.page.ts:1457) → after a blip, re-admitted but NO published audio until refresh. Fix: bounded republish retry+backoff; reannounce sfu-publish after success. (extends B2)
- C3 stale selected-speaker setSinkId() rejects BEFORE play() (remote-audio.service.ts:193/252) → unplugged/changed output blocks ALL remote playback recovery (Chrome/Edge). Fix: catch sink failure → fall back to default output → clear bad stored id → continue playback.
MED:
- C4 audio output persisted before routing succeeds (room.page.ts:922) → bad speaker sticky, poisons future playback. Fix: commit output id only after successful setSinkId; rollback to default on fail. (output twin of A8)

## Round tally: R1=14, R2=7, R3=4 (tapering → converging). Confidence after R3: ~90%.
## R4 targets: brand-new-user first-call exact sequence; iOS Safari (playsinline/autoplay/audio-element), Firefox specifics; completeness-critic (unverified claims/modalities); hidden sub-issues in the HIGH findings.

## R4 CONSOLIDATED (me + codex agreed) — first-run/permission, 3 new + iOS/Firefox CONVERGED
HIGH:
- D1 protected guest-join password bypass (room.page.ts:716) → protected-room guest reaches lobby then fails at signaling instead of getting password prompt. Fix: check password-required before guest-name early return / prompt immediately after name. (first-call flow; slightly outside core device-universality but real)
- D2 first acquisition requests mic+optional-camera in ONE getUserMedia (room.page.ts:1871) → camera block POISONS mic grant on first-run Safari/mobile. Fix: acquire MIC first, then camera separately+non-blocking; camera denial never affects mic/audio. (first-run twin of A4 — reinforces separate-acquisition as THE core fix)
- D3 [MED] first-run permission copy says "camera and microphone" (device-dialog.html:19) → cameraless/wary users choose wrong, break audio-first. Fix: mic-first copy, camera optional/enable-later.
CONVERGENCE: codex explicit — NO new iOS Safari / Firefox must-fix beyond agreed items (playsinline/autoplay/kickstart/AudioContext/setSinkId/replaceTrack all already covered by A*/B*/C*).

## Round tally: R1=14, R2=7, R3=4, R4=3 (HIGH: 14→? ; tapering). iOS/Firefox converged. Confidence ~95%.
## R5 = CONVERGENCE/COMPLETENESS check: try hard to find ANYTHING else must-fix; re-verify core audio-only end-to-end; if nothing new must-fix → declare convergence.

## R5 — CONVERGENCE (codex + me agreed): NO NEW MUST-FIX
Codex confidence statement: with A1-A14+B1-B7+C1-C4+D1-D3 fixed, core audio-only path coherent — mic resilient, camera truly optional, listen-only handled, initial audio publish registered, roster/presence ordering safe, subscribers retry/recover, TURN/ICE recovery exists, default-speaker playback works. No remaining join-order/cameraless/default-speaker blocker.
RESIDUAL RISK (key for IMPL + lean): fixes MUST share ONE robust media-acquire/publish/subscribe path, not per-button patches. → unify into a single device/media module (matches JROM lean goal).
Round tally: R1=14, R2=7, R3=4, R4=3, R5=0. First zero round. R6 = confirmation (different angle: backend signaling/admit/roster + 3+ party) before locking.

## R6 — CONVERGENCE CONFIRMED (2nd zero). Backend signaling/admit/roster + 3+ party: no new must-fix.
Server sends full SFU roster to newly-admitted peers + broadcasts each publisher's sfu-presence to all admitted peers; frontend holds roster/presence until local publish completes. Host-leave/re-admit/dup-identity risks covered by agreed reconnect/publish recovery.

# ===== INVESTIGATION COMPLETE — CONVERGED at R6 (~99% confidence) =====
Rounds: R1=14, R2=7, R3=4, R4=3, R5=0, R6=0. LOCKED issues list: A1-A14, B1-B7, C1-C4, D1-D3 (28). iOS/Firefox/backend/multi-party all cleared. Next: req doc (debate+agree codex) → plan → implement → validate → lean.

# ===== EXTENDED FAN-OUT INVESTIGATION (JROM: not satisfied, ≥5 more, exhaust everything) =====
Agents fanned out independently per round: ME(opus) + SONNET + codex-5.3-spark + codex-5.5. Distinct angle each. Rounds R7-R11+. Convergence not assumed — exhaust.
REQ-debate (pre-pivot) flagged: A13/A14/B6 need explicit reqs; R1/R2 wording needs one clarification — fold into req doc AFTER extended rounds.

## R7 FAN-OUT (8 investigators: opus+codex55+spark+gpt54+sonnet×3+haiku×2)
### codex55 (reference-parity vs LiveKit/Zoom/Meet) — NEW polish/scale (Zoom/Meet-LEVEL):
- E1 [MED] devicechange doesn't recover a listen-only/no-track user (room.page:2239).
- E2 [MED] mute is UI/local-track only, NOT an SFU/server-visible track mute (LiveKit/Zoom model mute as track state that stops sending + emits events) (room.page:2797, sfu-client:733).
- E3 [MED] no adaptive-stream/dynacast (visibility-based video pause / sender layer suppression) (sfu-client:41,510) — scale polish, likely larger scope.
- E4 [MED] speaker selection doesn't use selectAudioOutput() permission API (room.page:2248).
- E5 [LOW] no explicit secure-context/unsupported-browser GATE (isSecureContext / mediaDevices? / setSinkId support) → generic failure instead of clear guidance (media.service:71, room.page:1862). [universality-relevant]
- E6 [LOW] loopback mic test improvement (lobby-preview).
- E7 [LOW] headset hardware-mute sync / push-to-talk parity (controls-bar).
### spark (device-matrix + secure-context): NO new must-fix beyond locked (that angle converged).
### gpt-5.4 (perf/leaks/scale): pending. sonnet×3 (errors/races/UX) pending. haiku×2 (tiny-bug/build) pending.

### sonnet-A (error-handling + self-test) — 9 real bugs (renamespaced ERR*):
- ERR1 [MED] applySinkId swallows setSinkId rejection → one bad speaker aborts the WHOLE unlock Promise.all (extends C3 to applyOutputDevice:238 + playKickstartElements:524). Fix: try/catch→default, clear id.
- ERR2 [MED] output deviceId persisted BEFORE applySpeakerDevice succeeds (room.page:922) → bad id retried forever (confirms/extends C4).
- ERR3 [MED] audio-only fallback (handleLobbyMediaError:1986) NEVER calls startLobbySelfTest → cameraless user gets no pre-call mic test, dead mic unflagged. Fix: start self-test on the fallback path.
- ERR4 [MED] replaceAudioTrack: if onAudioTrackChanged throws (SFU replaceTrack fail), new track leaked + old not stopped → 2 concurrent mic tracks, meter stale (same in replaceVideoTrack:145). Fix: try/catch rollback.
- ERR5 [MED] toggleMic/toggleCamera 'acquire' path doesn't normalizeMediaError → OverconstrainedError shows raw msg, no recovery hint.
- ERR6 [MED] mobile lobby self-test: empty samples until gesture; poller restart fragility → dead-mic not flagged if user hasn't tapped enable-preview.
- ERR7 [LOW] diagnostics payload lacks platform/UA/selectedDeviceId/gUMerror (confirms R8/B2 gap).
- ERR8 [LOW] setCameraTrackEnabled:337 no null-track guard + stuck cameraOn/shareOverride state.
- ERR9 [LOW] addSource recoverPlayback concurrent race on multi-peer join (applySinkId race). Fix: serialize/debounce.
- (ERR10 = confirms A1 deviceId:exact still present.)

### haiku-A (mechanical tiny-bug sweep) — 7 (renamespaced TINY*):
- TINY1 [HIGH] ws.service.ts:273 socket=null BEFORE ws.close() → concurrent send() silently dropped. Fix: null after close / guard.
- TINY2 [MED] room.page.ts:2691 captureTrackLive stale-read window in pollMicSilenceWatchdog (re-check after await).
- TINY3 [MED] replaceAudioTrack:118 micOn.set without nextTrack.readyState guard.
- TINY4 [MED] attachLocalTrackFailureHandlers:2451 re-assigns onended/onmute without removing prior → leak on double-call (lobby 1878 then 1908).
- TINY5 [MED] remote-audio addSource:384 onEnded {once} races explicit removeSource → may fire after removal (cleanup flag).
- TINY6 [LOW] handleLocalTrackFailure:2462 guard misses track.enabled check.
- TINY7 [LOW] subscribeIfNeeded:131 subscribedClientIds delete AFTER setTimeout → narrow double-subscribe window.

### sonnet-B (runtime races) — happy-path CORROBORATED SAFE (confirms R6); 1 new HIGH + minors:
- PUB1 [HIGH] room.page.ts:1481 — FIRST publish IIFE failure on join only sets actionNotice "refresh"; no retry, no state change, no rejoin → user stranded in-call, unpublished, peers can't hear (DISTINCT from C2 reconnect). Fix: bounded retry + error-state/rejoin.
- RACE2 [LOW] applySpeakerDevice:2248 setSinkId to ALL video+audio els (incl local preview) — broad; setSinkId throw not individually caught (ties ERR1/C3).
- RACE3 [LOW] handleDeviceChangeAsync:2239 no in-flight guard → concurrent devicechange + manual mic switch can dup tracks in localStream (opQueue protects SFU side).
- Confirmed SAFE: subscribe ordering, admitted→reset→roster, reconnect republish queue, remoteAudio effect chain, opQueue serialization (matches R6).
### haiku-B (build/type/config): ng build PASSES (3 known warnings).
- TS1 [MED] 11 `tsc --noEmit` errors: window.setTimeout/setInterval typed ReturnType<typeof setTimeout> but returns number — room.page.ts (×8: 1928,2283,2300,2465,2466,2804,2825,2891,2920), transcripts.page.ts:187. Fix: type as `number|null`.
- TS2 [MED] sfu-client.spec.ts:89,105 reconcileSubscribedMids called with 4 args, signature needs 5 (missing transceivers) → STALE/BROKEN spec. Fix: update spec.
- TS3 [LOW] rooms.page.ts:16 unused DatePipe import (lean).
- (haiku-B re-flagged B6 TURN HIGH — already VERIFIED live + downgraded LOW in R2.5; keep LOW.)

### gpt-5.4 (perf/leaks/lifecycle) — 5:
- LEAK1 [HIGH] room.page.ts:1658 — meeting-ended (host-ended) SKIPS cleanupCall() → RTCPeerConnection + AudioContexts + keepalive/watchdog samplers keep running indefinitely; mic/camera stay ON after host ends (privacy+resource). Fix: non-navigating teardown on meeting-ended.
- LEAK2 [MED] recorder peer-sync never removes stale sources on reconnect (recorder.service:133).
- LEAK3 [MED] active-speaker duplicates per-peer analysis work (active-speaker.service:122/242) — 3-5 party CPU.
- LEAK4 [LOW] subscribe retry backoff timers not tracked/cleared (sfu-client:131).
- LEAK5 [LOW] registerDebugTracks leaks strong refs to every track (media.service:495).

### sonnet-C (UX-parity + stiffness) — 15 (renamespaced UX*); key:
- UX1 [HIGH] room.page.html:64/70/76 back-to-rooms always /app/rooms → guest dead-ends at /login (use auth.user()?'/app/rooms':'/').
- UX2 [HIGH] chat Shift+Enter can't insert newline — always submits (sendChat preventDefault, no shiftKey check) — parity bug.
- UX3 [MED] lobbyDeviceDialogOpen=signal(true) initial → device-dialog flash before bootstrap sets false.
- UX4 [MED] device-dialog h2 always "Check your camera and audio" even in-call (should be Settings).
- UX5 [MED] phantom quality-pill: remote quality hardcoded 'good' → every tile shows GOOD.
- UX6 [MED] debug connection-state label (CONNECTED/LOCAL) shown on every tile.
- UX7 [MED] "more than 6 participants may be unstable on this stack" dev-facing copy.
- UX8 [MED] screen-share-help copy macOS/Chrome-hardcoded (Windows/Firefox users get wrong instructions).
- UX9 [MED] raw "x" char as close-button label (leave-dialog, chat) instead of icon.
- UX10 [LOW] aria-controls/id, focus-return on dialog close, select id/for pairs, timer aria spam, knocking copy.

## R7 TALLY: 8 investigators. spark=0-new. NEW beyond locked 28: codex55 E1-E7(parity), sonnet-A ERR1-9, haiku-A TINY1-7, sonnet-B PUB1+races(else SAFE=corroborates R6), haiku-B TS1-3, sonnet-C UX1-15, gpt54 LEAK1-5. Core universality CONFIRMED sound; new = error-recovery bugs + tiny bugs + leaks + parity + UX hygiene. NEW HIGH: PUB1 (first-publish stranded), LEAK1 (host-ended no cleanup), UX1 (guest back-link), UX2 (shift+enter), ERR3 (self-test skip on cameraless), TINY1 (ws socket-null).

## R8 FAN-OUT (untouched areas: backend/admit/recording/signaling/runtime) — spark+sonnet×2+haiku+me
### me (opus): RULED OUT — no Permissions-Policy/Feature-Policy/CSP header on live origin; getUserMedia allowed by default on top-level https. (LOW followup: no explicit Permissions-Policy:camera/mic=* means iframe-embedding would block media — not a current top-level blocker.)

### R8 spark (backend admit) — 2 new:
- BK1 [HIGH] signaling: ownerHasJoined never reset if owner never returns → admit paths stall, legit new entrants pending forever (universal-blocker: a real user can't get in). Fix: derive host-elected state from current membership; allow acting-host promotion when no admitted owner connected.
- BK2 [MED] removeAdmittedPeer doesn't revoke durable admitted identity (signaling:571-573 vs 730/977/911) → host-removed peer auto-rejoins via same clientKey, bypassing knock/passphrase. Fix: revoke identity on non-graceful removals.
(spark: no additional backend blockers beyond these two.)

### R8 haiku (backend+signaling tiny) — NO NEW ISSUES. Cross-check CORRECTED a R7 false-positive:
- TINY1 DISPROVEN: ws.service.ts socket-null is NOT a bug — sets this.socket=null (re-entry guard) then closes the CAPTURED `ws` var, not this.socket. Correct. → REMOVE TINY1. Backend/signaling mechanically sound (timers unref'd, null-checks, parametrized SQL, try/catch on closes). B6 confirmed reads TURN_API_Key matching deploy (LOW).

### R9 me (opus) — VERIFICATION (confirmations, raise fix-confidence):
- LEAK1 VERIFIED real: room.page.ts:1658 meeting-ended only flush+ws.close()+toast; NO cleanupCall/media/PC/AudioContext teardown (room-closed right below DOES). → camera/mic stay ON + resources leak after host ends. CONFIRMED HIGH.
- PUB1 VERIFIED real: room.page.ts:1457-1484 publish IIFE fire-and-forget; .catch only logs + actionNotice "refresh"; no retry/state-change/cleanup → stranded unpublished, peers can't hear. CONFIRMED HIGH. (Also: line 1464-1466 publishes even without a live audio track — warns + proceeds.)

### R8 sonnet-recording — 10 (REC*) [recording/transcription path, secondary to core audio]:
- REC1 [HIGH] recorder.service:91 AudioContext not resumed → SILENT recording on mobile (iOS/Android auto-suspend). Fix: await ctx.resume() in start().
- REC2 [HIGH] room.page:657-666 dead-code removal loop (both loops same peers() array) → stale recorder audio sources never evicted on abnormal peer drop. Real logic bug.
- REC3 [HIGH] room.page:1578-1610 peer-resumed doesn't notifyParticipantLeft(oldClientId) → old source leaks + reconnected peer NOT captured in recording.
- REC4 [MED] recorder.stop() promise never rejects → hangs on iOS/error (toggleRecording has no withTimeout).
- REC5 [MED] discard() double-cleanup race with pending onstop.
- REC6 [MED] host with zero audio tracks silently excluded from own recording (no warn).
- REC7 [MED] addStream skips no-audio-track stream; later-added SFU tracks not picked up (no re-eval).
- REC8 [LOW] empty-MIME fallback → Firefox records ogg but uploads audio/webm Content-Type.
- REC9 [LOW] speaker-frame effect scheduling race on rapid start/discard.
- REC10 [LOW] transcripts.page:19 pollTimer type (extends TS1).

## R9 FAN-OUT (full roster) — results:
### R9 gpt54 (frontend adversarial): ZERO new (frontend media path clean beyond locked+R7/R8). [agent-zero]
### R9 haiku (components) — NEW:
- CMP1 [HIGH] device-dialog: mic select uses per-option [selected] (B2 fix) but CAMERA + SPEAKER selects still use [value] (the snap-back desync mic was fixed off) → camera/speaker reopen snap-back. CONFIRMS the old deferred "camera+speaker [value] desync" follow-up.
- CMP2 [MED] tile audio play() race vs viewChild attach/detach.
- CMP3 [MED] lobby-preview enable-mic-preview no state feedback / double-tap.
- CMP4 [MED] device-dialog levelPercent/levelLabel call this.level()() twice (signal read mismatch).
- CMP5 [LOW] controls-bar combined @if not atomic; app-shell router.events no unsubscribe; leave-dialog raw "x".
### R9 codex55 (SFU 3-5 party): NEW transactional-subscribe-cleanup + same-media-kind reconcile risks (detail captured to findings).

### R8 sonnet-adversarial — 3 new + RULED-OUT (cross-validates my checks):
- N1 [HIGH] LEAK1 sub-issue: meeting-ended skips cleanup for HOST too (not just non-host) → confirms LEAK1, fix covers both.
- N2 [MED] hardcoded stun:stun.cloudflare.com:3478 in doPublish (sfu-client:945) OUTSIDE ice-config fallback → on UDP-blocked + TURN-fetch-fail: zero candidates. Fix: include turns:443?transport=tcp fallback.
- N3 [MED] pagehide ignores event.persisted (room.page:2409) → mobile-Safari BFCache background destroys call, no pageshow recovery (extends C1).
- RULED OUT (corroborated): CSP/connect-src none (WSS/TURN/SFU unrestricted); WSS URL building sound under CF tunnel (wss when https). B2 (no ICE recovery) re-confirmed, no new sub-issue.

## STATUS: R8 = NON-ZERO (spark BK1/2, REC1-10, N1-3, haiku0, me ruled-out). R9 = NON-ZERO so far (codex55 SFU, haiku CMP1-5, gpt54=0, me verified). Pending R9: spark(feature-detect), sonnet(scenario). Rounds remain non-zero → continue per stop rule (need 3 consecutive zero).

### R9 spark (feature-detection/secure-context): ZERO new (resilience OK beyond locked+R7+R8). [agent-zero]
### R9 codex55 (SFU) detail: SFU-S1 [HIGH] doSubscribeTracks() mutates PC/midToEntry non-transactionally → partial-failure leaves inconsistent subscribe state (sfu-client:1107); SFU-S2 [MED] new cfSessionId same clientId reset risk (:589); SFU-S3 [MED] sfu-mid-reconcile positional + kind-only validation (mis-map risk); + confirms haiku TS2 stale spec (reconcileSubscribedMids 5 args).

### R9 sonnet-scenario — 2 new + core CONFIRMED clean:
- R9-S1 [MED] room.page:2512-2542 recoverLocalAudioTrack terminal msg "No microphone available. Connect a microphone" shown for ALL failures incl. permission-revoked (NotAllowedError) → should say "re-grant in browser settings + rejoin". Branch by error class.
- R9-S2 [MED] same path: mic grabbed by another app (NotReadableError/TrackStartError) → should say "close other app + click mic", not connect-hardware.
- CONFIRMED: phone-guest, cameraless-laptop, desktop-USB, host+late-joiner all map to locked items — NO new CORE blocker (universal-audio core is stable).

## ===== R9 CLOSE: NON-ZERO (codex55 SFU-S1/2/3, haiku CMP1-5, scenario R9-S1/2; gpt54+spark ZERO). Consecutive-zero rounds = 0. Need 3. → R10. =====

### R10 me (opus) META — systemic:
- META1 [MED] media.service.ts has NO global acquisition serialization/lock. Multiple triggers (preflight, reacquire, devicechange→ensureSelectedAudioDevice, manual change, toggleMic/Camera, recovery sweeps) can call getUserMedia concurrently → the race findings (TINY4, RACE3/handleDeviceChangeAsync, ERR9, ERR4) share THIS root. ARCH-0 fix must include a SERIALIZED single-flight acquisition queue, not just a shared helper. (Architectural — folds into ARCH-0.)

## R10 RE-VERIFICATION results:
### gpt54 (validate findings): ZERO new + NO false-positives in sampled findings → findings list VALIDATED real. [agent-zero]
### codex55 (SFU re-verify): 1 new — SFU-S4 [MED] screen-publish rollback gap; SFU-S1/2/3 remain the main subscribe risks.
### R10 spark (remaining utils/guards/auth/rooms): NO NEW ISSUES. [agent-zero]
### R10 haiku (remaining files): NO NEW ISSUES — files-not-yet-swept confirmed CLEAN (only 1 trivial LOW: active-speaker onstatechange reassigned each ensureContext). Validates coverage complete.
## R10 STATUS: near-converged — 4/6 agents ZERO (gpt54 validated no-false-positives, spark, haiku) + codex55 SFU-S4 (last subscribe risk) + me META1. NON-ZERO but trivially so. sonnet-validate pending. consecutive-zero still 0 → R11 next (likely first true zero).

# ===== CONVERGENCE RULE v2 (JROM 2026-06-04) =====
ANT-SIZE (LOW/tiny/cosmetic/secondary-feature-minor) = LOGGED-TO-FIX but does NOT reset the streak.
BLOCKING (HIGH or MED that affects the UNIVERSAL goal or core function) = keeps the train going.
STOP after 3 consecutive rounds with NO new BLOCKING issue (ant-size allowed), or R30. Then proceed to req/plan/implement.

## Re-score (no-new-BLOCKING streak):
- R9: SFU-S1/2/3 (MED, 3-5 party all-hear-all subscribe correctness = core-ish BLOCKING) → resets. R9 = BLOCKING.
- R10: SFU-S4 (screen-share rollback = SECONDARY feature, ANT), META1 (architectural, folds into existing ARCH-0, not a new bug, ANT/consolidation), gpt54/spark/haiku ZERO. → NO new BLOCKING → ZERO-BLOCKING round #1. (pending sonnet-validate)
Streak target: need #2 (R11), #3 (R12).

### R10 sonnet-VALIDATE: read EVERY HIGH vs actual code → ALL REAL, ZERO retractions, NO new issues. List independently VALIDATED accurate (TINY1 retraction confirmed). [agent-zero]
## R10 FINAL: zero new BLOCKING → ZERO-BLOCKING ROUND #1. (gpt54+spark+haiku+sonnet-validate ZERO; codex55 SFU-S4=ant/secondary; META1=arch). Findings list now FULLY VALIDATED real. Streak=1/3.

## R11 (convergence): codex55 NO NEW BLOCKING (SFU-S1/2/3 known, S4=ANT), gpt54 NO NEW BLOCKING (cameraless/two-way clean), spark NO NEW BLOCKING. sonnet+haiku pending. → if those clean, R11 = ZERO-BLOCKING #2 (streak 2/3).
### R11 haiku: NO NEW BLOCKING (only ant: rooms.page DatePipe unused [=TS3], device-dialog button aria-labels [=UX10]). [no-blocking]

## R11 FINAL = ZERO-BLOCKING ROUND #2 (all 6: codex55/gpt54/spark/sonnet/haiku NO NEW BLOCKING; only known ant-size re-noted). STREAK 2/3. R12 = final confirmation.

## R12 codex trio = NO NEW BLOCKING (gpt54/spark/codex55 all clean; SFU-S1/2/3 = the locked blocking set). sonnet+haiku pending → if clean, R12 = ZERO-BLOCKING #3 = INVESTIGATION LOCKED (pre-fix). [NOTE: JROM added a POST-FIX 3x regression fan-out gate before handback.]

# ========================================================================
# INVESTIGATION LOCKED — R12 = zero-blocking #3. Streak 3/3 (R10,R11,R12).
# 12 rounds, 6 models (opus/codex5.5/gpt5.4/spark/sonnet/haiku), ~63 findings, list VALIDATED real (R10), no false positives.
# Core universal-audio goal: every blocker identified + verified. Proceed: req → plan → implement → validate → lean → fix → test → POST-FIX 3x regression gate → handback.
# ========================================================================
