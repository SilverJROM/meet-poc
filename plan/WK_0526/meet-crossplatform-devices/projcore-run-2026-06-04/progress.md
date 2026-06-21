# progress.md — meet-crossplatform-devices

| Batch | Req | Dispatched | Est | State | Gate |
|-------|-----|-----------|-----|-------|------|
| B1 | R1 | (pending) | ~30m | QUEUED | — |
| B2 | R2 | (pending) | ~30m | QUEUED | — |

## Log
- 2026-06-04 ~20:00 Manila — Run created. CONFIRMED root cause: deviceId:{exact} in video/audio constraints, no fallback → OverconstrainedError on devices where saved id ≠ current (Android/PC/external); macbook matches→works. Fake-media e2e masked it (synthetic devices accept any id) — 2nd masked failure after #121673. B1=exact→fallback (cam+mic, all paths); B2=platform/device/error diagnostics capture. codex 5.5. Real-device proof = JROM seat (NOT e2e).
[overmind] 2026-06-04T12:21:54+00:00 register OK run_dir=/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04 wf=24
[overmind] 2026-06-04T12:24:06+00:00 sync OK current='' tasks=0
[overmind] 2026-06-04T12:24:16+00:00 sync OK current='Find why the app is not universal across devices (me + codex, loop to 99% confidence)' tasks=5
[overmind] 2026-06-04T12:41:17+00:00 sync OK current='Agree the requirements doc with codex' tasks=5
[overmind] 2026-06-04T12:45:46+00:00 sync OK current='Find why the app is not universal across devices (me + codex, loop to 99% confidence)' tasks=5
[overmind] 2026-06-04T13:27:22+00:00 sync OK current='Agree the requirements doc with codex' tasks=5
[overmind] 2026-06-04T13:31:17+00:00 sync OK current='Make camera/mic work on every device (codex 5.5 implements, per-batch; ARCH-0 unified media engine first)' tasks=5
arch0 dispatched_at: 2026-06-04T13:31:27Z estimate_min: 30 bucket: MEDIUM — Build the unified media engine (devices work the same everywhere)
[overmind] 2026-06-04T13:31:30+00:00 sync OK current='Make camera/mic work on every device (codex 5.5 implements, per-batch; ARCH-0 unified media engine first)' tasks=5
[overmind] 2026-06-04T13:31:31+00:00 sync OK current='Make camera/mic work on every device (codex 5.5 implements, per-batch; ARCH-0 unified media engine first)' tasks=5
[overmind] 2026-06-04T13:31:31+00:00 sync OK current='Make camera/mic work on every device (codex 5.5 implements, per-batch; ARCH-0 unified media engine first)' tasks=5
[overmind] 2026-06-04T13:31:51+00:00 sync OK current='Make camera/mic work on every device (codex 5.5 implements, per-batch; ARCH-0 unified media engine first)' tasks=5
[overmind] 2026-06-04T13:32:11+00:00 sync OK current='Make camera/mic work on every device (codex 5.5 implements, per-batch; ARCH-0 unified media engine first)' tasks=5
[overmind] 2026-06-04T13:32:31+00:00 sync OK current='Make camera/mic work on every device (codex 5.5 implements, per-batch; ARCH-0 unified media engine first)' tasks=5
[overmind] 2026-06-04T13:32:51+00:00 sync OK current='Make camera/mic work on every device (codex 5.5 implements, per-batch; ARCH-0 unified media engine first)' tasks=5
[overmind] 2026-06-04T13:35:39+00:00 sync OK current='Build the unified media engine so devices behave the same everywhere (ARCH-0/META1)' tasks=25
[overmind] 2026-06-04T13:39:15+00:00 sync OK current='Make camera/mic open on any device, not just where settings were saved (A1/A2/A10 deviceId ladder, all paths)' tasks=25
B02 dispatched_at: 2026-06-04T13:39:50Z estimate_min: 30 bucket: MEDIUM — Make camera/mic open on any device (deviceId fallback, all paths)
[overmind] 2026-06-04T13:39:53+00:00 sync OK current='Make camera/mic open on any device, not just where settings were saved (A1/A2/A10 deviceId ladder, all paths)' tasks=25
[overmind] 2026-06-04T13:39:53+00:00 sync OK current='Make camera/mic open on any device, not just where settings were saved (A1/A2/A10 deviceId ladder, all paths)' tasks=25
[overmind] 2026-06-04T13:39:54+00:00 sync OK current='Make camera/mic open on any device, not just where settings were saved (A1/A2/A10 deviceId ladder, all paths)' tasks=25
[overmind] 2026-06-04T13:40:13+00:00 sync OK current='Make camera/mic open on any device, not just where settings were saved (A1/A2/A10 deviceId ladder, all paths)' tasks=25
[overmind] 2026-06-04T13:40:33+00:00 sync OK current='Make camera/mic open on any device, not just where settings were saved (A1/A2/A10 deviceId ladder, all paths)' tasks=25
[overmind] 2026-06-04T13:40:34+00:00 sync OK current='Make camera/mic open on any device, not just where settings were saved (A1/A2/A10 deviceId ladder, all paths)' tasks=25
[overmind] 2026-06-04T13:44:23+00:00 sync FAIL (best-effort, continuing):  must be 120 characters or fewer","value":"POST-FIX regression fan-out (full roster) auditing the COMPLETE post-lean codebase — 3 rounds; any BLOCKING -> fix -> +2 rounds until blocking-clean"}]}422
[overmind] 2026-06-04T13:44:37+00:00 sync OK current='Make camera/mic open on any device, not just where settings were saved (A1/A2/A10 deviceId ladder, all paths)' tasks=27
[overmind] 2026-06-04T13:47:15+00:00 sync OK current='Always get audio even if the camera is missing or blocked (A4/D2/A11 mic-first, camera-separate)' tasks=27
B03 dispatched_at: 2026-06-04T13:47:47Z estimate_min: 25 bucket: MEDIUM — Always get audio even if camera missing/blocked; looser mobile video
[overmind] 2026-06-04T13:47:50+00:00 sync OK current='Always get audio even if the camera is missing or blocked (A4/D2/A11 mic-first, camera-separate)' tasks=27
[overmind] 2026-06-04T13:47:50+00:00 sync OK current='Always get audio even if the camera is missing or blocked (A4/D2/A11 mic-first, camera-separate)' tasks=27
[overmind] 2026-06-04T13:47:51+00:00 sync OK current='Always get audio even if the camera is missing or blocked (A4/D2/A11 mic-first, camera-separate)' tasks=27
[overmind] 2026-06-04T13:48:10+00:00 sync OK current='Always get audio even if the camera is missing or blocked (A4/D2/A11 mic-first, camera-separate)' tasks=27
[overmind] 2026-06-04T13:48:31+00:00 sync OK current='Always get audio even if the camera is missing or blocked (A4/D2/A11 mic-first, camera-separate)' tasks=27
[overmind] 2026-06-04T13:48:31+00:00 sync OK current='Always get audio even if the camera is missing or blocked (A4/D2/A11 mic-first, camera-separate)' tasks=27
[overmind] 2026-06-04T13:51:16+00:00 sync OK current='Never drop a working mic/camera while switching devices (A3 acquire-before-destroy)' tasks=27
B04 dispatched_at: 2026-06-04T13:51:19Z estimate_min: 20 bucket: SHORT — Never drop a working mic/camera while switching (verify)
[overmind] 2026-06-04T13:51:22+00:00 sync OK current='Never drop a working mic/camera while switching devices (A3 acquire-before-destroy)' tasks=27
[overmind] 2026-06-04T13:51:22+00:00 sync OK current='Never drop a working mic/camera while switching devices (A3 acquire-before-destroy)' tasks=27
[overmind] 2026-06-04T13:51:23+00:00 sync OK current='Never drop a working mic/camera while switching devices (A3 acquire-before-destroy)' tasks=27
[overmind] 2026-06-04T13:51:42+00:00 sync OK current='Never drop a working mic/camera while switching devices (A3 acquire-before-destroy)' tasks=27
[overmind] 2026-06-04T13:52:02+00:00 sync OK current='Never drop a working mic/camera while switching devices (A3 acquire-before-destroy)' tasks=27
[overmind] 2026-06-04T13:52:23+00:00 sync OK current='Never drop a working mic/camera while switching devices (A3 acquire-before-destroy)' tasks=27
[overmind] 2026-06-04T13:52:43+00:00 sync OK current='Never drop a working mic/camera while switching devices (A3 acquire-before-destroy)' tasks=27
[overmind] 2026-06-04T13:52:43+00:00 sync OK current='Never drop a working mic/camera while switching devices (A3 acquire-before-destroy)' tasks=27
[overmind] 2026-06-04T13:56:06+00:00 sync OK current='Let people join with no camera and even no mic (listen-only) (A5)' tasks=27
B05 dispatched_at: 2026-06-04T13:57:22Z estimate_min: 25 bucket: MEDIUM — Never block a mic-capable device from joining (+ listen-only flag)
[overmind] 2026-06-04T13:57:25+00:00 sync OK current='Let people join with no camera and even no mic (listen-only) (A5)' tasks=27
[overmind] 2026-06-04T13:57:26+00:00 sync OK current='Let people join with no camera and even no mic (listen-only) (A5)' tasks=27
[overmind] 2026-06-04T13:57:26+00:00 sync OK current='Let people join with no camera and even no mic (listen-only) (A5)' tasks=27
[overmind] 2026-06-04T13:57:46+00:00 sync OK current='Let people join with no camera and even no mic (listen-only) (A5)' tasks=27
[overmind] 2026-06-04T13:58:06+00:00 sync OK current='Let people join with no camera and even no mic (listen-only) (A5)' tasks=27
[overmind] 2026-06-04T13:58:26+00:00 sync OK current='Let people join with no camera and even no mic (listen-only) (A5)' tasks=27
[overmind] 2026-06-04T13:58:47+00:00 sync OK current='Let people join with no camera and even no mic (listen-only) (A5)' tasks=27
[overmind] 2026-06-04T13:58:47+00:00 sync OK current='Let people join with no camera and even no mic (listen-only) (A5)' tasks=27
[overmind] 2026-06-04T13:59:53+00:00 sync OK current='When someone turns their mic on later, others actually hear them (B3 announce first audio)' tasks=27
B06 dispatched_at: 2026-06-04T14:00:29Z estimate_min: 35 bucket: MEDIUM — When someone turns mic/camera on mid-call, others hear/see them (SFU announce)
[overmind] 2026-06-04T14:00:32+00:00 sync OK current='When someone turns their mic on later, others actually hear them (B3 announce first audio)' tasks=27
[overmind] 2026-06-04T14:00:32+00:00 sync OK current='When someone turns their mic on later, others actually hear them (B3 announce first audio)' tasks=27
[overmind] 2026-06-04T14:00:33+00:00 sync OK current='When someone turns their mic on later, others actually hear them (B3 announce first audio)' tasks=27
[overmind] 2026-06-04T14:00:52+00:00 sync OK current='When someone turns their mic on later, others actually hear them (B3 announce first audio)' tasks=27
[overmind] 2026-06-04T14:01:13+00:00 sync OK current='When someone turns their mic on later, others actually hear them (B3 announce first audio)' tasks=27
[overmind] 2026-06-04T14:01:33+00:00 sync OK current='When someone turns their mic on later, others actually hear them (B3 announce first audio)' tasks=27
[overmind] 2026-06-04T14:01:33+00:00 sync OK current='When someone turns their mic on later, others actually hear them (B3 announce first audio)' tasks=27
[overmind] 2026-06-04T14:14:11+00:00 sync OK current='Retry a stuck subscription so remote audio is never permanently lost (B5)' tasks=27
B08 dispatched_at: 2026-06-04T14:14:35Z estimate_min: 25 bucket: MEDIUM — Retry a stuck subscription so remote audio is never lost (B5)
[overmind] 2026-06-04T14:14:39+00:00 sync OK current='Retry a stuck subscription so remote audio is never permanently lost (B5)' tasks=27
[overmind] 2026-06-04T14:14:39+00:00 sync OK current='Retry a stuck subscription so remote audio is never permanently lost (B5)' tasks=27
[overmind] 2026-06-04T14:14:40+00:00 sync OK current='Retry a stuck subscription so remote audio is never permanently lost (B5)' tasks=27
[overmind] 2026-06-04T14:14:59+00:00 sync OK current='Retry a stuck subscription so remote audio is never permanently lost (B5)' tasks=27
[overmind] 2026-06-04T14:15:19+00:00 sync OK current='Retry a stuck subscription so remote audio is never permanently lost (B5)' tasks=27
[overmind] 2026-06-04T14:15:19+00:00 sync OK current='Retry a stuck subscription so remote audio is never permanently lost (B5)' tasks=27
[overmind] 2026-06-04T14:19:29+00:00 sync OK current='If publishing fails on join, retry instead of leaving them silent (PUB1)' tasks=27
B09 dispatched_at: 2026-06-04T14:19:57Z estimate_min: 25 bucket: MEDIUM — If publishing fails on join, retry instead of leaving you silent (PUB1)
[overmind] 2026-06-04T14:20:00+00:00 sync OK current='If publishing fails on join, retry instead of leaving them silent (PUB1)' tasks=27
[overmind] 2026-06-04T14:20:00+00:00 sync OK current='If publishing fails on join, retry instead of leaving them silent (PUB1)' tasks=27
[overmind] 2026-06-04T14:20:01+00:00 sync OK current='If publishing fails on join, retry instead of leaving them silent (PUB1)' tasks=27
[overmind] 2026-06-04T14:20:21+00:00 sync OK current='If publishing fails on join, retry instead of leaving them silent (PUB1)' tasks=27
[overmind] 2026-06-04T14:20:41+00:00 sync OK current='If publishing fails on join, retry instead of leaving them silent (PUB1)' tasks=27
[overmind] 2026-06-04T14:21:01+00:00 sync OK current='If publishing fails on join, retry instead of leaving them silent (PUB1)' tasks=27
[overmind] 2026-06-04T14:21:01+00:00 sync OK current='If publishing fails on join, retry instead of leaving them silent (PUB1)' tasks=27
[overmind] 2026-06-04T14:26:44+00:00 sync OK current='When the host ends the call, fully release everyone's camera/mic (LEAK1/N1)' tasks=27
B10 dispatched_at: 2026-06-04T14:26:47Z estimate_min: 20 bucket: SHORT — When host ends the call, fully release everyone camera/mic (LEAK1)
[overmind] 2026-06-04T14:26:50+00:00 sync OK current='When the host ends the call, fully release everyone's camera/mic (LEAK1/N1)' tasks=27
[overmind] 2026-06-04T14:26:50+00:00 sync OK current='When the host ends the call, fully release everyone's camera/mic (LEAK1/N1)' tasks=27
[overmind] 2026-06-04T14:26:51+00:00 sync OK current='When the host ends the call, fully release everyone's camera/mic (LEAK1/N1)' tasks=27
[overmind] 2026-06-04T14:27:11+00:00 sync OK current='When the host ends the call, fully release everyone's camera/mic (LEAK1/N1)' tasks=27
[overmind] 2026-06-04T14:27:31+00:00 sync OK current='When the host ends the call, fully release everyone's camera/mic (LEAK1/N1)' tasks=27
[overmind] 2026-06-04T14:27:51+00:00 sync OK current='When the host ends the call, fully release everyone's camera/mic (LEAK1/N1)' tasks=27
[overmind] 2026-06-04T14:27:51+00:00 sync OK current='When the host ends the call, fully release everyone's camera/mic (LEAK1/N1)' tasks=27
[overmind] 2026-06-04T14:29:42+00:00 sync OK current='Recover audio automatically after a network change/drop (B2 ICE recovery + C2)' tasks=27
B11 dispatched_at: 2026-06-04T14:30:08Z estimate_min: 40 bucket: MEDIUM — Recover audio automatically after a network change/drop (B2/C2)
[overmind] 2026-06-04T14:30:11+00:00 sync OK current='Recover audio automatically after a network change/drop (B2 ICE recovery + C2)' tasks=27
[overmind] 2026-06-04T14:30:12+00:00 sync OK current='Recover audio automatically after a network change/drop (B2 ICE recovery + C2)' tasks=27
[overmind] 2026-06-04T14:30:13+00:00 sync OK current='Recover audio automatically after a network change/drop (B2 ICE recovery + C2)' tasks=27
[overmind] 2026-06-04T14:30:32+00:00 sync OK current='Recover audio automatically after a network change/drop (B2 ICE recovery + C2)' tasks=27
[overmind] 2026-06-04T14:30:52+00:00 sync OK current='Recover audio automatically after a network change/drop (B2 ICE recovery + C2)' tasks=27
[overmind] 2026-06-04T14:31:12+00:00 sync OK current='Recover audio automatically after a network change/drop (B2 ICE recovery + C2)' tasks=27
[overmind] 2026-06-04T14:31:12+00:00 sync OK current='Recover audio automatically after a network change/drop (B2 ICE recovery + C2)' tasks=27
[overmind] 2026-06-04T14:41:34+00:00 sync OK current='Survive backgrounding the app on a phone without breaking the call (C1/N3)' tasks=27
B12 dispatched_at: 2026-06-04T14:41:59Z estimate_min: 30 bucket: MEDIUM — Survive backgrounding the app on a phone without breaking the call (C1/N3)
[overmind] 2026-06-04T14:42:02+00:00 sync OK current='Survive backgrounding the app on a phone without breaking the call (C1/N3)' tasks=27
[overmind] 2026-06-04T14:42:03+00:00 sync OK current='Survive backgrounding the app on a phone without breaking the call (C1/N3)' tasks=27
[overmind] 2026-06-04T14:42:03+00:00 sync OK current='Survive backgrounding the app on a phone without breaking the call (C1/N3)' tasks=27
[overmind] 2026-06-04T14:42:23+00:00 sync OK current='Survive backgrounding the app on a phone without breaking the call (C1/N3)' tasks=27
[overmind] 2026-06-04T14:42:23+00:00 sync OK current='Survive backgrounding the app on a phone without breaking the call (C1/N3)' tasks=27
[overmind] 2026-06-04T14:47:20+00:00 sync OK current='Never let a bad speaker choice kill playback (C3/ERR1/C4)' tasks=27
B13 dispatched_at: 2026-06-04T14:47:43Z estimate_min: 25 bucket: MEDIUM — Never let a bad speaker choice kill playback (C3/ERR1/C4)
[overmind] 2026-06-04T14:47:47+00:00 sync OK current='Never let a bad speaker choice kill playback (C3/ERR1/C4)' tasks=27
[overmind] 2026-06-04T14:47:47+00:00 sync OK current='Never let a bad speaker choice kill playback (C3/ERR1/C4)' tasks=27
[overmind] 2026-06-04T14:47:48+00:00 sync OK current='Never let a bad speaker choice kill playback (C3/ERR1/C4)' tasks=27
[overmind] 2026-06-04T14:48:07+00:00 sync OK current='Never let a bad speaker choice kill playback (C3/ERR1/C4)' tasks=27
[overmind] 2026-06-04T14:48:27+00:00 sync OK current='Never let a bad speaker choice kill playback (C3/ERR1/C4)' tasks=27
[overmind] 2026-06-04T14:48:28+00:00 sync OK current='Never let a bad speaker choice kill playback (C3/ERR1/C4)' tasks=27
[overmind] 2026-06-04T14:53:35+00:00 sync OK current='Make mic-recovery + errors robust and honest (ERR3/ERR4/ERR5)' tasks=27
B14 dispatched_at: 2026-06-04T14:54:08Z estimate_min: 25 bucket: MEDIUM — Honest mic-recovery messages (re-grant vs close-app vs connect-mic)
[overmind] 2026-06-04T14:54:11+00:00 sync OK current='Make mic-recovery + errors robust and honest (ERR3/ERR4/ERR5)' tasks=27
[overmind] 2026-06-04T14:54:11+00:00 sync OK current='Make mic-recovery + errors robust and honest (ERR3/ERR4/ERR5)' tasks=27
[overmind] 2026-06-04T14:54:12+00:00 sync OK current='Make mic-recovery + errors robust and honest (ERR3/ERR4/ERR5)' tasks=27
[overmind] 2026-06-04T14:54:32+00:00 sync OK current='Make mic-recovery + errors robust and honest (ERR3/ERR4/ERR5)' tasks=27
[overmind] 2026-06-04T14:54:52+00:00 sync OK current='Make mic-recovery + errors robust and honest (ERR3/ERR4/ERR5)' tasks=27
[overmind] 2026-06-04T14:55:12+00:00 sync OK current='Make mic-recovery + errors robust and honest (ERR3/ERR4/ERR5)' tasks=27
[overmind] 2026-06-04T14:55:12+00:00 sync OK current='Make mic-recovery + errors robust and honest (ERR3/ERR4/ERR5)' tasks=27
[overmind] 2026-06-04T15:00:47+00:00 sync OK current='Don't block legitimate users from joining (BK1 admit-stall, BK2)' tasks=27
B15 dispatched_at: 2026-06-04T15:01:13Z estimate_min: 35 bucket: MEDIUM — Don't block legit users from joining; revoke removed-peer rejoin (BK1/BK2)
[overmind] 2026-06-04T15:01:16+00:00 sync OK current='Don't block legitimate users from joining (BK1 admit-stall, BK2)' tasks=27
[overmind] 2026-06-04T15:01:17+00:00 sync OK current='Don't block legitimate users from joining (BK1 admit-stall, BK2)' tasks=27
[overmind] 2026-06-04T15:01:17+00:00 sync OK current='Don't block legitimate users from joining (BK1 admit-stall, BK2)' tasks=27
[overmind] 2026-06-04T15:01:37+00:00 sync OK current='Don't block legitimate users from joining (BK1 admit-stall, BK2)' tasks=27
[overmind] 2026-06-04T15:01:57+00:00 sync OK current='Don't block legitimate users from joining (BK1 admit-stall, BK2)' tasks=27
[overmind] 2026-06-04T15:02:17+00:00 sync OK current='Don't block legitimate users from joining (BK1 admit-stall, BK2)' tasks=27
[overmind] 2026-06-04T15:02:17+00:00 sync OK current='Don't block legitimate users from joining (BK1 admit-stall, BK2)' tasks=27
[overmind] 2026-06-04T15:13:41+00:00 sync OK current='Work on restrictive/corporate networks (B1/N2/B7 relay robustness)' tasks=27

