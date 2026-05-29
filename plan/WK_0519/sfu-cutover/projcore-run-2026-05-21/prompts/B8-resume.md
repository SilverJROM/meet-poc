Batch B8 (resume) — Retire the mesh, SFU-only (SR-8). Post-B10 scope: mostly DEAD-CODE DELETION.

You are the IMPLEMENTER (Sonnet), supervised by Claude /projcore (lkvc-38); codex validates. Branch `feat/sfu-cutover` (HEAD 0cc1a86, SFU is already the live default). Fresh session — re-read. JROM decision: **retire the mesh; this app is SFU-only.** The mesh source is already archived externally, so delete freely.

## What's already done (do NOT redo — this de-risks B8 vs the earlier failed attempt)
B10 already: flipped `isSfuMode` to default-TRUE (SFU is the path), added `?sfu=0` to legacy specs, full suite green, deployed. So the risky "make SFU always-on + reconcile tests" part is DONE. The earlier B8 attempt crashed because it tried to do that gate-removal — that's no longer needed.

## Task (SR-8) — remove the now-dead mesh path; SFU is the ONLY path
1. **Gut `webrtc.service.ts` to just the identity ROSTER.** KEEP the roster/presence API the UI binds to (peerList/peers, setLocalPeer, addPeer [with identity dedup/no-ghost], resumePeer, updatePeer, markPeerReconnecting, removePeer, resetRemotePeers, reset). REMOVE the mesh-media: `configure`/sendSignal, `handleSignal`, mesh PeerConnection creation/fan-out, `replaceVideoTrack`/`replaceLocalSenderTrack` (mesh), `setForceRelay`, `setManualAudioOnly`, `setShareCameraPolicy`, mesh `diagnostics()`, IceConfigService injection. (Or extract the roster into a small dedicated service — your call in PROPOSED.)
2. **Delete** `webrtc-diagnostics.ts` + `webrtc-video-policy.ts` (mesh-only helpers) + their specs.
3. **room.page.ts:** remove the mesh branch + the `?sfu=0`/`isSfuMode` gate entirely (SFU-only — no fallback path). The 5 consumers (active-speaker, remote-audio, participant-sidebar, tile, room.page) read SFU state (sfuPeers/remoteStreams) unconditionally.
4. **Backend signaling:** remove the mesh peer-to-peer `signal` SDP/ICE relay (+ its test). KEEP admit/waiting-room/identity/reconnect/chat/host/media-state/SFU-presence.
5. **Obsolete e2e tests:** the legacy specs B10 pointed at `?sfu=0` now test a deleted path. For each: if it tests app-shell/admit/chat/lobby/host (still valid SFU-only), CONVERT it to the SFU default (remove `?sfu=0`); if it specifically tests mesh MEDIA behavior (mesh PCs, mesh degrade, peer-to-peer signal), DELETE it (mesh is gone). Map this in PROPOSED.
6. **KEEP/ADAPT:** admit/identity/reconnect (DR-37/38/39) + identity dedup, chat, host controls, SFU diagnostics (B9), device recovery (DR-46), iOS audio (DR-45 on SFU ontrack), the SFU op queue + DR-40 single-PC recovery. ICE = CF STUN + TURN fallback. No dead mesh imports left.

## Scope guards
- This batch deletes mesh + rewires consumers + cleans tests — that's expected. Do NOT change the SFU mechanics (publish/subscribe/reconnect/diagnostics) except removing the now-pointless isSfuMode branching (always-SFU). 
- Do not deploy (projcore gates; I'll redeploy after the gate).

## Plan handshake (FIRST — required given blast radius)
1. Read brief + `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/context-handoff.md`. MAP: what stays in the roster vs deleted from webrtc.service.ts; each of the 5 consumers post-removal; each legacy ?sfu=0 spec (convert vs delete); the signal-relay removal.
2. STATUS: PROPOSED with that map + test plan. If too big for one slice, PROPOSE A SPLIT (e.g. B8-1: room.page + consumers SFU-only + delete signal relay; B8-2: gut webrtc.service + delete helper files + test cleanup). I'll likely approve a split.
3. WAIT for APPROVED-PLAN.

## After APPROVED-PLAN
4. Implement. 5. Test: build PASS + the FULL SFU e2e suite green (sfu-* specs) + the converted legacy specs green (admit/chat/host/lobby/reconnect — prove DR-37/38/39 + chat + host work SFU-only) + no dead mesh imports (grep). Run twice if flaky. 6. Commit on feat/sfu-cutover.

## Callbacks + status
- Callback FIRST: append `[projcore callback] B8 <STATE> <note>` to `.../callbacks.md` (PROPOSED/DONE/BLOCKED) BEFORE prose.
- End every reply with `STATUS: <PROPOSED|DONE|BLOCKED> — <reason>`.
- Write `.../B8/changes.md` at DONE (list files deleted/gutted/rewired). COMMIT before STATUS: DONE.
- If keep-vs-delete is ambiguous OR you hit a wall, STATUS: BLOCKED and ask — do NOT spiral into long analysis (a prior attempt burned an hour; don't repeat it).
