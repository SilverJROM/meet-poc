# North Star — meet-host-audio-recovery (2026-06-03)

**Append-only.** Triggered by JROM PH call 45197347 (2026-06-02 19:46–19:51 Manila): JROM (host) + Joanne. JROM could NOT hear Joanne; Joanne COULD hear JROM.

## Diagnosis (proven from DB, Manila time)
Bidirectional matrix for session 45197347:
- **Joanne → JROM** (JROM hearing her): bytes 152KB received, **emitted=0 throughout** (4368→151984 over 19:50:16–19:51:01, emitted never left 0) → JROM never played her audio. ✗
- **JROM → Joanne** (her hearing him): **emitted=2.36M** → she heard him fine. ✓
- Joanne's capture healthy (maxLevel 0.17, maxEnergy 1.0) — her mic works, she spoke.

**This is the prior host-playout bug RECURRING** — same signature (RTP received, jitterBufferEmittedCount=0, host-only). The B1 fix (run 2026-06-01 meet-audio-playout) was REAL and works in the common case (proven live on call 5d9ec218 same day — host emitted millions). But it left a GAP on this timing path:
- JROM joined alone at 19:46, sat alone ~4 min, Joanne joined late at 19:50.
- B1's recovery for a suspended AudioContext relied on (a) resume synchronously at the join gesture, and (b) a "tap to enable audio" banner + re-arm when a source is added. During the 4 idle minutes the context auto-suspends (Chrome suspends idle/silent contexts); when Joanne joined, recovery required JROM to NOTICE + TAP the banner within the ~50s before the call ended. He didn't → emitted stayed 0.

**Honest:** R1.1 was marked VERIFIED after 5d9ec218 (which happened to work) but that call did NOT exercise the alone-then-late-join path. Premature. This run closes the gap.

## Requirement (JROM verbatim)
> "i cant hear the user again, can you check if she can hear me? as well and please do this autonomously with codex to fix it go"
> "log to ovm and finish this ok"

## Non-negotiables
- **NS1 — Automatic recovery, no banner tap required:** the host must hear a late joiner WITHOUT having to notice/tap anything. Make AudioContext recovery automatic: resume on ANY in-call user interaction (not only a dedicated banner) AND prevent the idle auto-suspend so a host-alone-then-late-joiner call just works.
- **NS2 — Keep the banner as a fallback only** (for the genuine no-interaction-ever case), but it must not be the primary recovery.
- **NS3 — Prove the GAP path specifically:** a test that models host-alone → context suspended → late joiner's source added → (interaction or keepalive) → emitted climbs / contextState 'running'. The bug hid because validation didn't exercise alone-then-late-join. Don't repeat that.
- **NS4 — No regression:** the common-case playout (B1), volume/mute-all, the B2 limiter, mic-persistence, camera-in-call must all still work.
- **NS5 — Surgical:** remote-audio.service.ts (context keepalive + resume-on-interaction + source-add resume) + room.page.ts (global interaction listener wiring). Do NOT touch SFU subscribe/transport, capture, diagnostics schema, layout.

## Execution
Autonomous via CODEX (TUI, JROM directive). Logged to OVM. Verifier ≠ fixer. Branch off master @ HEAD.

## WEB RESEARCH (2026-06-03, per JROM "take inputs from the web")
Two well-documented Chrome root causes for "remote audio received but silent":
1. **Chromium #121673** — a remote WebRTC track fed to Web Audio via `createMediaStreamSource` produces NO sound UNLESS the same MediaStream is ALSO attached to a muted, playing HTMLAudioElement ("kickstart"). Canonical workaround (Babylon.js forum, still required 2025):
   `const a=new Audio(); a.srcObject=stream; a.muted=true; a.play();` alongside the createMediaStreamSource graph.
   **OUR BUG:** when mixer enabled, tile <audio> srcObject=null (tile.component.ts:58) → NO kickstart element exists → mixer can be silent. This is the fundamental miss in the prior fix.
   (Some also connect the source directly to destination as a second guard.)
2. **Suspended AudioContext** (autoplay policy) — resume via user interaction; can auto-suspend when idle.
Sources: w3c/webrtc-pc#2564, Babylon.js forum 7047, chromium 121673 / issues.chromium.org 41012832, webrtc/samples#1028.

## JROM ARCHITECTURE DIRECTIVE (2026-06-03) — self-healing voice monitor
> "why cant there be a check if something is wrong and dynamically adjust, the primary one is the voice, all parties should have atleast a monitor if the voice is being played on each device and if its not then something is wrong and needs to restart or adjust something"

NS6 — **Per-party voice-playout watchdog (PRIMARY durable fix).** On EVERY device (host + guests), continuously monitor whether each remote participant's voice is actually being PLAYED (jitterBufferEmittedCount climbing while bytesReceived climbs). When it detects RECEIVING-BUT-SILENT (bytes climbing, emitted flat over N samples), auto-run a recovery ladder WITHOUT user action: (1) resume AudioContext, (2) ensure kickstart muted <audio> attached+playing for that stream, (3) re-play mixer output, (4) rebuild the mixer source for that peer. Escalate steps until emitted resumes climbing; log each remediation. This watches the OUTCOME so it heals the known causes AND future unknown ones.

## Batches
- B1: known root-cause fixes — kickstart muted <audio> per remote source (#121673) + AudioContext resume-on-interaction + keepalive. (Immediate fix.)
- B2: self-healing voice-playout watchdog on all devices (NS6) — the durable safety net.