## B15 — DONE (commit b38d2b3) @ 2026-06-04
BK1/BK2 backend admit. Codex implemented (vitest 22 pass, build green). Independent 2nd validator (sonnet, 3-agent): SOLID — owner-grace blocks premature election, owner-expiry triggers election, original owner-left-without-ending bug fixed; revokeIdentity scoped to kick/leave only (graceful drop preserves identity → genuine reconnect auto-admits). One non-blocking behavior improvement (first-open-room host check tighter). Committed + master fast-forwarded. validation/B15/independent-validation.md.

## B16 — DISPATCHED @ 2026-06-04 (relay/ICE robustness: B1/N2/B7/B6)
Codex /clear'd (context hygiene), brief = prompts/batch-16.md. Codex Working → awaiting STATUS: PROPOSED. estimate_min=~25. B1 ice-config retry+fail-loud, N2 doPublish shared relay-capable iceServers, B7 diagnostics force-relay, B6 backend env-spelling+health. Validation: solo careful (N2 touches doPublish iceServers source only, NOT the transport state machine) — escalate to 3-agent if diff reaches connection-critical logic.

## B16 — APPROVED-PLAN (amended) @ 2026-06-04, codex implementing
PROPOSED was solid (pure decideIceConfigOutcome + iceServersFromConfigPayload mapper, maxAttempts=3 backoff 250/750ms 5s timeout, N2 doPublish reuses shared relay-capable iceServers, B7 diagnostics-only force-relay + record policy/candidate-pair, B6 backend dual-spelling + TURN-in-health). AMENDMENT: fail-loud = warn + [Retry] + [Join anyway] (STUN fallback), NOT hard-block — hard-block would regress open-network users during a transient ice-config outage (decision mirrored to JROM/decisions/2026-06-04-b16-relay-fail-loud-with-join-anyway.md). Codex Working. Validation plan: solo careful (touches doPublish iceServers SOURCE only, not B11 state machine); escalate to 3-agent only if diff reaches connection-critical recovery logic.

