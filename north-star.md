# meet-poc / VoiceLokal — Project North-Star

> The enduring constitution: vision, architecture goals, constraints, standing decisions.
> **Curated** (append AND prune — kept lean, never bloats). Effort-scoped detail lives in
> `plan/**/projcore-run-*/north-star.md`, which inherits + cites this file.
> Bootstrapped 2026-07-08 from repo archaeology + a vision interview.

---

## 1. What this is
A self-hosted, web-first **WebRTC meeting app** — "**VoiceLokal**" — live at `https://voice.silverjrom.app`
(`@voicelokalbot` on Telegram). Despite the `meet-poc` repo name and a stale README describing a
since-deleted full-mesh prototype, this is a **real, operated app used for real human calls** (notably
JROM ↔ Peer2, PH ↔ US long-haul). It is NOT a toy or a throwaway PoC.

## 2. Where it's going (vision)
- **Near-term (the whole current game): make VoiceLokal a rock-solid real-call app.** We are in
  **pre-live hardening** — real people already call on it, but it is not yet dependable enough to lean on.
  Voice/audio reliability is the dominant thread.
- **Long-horizon: voice calling built _natively_ into Lokal** (`websites/lokalcamp`, a Basecamp-style
  multi-tenant PM SaaS). meet-poc is the **proving ground** for that call stack. This is **DEFERRED and
  explicitly out of scope for now** — "we still have a lot of problems on the app." No integration work,
  no SDK-extraction, until the call stack is field-validated. (Superseded framing: an earlier "AGJAssist
  Voice SDK" extraction — the plan is now a native Lokal rebuild, not a packaged SDK.)
- **AI participant** (an assistant that joins a call to listen / transcribe / maybe speak): **future /
  exploratory.** A direction, not a current priority driver. Today's recording + transcription work
  happens to lay groundwork.

## 3. Who it's for (primary use cases)
1:1 and small-group **human calls**, including **cross-border / international** and **client-facing**
calls; **team / internal meetings** with host controls, lobby, screen share. Fidelity on small real
calls is the target — not scale.

## 4. The one bar (how we know it's good)
- **Real-call acceptance:** "fixed" means a **real human live call works** — decoded + rendered both
  directions on a real ICE connection. Synthetic / fake-media test passes are **necessary but never
  sufficient**. Red-team every audio result for real-call fidelity.
- **Exit from pre-live hardening (gated, both required):** the **voice-standardization slate is shipped +
  validated** AND the app is **proven across a run of real calls** (incl. PH↔US long-haul, client-facing)
  with no audio failures. Only then does porting into Lokal come onto the table.

## 5. Architecture (as-built, enduring)
- **Frontend:** Angular 20.3 standalone + signals + Ionic 8 (icons/providers, not page chrome),
  MediaPipe selfie-segmentation for backgrounds. Shipped as a **prebuilt static bundle**.
- **Backend:** Node/ESM + Express 4 + raw `ws` signaling, run under **`tsx watch`** (source ≈ live on
  restart). **better-sqlite3** (numbered idempotent migrations) + filesystem sidecars for media.
- **Media plane:** **Cloudflare Realtime SFU** — clients publish/subscribe to the CF edge; **media never
  transits the Node backend**. Backend only proxies SFU control (server-side `SFU_APP_ID`/`SFU_TOKEN`,
  never in the browser) and relays roster/presence over WS. SFU cap `MAX_ADMITTED = 30`.
- **Identity:** email+password (scrypt) + cookie sessions, plus Telegram passwordless (mini-app initData).
  Single seeded owner today (`silverjrom@gmail.com`); Peer2 (`peer2@example.com`) is a real user.
- **Deploy:** single self-hosted box behind a named **Cloudflare Tunnel**; PM2 runs `meet-poc-be` (4720)
  and `meet-poc-fe` (4700, serves the built `frontend/dist/` + proxies `/api|/ws|/upload`). DEV
  (`voice.silverjrom.app`) is the only live env; QA/PROD not configured.

## 6. Standing decisions (durable — violate only with JROM)
- **Full Cloudflare-SFU cutover** — mesh (cap-5) retired at the 2026-05-19 "B6 cutover"; keep
  admit/lobby/identity/reconnect/chat/host-controls/diagnostics/iOS-audio, don't reintroduce mesh logic.
- **Split deploy model bites:** the **FE is a static build — a committed FE fix is NOT live until
  `ng build`.** Has caused a real recording-loss incident. Always check `frontend/dist` mtime vs commit.
- **Cloudflare TURN is LIVE; self-hosted TURN (coturn) is deferred** by JROM. ICE minted via Cloudflare
  (`/api/ice-config`), which serves 3 STUN + **4 TURN URLs** (`turn.cloudflare.com` udp/tcp/tls:5349/
  tls:443) with credentials, since `4085b43` (2026-06-04). The FE applies them to its single
  `RTCPeerConnection` and has a `forceRelayDiagnosticRequested()` relay-only path + a TURN health check.
  *(Corrected 2026-07-09 by /north — this line previously read "STUN-only for now," which was factually
  false and had been reasoned from. The **coturn** deferral is the part that still stands. Flagged for
  JROM's review.)*
- **One bundled `RTCPeerConnection` carries BOTH directions** (`sfu-client.service.ts`, singleton
  `SfuClientService`). Consequence, load-bearing for diagnosis: if a peer can *hear* the other side, ICE/
  DTLS/SRTP to the SFU is alive — so a transport/NAT/TURN failure **cannot** explain one-way audio on that
  connection. Established 2026-07-09 (D28, codex55 refutation of /north's TURN hypothesis).
- **Recording `/upload` is gated** (owner-email 403 + open-session 409) and rejections are **silent** —
  closing the room ends the session and can lose the upload race on long calls.
- **Pre-live ⇒ deferral is OFF.** No "follow-up PR / address later / TODO-sprinkle." Deferred work needs a
  queue row that gates run completion, or it's rejected.
- **Rollback is git-history-only** — the legacy single-file PoC was deleted at cutover.
- **SFU-work role inversion:** for SFU/media work, **Claude implements / codex validates** (inverse of the
  usual split).
- **Real-call proof for audio fixes (promoted 2026-07-08):** an audio/voice fix is **not "done" until
  proven on a real cross-device human call.** Synthetic / automated / multi-machine validation is
  necessary-but-**insufficient** — a 3-machine-live gate passed GREEN on 2026-07-05 while a real client
  call failed on 2026-07-08. Sign-off requires a real call on the target device class (e.g. Android
  mobile), not just a green harness.

## 7. Non-goals (guard against scope creep)
- **Enterprise admin** — SSO, org RBAC consoles, compliance/audit certifications.
- **Large-scale / webinar** meetings (50+ participants). Small-call fidelity is the point.
- **Lokal integration _right now_** — real direction, wrong time. Explicitly parked until §4's exit bar.
- (Web-first is the current posture; **mobile Safari/Chrome _web_ is in scope** and part of acceptance.
  Native mobile apps and Zoom/Meet feature-parity are not being pursued, but were not declared hard
  non-goals — revisit if raised.)

## 8. Verification & operating standards
- **Intl-path verification:** VPN must be on the **desktop** (iOS redacts the IP); **RTT ≥150ms = true
  long-haul**; beware the **WARP trap** (foreign-looking IP at ~25ms RTT never left region).
- **Test hygiene:** validators that touch the live app must **delete rooms they create** and audit the
  SQLite after; the only persistent room is `TEST_ROOM01` (`testroom01001`) — everything else test-shaped
  is pollution.
- **Peer2's machine (`creepy-mini`), driven via the JohnnyOne relay: NEVER run destructive/delete
  commands there** (an `rm -rf` once wiped his Chrome). Non-destructive test-and-report only; treat the
  on-machine agent as a collaborator on its strongest model.
- **DEV deploy is autonomous-OK; QA needs explicit per-deploy auth** (none exists yet). Logs in
  **Asia/Manila** time (server is UTC). No secrets in chat.

## 9. Current focus (the live phase — update as it moves)
The **voice-standardization slate**, driven by real diagnosed call incidents: Opus codec/bitrate
hardening (floor / DTX / FEC), **per-voice volume balancer** (auto-level to ~85–90%), **faster
mic-silence self-heal cadence** (~5–10s vs 20s), reconnect-churn reduction, a **host "silent
participant" indicator**, and the **room-password + admission-policy** feature (auto-admit-with-password
vs always-knock, settable live in-call). R1 (bounded mic-silence self-heal) has landed on branch
`feat/voice-standardization-batch-1-mic-silence-retry`. **Open gates:** merge-to-main and a QA/PROD deploy
path.