## B16 — DONE (commit 4085b43) @ 2026-06-04
Relay/ICE robustness B1/N2/B7/B6. projcore independent validation: SOLID (verifier≠fixer). N2 doPublish reuses shared resolved relay-capable iceServers (turns:443?transport=tcp), hardcoded STUN removed; B1 retry(3,250/750ms,5s)+relayUnavailable signal+STUN fallback; amendment honored = warn+Retry+Join-anyway buttons (not hard-block); B7 diagnostics force-relay + policy/candidate-pair, normal calls 'all'; B6 backend dual env-spelling + /ice-config/health. Proof: ice-config.spec(tsx) green, ng build green, backend ice-config 14/14. No B11/B15 state-machine regression (signaling-reconnect 12/12 isolation). validation/B16/independent-validation.md.
INTEGRITY: investigated codex's "unrelated backend test drift" — CONFIRMED pre-existing (worse at pre-B15 commit; rooms/sessions/waiting-room untouched by B15/B16; rooms S2.1 = stale slug-format expectation). Logged as TESTH1 for LEAN1/RETEST1 (green-baseline hygiene). NOT goal-blocking.

## B17 — DISPATCHING @ 2026-06-04 (resource leaks LEAK2-5)
3-agent batch (leak-class per topology). Brief = prompts/batch-17.md.
[overmind] 2026-06-04T15:50:42+00:00 sync FAIL (best-effort, continuing): ignaling-waiting-room ws-timeout flake) so the suite is a green baseline — a red baseline hides real regressions. Pre-existing (worse at pre-B15), NOT goal-blocking. Do in/with LEAN1+RETEST1."}]}422
[overmind] 2026-06-04T15:50:53+00:00 sync FAIL (best-effort, continuing): rs or fewer","value":"Refresh pre-existing red backend tests (rooms slug drift, sessions-ttl, waiting-room ws-flake) to a green baseline (pre-existing, not goal-blocking; do with LEAN1/RETEST1)"}]}422
[overmind] 2026-06-04T15:51:03+00:00 sync FAIL (best-effort, continuing): ers or fewer","value":"Work on restrictive/corporate networks (B1/N2/B7/B6 relay robustness) — commit 4085b43, projcore SOLID, ice-config 14/14 + build green, warn+Retry+Join-anyway amendment"}]}422
[overmind] 2026-06-04T15:51:18+00:00 sync OK current='Stop resource leaks across long/repeated calls (LEAK2/3/4/5)' tasks=28

## B17 — APPROVED-PLAN @ 2026-06-04, codex implementing
4 leak fixes approved as proposed: LEAK2 recorder addStream dedupe (disconnect prior source per clientId), LEAK3 active-speaker one-analyser-per-peer (detection semantics unchanged), LEAK4 tracked subscribeBackoffTimers cleared in same teardown as subscribeStuckTimers (no planSubscribeRetry/B11 touch), LEAK5 prune/drop-on-ended for debug registry (NOT WeakRef — deterministic proof). 3-agent: codex does NOT commit; projcore validates + independent 2nd validator (sonnet) before commit. estimate ~20min.

## B17 — DONE (commit 243cd6f) @ 2026-06-04
4 leak fixes. 3-agent: projcore validation SOLID + independent 2nd validator (sonnet) SOLID. LEAK2 recorder addStream dedupe, LEAK3 active-speaker one-analyser-per-peer (detection untouched), LEAK4 tracked subscribeBackoffTimers cleared in all 3 teardowns (planSubscribeRetry/B11 untouched), LEAK5 deterministic prune/drop-on-ended/cap-64 (no WeakRef). 7 tsx specs + ng build green. master fast-forwarded. validation/B17/independent-validation.md.

## B18 — DISPATCHING @ 2026-06-04 (recording REC1/2/3, 3-agent)
[overmind] 2026-06-04T16:24:05+00:00 sync OK current='Fix recording: no silent mobile recordings or lost reconnect audio (REC1/2/3)' tasks=28

## B18 — APPROVED-PLAN @ 2026-06-04, codex implementing
3 recording fixes approved: REC1 start()→async + await ctx.resume() when suspended BEFORE MediaRecorder + toggleRecording awaits (announce after mixer running; +defensive try/catch so resume reject still starts recorder); REC2 recordedClientIds() getter + eviction compares recorder-state vs live-peers (snapshot the key array) replacing the dead peers-vs-peers loop; REC3 peer-resumed calls notifyParticipantLeft(oldClientId) before removePeer/join. 3-agent: codex no commit; projcore validates + independent 2nd validator (sonnet) before commit. ~18min.

## B18 — DONE (commit 7d84b1c) @ 2026-06-04
Recording REC1/2/3. 3-agent: projcore + 2nd validator (sonnet) both SOLID. REC1 async start+resume-when-suspended (only caller awaits), REC2 recordedClientIds eviction-vs-live-peers ('local' protected) replacing dead loop, REC3 peer-resumed notifyParticipantLeft(old)+join(new) no double-notify. Extracted room-recording.ts helper. 3 specs + ng build green. master fast-forwarded.

## B19 — DISPATCHING @ 2026-06-04 (multi-party SFU-S1/2/3/4, RISKIEST 3-agent batch)
[overmind] 2026-06-04T16:57:09+00:00 sync OK current='Make multi-party (3-5) track subscription correct + safe (SFU-S1/2/3/4)' tasks=28
B19 dispatched (SFU-S1 transactional doSubscribeTracks + S2 cfSessionId eviction + S3 reconcile guard/TS2 + S4 screen rollback). Effort HIGH. Codex Working → awaiting PROPOSED. Riskiest batch; must not regress B06/B08/B11.

## B19 — APPROVED-PLAN @ 2026-06-04, codex implementing (HIGH, riskiest)
SFU-S1 transactional doSubscribeTracks (snapshot prior subscribedTracks + touched midToEntry values; early-populate+ontrack-flush preserved; on createAnswer/SLD/renegotiate failure roll back touched mids + restore snapshots + rollbackPendingLocalOffer + rethrow for clean B08 retry; same shape no-reneg path). SFU-S2 reuse clearPublisherSubscriptionStateForRetry on new cfSessionId same clientId. SFU-S3 reconcile: unique-trackName + known-kind + per-kind count parity + positional-within-kind; residual same-kind-same-publisher limitation documented; TS2 spec already 5-arg (verify/extend). SFU-S4 doPublishScreen rollback (offer + replaceTrack(null)/stop + clear screenSender). Scope bounds: do NOT unwind flushed-ontrack effects (dead tracks handled by watchdog/tiles); no B08-decision/B11-state-machine rewrite. 3-agent: codex no commit; projcore + independent 2nd validator before commit.

## B19 — DONE (commit 8b4ae24) @ 2026-06-04 (riskiest batch)
SFU multi-party S1/2/3/4. 3-agent: projcore + 2nd validator (sonnet, maximally skeptical) both SOLID. S1 transactional doSubscribeTracks (exact prior-state rollback, early-populate preserved, clean B08 retry), S2 clearPublisherSubscriptionStateForRetry on new cfSessionId (presence+roster), S3 reconcile per-kind grouping + bidirectional count-parity (cross-kind swaps impossible) + documented residual, S4 screen rollback. B06/B08/B11 untouched. Specs + ng build green. master fast-forwarded. Ant-note for LEAN1: tighten S1 rollback `hadEntry && entry`→`hadEntry`.

## B20 — DISPATCHING @ 2026-06-04 (UX polish to Zoom/Meet feel)
[overmind] 2026-06-04T17:36:45+00:00 sync OK current='Polish the join/in-call UX to Zoom/Meet feel (UX1/UX2/D1/CMP1/R9-S1-2 + UX polish)' tasks=28
B20 dispatched (UX1 guest back-link, UX2 chat Shift+Enter, D1 joinRoute-guest password prompt, CMP1 camera+speaker [selected]). R9-S1/S2 confirmed already-done by B14, excluded. Codex Working → awaiting PROPOSED. Not 3-agent (UI/join-flow) but D1+UX2 have logic — validate carefully.
B20 APPROVED-PLAN @ 2026-06-04 — UX1 conditional links, UX2 shouldSubmitChat (IME-safe via isComposing), D1 bootstrap-captured passwordRequired/isOwner own signals + continueAsGuest prompt, CMP1 camera+speaker per-option [selected] + speaker System-default [selected]. Codex implementing. projcore commits.

## B20 — DONE (commit 67438cf) @ 2026-06-04
UX1/UX2/D1/CMP1. projcore solo SOLID. R9-S1/2 confirmed already-done by B14 (excluded). Extracted room-decisions.ts (shouldSubmitChat IME-safe + shouldPromptGuestPassword). room-decisions.spec + ng build green. master fast-forwarded.

## B21 — RE-VERIFYING SCOPE @ 2026-06-04 (final build batch — tiny sweep)
Checking each of TINY2-7/ERR6-9/A8/A9/A12 is still open in current code before briefing (drop already-fixed).
[overmind] 2026-06-04T18:02:24+00:00 sync OK current='Sweep the small/cosmetic bugs (TINY2-7, ERR6-9, A8/A9/A12, selector states, REC4-10)' tasks=28

## B21 tiny-sweep AUDIT (sonnet, read-only) @ 2026-06-04 — 14 OPEN, 6 FIXED
OPEN: A8(room.page:949-950 persist-before-success), A9(room.page:2276 pin not cleared), A12(room.page:1040/media.service:326 toggleMic exact no ladder), ERR6(room.page:3229 self-test not re-armed on gesture), ERR7(room.page:3337 payload lacks platform/UA/selectedDeviceId/gUMerror), ERR9(remote-audio:421 applySinkId race), TINY2(room.page:3172 captureTrackLive stale-read), TINY3(media.service:170 micOn no readyState guard), TINY4(room.page:2763 onended re-assign leak), TINY6(room.page:2778 no track.enabled guard), REC4(room.page:1274 stop() no timeout), REC5(recorder:195 discard double-stop race), REC6(recorder:231 zero-audio no warn), REC8(recorder:117/163/179 MIME Content-Type wrong).
FIXED (drop): ERR8(setCameraTrackEnabled guarded), TINY5(removeSource guard), TINY7(subscribeIfNeeded sync delete), REC7(syncRecorderPeerStreams re-eval), REC9(speaker-frame isRecording guard), REC10(transcripts pollTimer typed).
SPLIT: B21a(A8/A9/A12/TINY3 acq), B21b(TINY2/4/6/ERR9 race-handler), B21c(REC4/5/6/8 recorder, 3-agent), B21d(ERR6/ERR7 diagnostics).

## B21a — DONE (commit 066c220) @ 2026-06-04
A8/A9/A12/TINY3. projcore solo SOLID. storedDeviceAfterSelectionAttempt (persist-after-success+rollback), shouldClearVideoPinAfterRefresh, shouldAcquireMicTrackForToggle (ladder route), micOnFromTrack (live guard). 7 specs + ng build green.

## B21b — DISPATCHING @ 2026-06-04 (race/handler hardening TINY2/4/6/ERR9)
[overmind] 2026-06-04T18:33:52+00:00 sync OK current='Race/handler hardening — watchdog re-read, listener add/remove, enabled guard, sink serialize (TINY2/4/6/ERR9)' tasks=32

## B21b — DONE (commit a70ec19) @ 2026-06-04
TINY2/4/6/ERR9. projcore solo SOLID. TINY2 watchdog re-read after await, TINY4 stored-ref detach/attach, TINY6 decideLocalTrackFailureRecovery enabled-guard, ERR9 LatestSinkIdApplier coalescer (B13 fallback wrapped). specs + ng build green.

## B21c — DISPATCHING @ 2026-06-04 (recorder tail REC4/5/6/8, 3-agent)
[overmind] 2026-06-04T18:57:56+00:00 sync OK current='Recorder tail — stop() timeout, discard double-stop, zero-audio warn, MIME/Content-Type (REC4/5/6/8, 3-agent)' tasks=32
B21c APPROVED-PLAN @ 2026-06-04 — REC4 withTimeout on toggle stop+upload (graceful UI finalize), REC5 per-session finalize-once guard (reset in start) + discard no double-stop + late-onstop harmless, REC6 zero-audio warn, REC8 resolveRecordingMime (actual mime → type/extension/X-Ext/Content-Type, covers webm/ogg/mp4). 3-agent: codex no commit; projcore + 2nd validator. Codex implementing.

## B21c — DONE (commit c417f1f) @ 2026-06-04
Recorder tail REC4/5/6/8. 3-agent: projcore + 2nd validator (sonnet) both SOLID. REC4 withTimeout+finalize, REC5 finalize-once guard (4 interleavings traced exactly-once), REC6 zero-audio warn, REC8 resolveRecordingMime actual-mime. specs + ng build green.

## B21d — DISPATCHING @ 2026-06-04 (diagnostics ERR6/ERR7, last build sub-batch)
[overmind] 2026-06-04T19:26:49+00:00 sync OK current='Diagnostics — lobby self-test re-arm on gesture + diagnostics payload fields (ERR6/ERR7)' tasks=32

## B21d — DONE (commit fa89e1e) @ 2026-06-04. ALL 21 BUILD BATCHES COMPLETE.
B21 parent marked DONE (B21a-d all committed; 14 tiny fixes, 6 already-fixed). Every one of the 63 findings is fixed-and-validated or confirmed-already-closed.

## CLOSEOUT begins — LEAN1 dispatched @ 2026-06-04 (3-agent, behavior-preserving)
Scope (decision logged JROM/decisions/2026-06-04-lean1-conservative-scope.md): TS1 10 prod timer-type errors + 13 spec type-drift → tsc --noEmit ZERO; dead code; TESTH1 refresh red backend tests (rooms slug/sessions-ttl/waiting-room — expectations only, not src) to green; modular extraction PROPOSE-ONLY gated by risk (NO room.page.ts wholesale rewrite — logic already extracted into 11 modules). Full suite green BEFORE/AFTER to prove zero behavior change. After LEAN1: RETEST1 → POSTFIX1 (3x fan-out) → HANDBACK1.
[overmind] 2026-06-04T19:48:39+00:00 sync OK current='Lean+modular media refactor + TS1/TS2/TS3 + dead code + TESTH1 green baseline (3-agent)' tasks=32
LEAN1 APPROVED-PLAN @ 2026-06-04 — TS1 timer fields→number|null (window.* consistently), 4 spec-double type fixes (assertions unchanged), dead DatePipe import removed (clears NG8113), TESTH1 backend expectation refresh (rooms slug/exists-fields/dup-suffix, sessions-ttl diagnosticsGloballyEnabled, waiting-room auto-open-on-owner restructure preserving promotion intent) — all confirmed stale-expectation-not-bug. No extraction. Full behavior-preserving baseline (tsc 0 + all tsx specs + ng build + backend touched tests green) required. 3-agent: codex no commit; projcore + 2nd validator. Codex implementing.

## LEAN1 — projcore validation (in progress) @ 2026-06-04
Scope PERFECT: only room.page.ts/transcripts.page.ts (timer types→number|null + window.*), rooms.page.ts (DatePipe import removed), 4 specs (types only), 3 backend test files (expectations). NO backend/src. tsc --noEmit = 0. room.page diff = type+window.* only (set/clear pairs preserved), zero runtime change. Backend full suite 8 reds → 2 reds (TESTH1 fixed rooms/sessions/waiting-room; signaling-reconnect was pollution-only).
REMAINING 2 backend reds (auth-login S1.1, migrate-from-json S1.7) — NOT LEAN1-caused (no backend src / neither test touched by LEAN1) = PRE-EXISTING stale expectations: both assert the old {email}-only user object but the app correctly returns {email, displayName, isAdmin}. Login WORKS (200+cookie). → TESTH2 (trivial expectation refresh) to reach fully-green before the fan-out.
Awaiting independent 2nd validator. Will commit LEAN1 when both SOLID, then TESTH2, then RETEST1.

## LEAN1 — DONE (commit 82b7857) @ 2026-06-04. TESTH1 folded in.
3-agent both SOLID, behavior-preserving (validator verified against backend source). frontend tsc 0, 25 specs, ng build, backend 164 pass/0 regressions (8 reds→2).
## TESTH2 — DISPATCHING (auth-login S1.1 + migrate-from-json S1.7 — stale {email}-only expectation; app returns {email,displayName,isAdmin}, login works)
[overmind] 2026-06-04T20:22:05+00:00 sync OK current='Refresh auth-login + migrate-from-json expectations (user object {email,displayName,isAdmin}) to green' tasks=33
[overmind] 2026-06-04T21:09:32+00:00 sync OK current='regression fan-out — R1 ZERO goal-blocking (9 reviewers+3 verifiers; C-1/C-2/T-1/T-2 all dismissed); R2/R3 pending' tasks=34
[overmind] 2026-06-04T21:19:03+00:00 sync OK current='fan-out — R1 ZERO blocking; R2 found 1 REAL blocking (S-MIDCALL mic-on-mid-call no-retry) → FIX2 → +2 rounds' tasks=35
[overmind] 2026-06-04T21:48:15+00:00 sync OK current='fan-out — R1 ZERO blocking; R2 found 1 REAL blocking (S-MIDCALL mic-on-mid-call no-retry) → FIX2 → +2 rounds' tasks=35
[overmind] 2026-06-04T21:58:29+00:00 sync OK current='R1 clean; R2→S-MIDCALL→FIX2; R3 S-MIDCALL closed BUT found double-subscribe (FIX2-widened)→FIX3→+2 rounds' tasks=36
[overmind] 2026-06-04T22:18:07+00:00 sync OK current='R1 clean; R2→S-MIDCALL→FIX2; R3 S-MIDCALL closed BUT found double-subscribe (FIX2-widened)→FIX3→+2 rounds' tasks=36
[overmind] 2026-06-04T22:29:33+00:00 sync OK current='R1 clean; R2→S-MIDCALL→FIX2; R3 S-MIDCALL closed BUT found double-subscribe (FIX2-widened)→FIX3→+2 rounds' tasks=36
[overmind] 2026-06-04T22:42:26+00:00 complete OK
[overmind] 2026-06-04T22:42:44+00:00 sync OK current='' tasks=36
[overmind] 2026-06-04T22:43:19+00:00 complete OK
[overmind] 2026-06-05T01:17:36+00:00 register OK run_dir=/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04 wf=24
[overmind] 2026-06-05T01:17:36+00:00 sync OK current='international call diagnostics — capture+surface egress IP, send-side loss, audio-liveness, RTT intl-hint (owner-only)' tasks=38
[overmind] 2026-06-05T01:36:19+00:00 sync FAIL (best-effort, continuing): ust be 120 characters or fewer","value":"international call diagnostics — capture+surface egress IP, send-side loss, audio-liveness, RTT intl-hint (owner-only) — independent validation PASS"}]}422
[overmind] 2026-06-05T01:36:40+00:00 sync OK current='' tasks=38
[overmind] 2026-06-05T01:55:34+00:00 complete OK
