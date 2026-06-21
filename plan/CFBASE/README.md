# CFBASE — Cloudflare-first redesign of meet-poc

> **Status:** design spec to circle back to. NOT in progress. Written 2026-06-21 with the
> full benefit of hindsight from building + fixing the current app (reconnect bug, ghost
> participants, international PH↔US calls, per-user recording, transcription decoupling).
>
> **One-line:** rebuild the *signaling + storage + transcription* layers as Cloudflare-native
> (Pages + Durable Objects + D1 + R2 + Queues + Workers AI), keep the media path exactly as it
> is today (Cloudflare Calls SFU + TURN), and carry over the existing measurement test harness.

---

## 0. Why this doc exists

The current app **works** — it does international PH↔US calls, multi-party audio/video,
screenshare, per-user recording and named transcription, all proven by measurement. It runs as
a stateful Node app behind a Cloudflare Tunnel. This doc is the plan for *if/when* we move to a
fully Cloudflare-native architecture, written now while the hard-won knowledge is fresh.

The single most important framing: **media quality is NOT a function of where the backend
runs.** Live audio/video flows peer → nearest Cloudflare edge → SFU → peer. It never transits
our backend. So every hosting decision below is about signaling, storage, and transcription —
the int'l call path is identical in all of them because it is already Cloudflare's network.

---

## 1. What we learned from the current app → design principles

Each principle below is a direct response to a real bug we fixed.

| What bit us | Root cause | Principle for the rebuild |
|---|---|---|
| Remote audio went **silent after a reconnect** | Subscribe was an async Angular *effect* that didn't deterministically re-fire on republish; a stale in-flight subscribe could bind a dead track | **Deterministic, idempotent reconcile.** SFU subscription = a pure `reconcile(roster)` function invoked on every presence event. No implicit reactivity in the media-critical path. |
| **Ghost participants** held recorders + SFU subs + phantom tiles for the full 2-min grace → OOM | Disconnect did not clean per-peer resources; `reconnecting` peers were treated as active | **Explicit peer lifecycle state machine with invariants.** A `reconnecting` peer holds *no* recorder and *no* subscription — enforced by construction, not by remembering to clean up. |
| Reconnect-grace timers were fragile (lost on crash; many concurrent `setTimeout`s) | In-RAM timers in a long-lived Node process | **Durable, alarm-driven timers.** Grace expiry is a persisted schedule + a single DO alarm. Survives restarts. |
| Whisper **ran on the signaling box during a live call** (per-upload trigger) | Transcription coupled to recording upload | **Transcription is post-call, decoupled, and offloadable.** Never in the call path. (Already fixed in the current app; native here via Queue→Worker.) |
| International calls had silent failures (WARP traps, RTT≥150ms long-haul) | TURN relay-path selection + client network | **Keep CF Calls/TURN; instrument the relay path.** Carry over `/app/diagnostics`. Edge-local signaling *reduces* setup latency but does not change media. |
| Every agent **overclaimed** "it works" | No independent measurement | **Measurement harness is a first-class deliverable.** getStats bytesDelta + WebAudio energy + per-track attribution + remote-machine relay. Build it alongside, not after. |

---

## 2. Target architecture

```
                         ┌──────────────────────────────────────────────┐
   Browser (Angular) ──► │  CF Pages (static SPA)                        │
        │                └──────────────────────────────────────────────┘
        │ WSS /ws/:room          ┌───────────────────────────────────────┐
        ├───────────────────────►│  Worker (Hono router)                 │
        │ REST /api/*            │   • auth/sessions (cookie → KV/D1)     │
        │                        │   • room CRUD, ICE/SFU cred minting    │
        │                        └───────────────┬───────────────────────┘
        │                                        │ idFromName(roomId)
        │                        ┌───────────────▼───────────────────────┐
        │                        │  Durable Object: RoomDO (1 per room)  │
        │                        │   • WS hibernation (all peers)        │
        │                        │   • peer lifecycle state machine      │
        │                        │   • admit/knock, presence, reconnect  │
        │                        │   • DO storage (tickets, admitted)    │
        │                        │   • DO alarm (grace expiry schedule)  │
        │                        └───────────────┬───────────────────────┘
        │                                        │ fetch()
        │                        ┌───────────────▼───────────────────────┐
        │                        │  Cloudflare Calls SFU + TURN          │  ◄── MEDIA (unchanged)
        ▼  (media: peer ↔ edge ↔ SFU ↔ peer, never through our backend)  │      int'l PH↔US lives here
                                 └───────────────────────────────────────┘

   Recording upload ──► R2 (per-person .webm, downloadable)
                         └─► CF Queue ─► Transcription Worker ─► (Workers AI Whisper | external STT) ─► transcript in R2/D1
   App data ──► D1 (users, rooms, sessions, settings, recording index)
```

### Component map (what replaces what)

| Concern | Current app | CFBASE target | Notes |
|---|---|---|---|
| Frontend | Angular `dist` via `serve.js` | **CF Pages** (static) | Near-zero change. Lowest-risk first step. |
| HTTP routing | Express | **Hono** on a Worker | Mechanical port; same routes. |
| Signaling + room state | `ws` + in-RAM `Map`s + `setTimeout` | **Durable Objects** (1 per room) | The core rewrite. §3. |
| DB | `better-sqlite3` (local file) | **D1** | SQL is close; native bindings differ. §4. |
| Recordings | local `.webm` on disk | **R2** | Per-person object per speaker. §5. |
| Transcription | on-box faster-whisper (post-call) | **Queue → Worker → Workers AI / external STT** | Disabled by default here. §6. |
| Media (SFU/TURN) | Cloudflare Calls + TURN | **unchanged** | The reason int'l works. §7. |
| Auth/session | cookie → SQLite | cookie → **KV or D1** | 30-day TTL, HttpOnly, Secure. |

---

## 3. Signaling on Durable Objects (the core rewrite)

This is the meaty part and the area to design carefully with Peer2. The current logic is
already a battle-tested spec — we are porting a known-correct state machine to a different
runtime primitive, not redesigning behavior.

### 3.1 One DO per room
- Address: `env.ROOM.idFromName(roomId)` → a single-threaded, addressable, stateful object.
- All WebSocket connections for a room live inside that room's DO (use **WS Hibernation API**:
  `state.acceptWebSocket(ws)`, `webSocketMessage`, `webSocketClose`, `webSocketError`).
- Single-threaded serialized access **eliminates the race classes** that caused the reconnect
  subscribe bug.

### 3.2 Peer lifecycle as an explicit state machine
States: `joining → pending(knock) → admitted → live → reconnecting → {resumed→live | expired | kicked}`

Invariants enforced on every transition (this is what kills the ghost bug by construction):
- A peer in `reconnecting` holds **no** SFU subscription and **no** recorder. Entering
  `reconnecting` tears both down immediately.
- A peer in `expired`/`kicked` has its reconnect ticket **deleted** and identity **revoked**
  (rejoin must re-knock for host admit). Owner cannot be kicked.
- `live` peers are the only ones in the presence roster broadcast to others.

### 3.3 Reconnect grace via DO alarms (not setTimeout)
- On disconnect: write `reconnecting[peerId] = { expiresAt, ticket }` to **DO storage**, set the
  DO alarm to the *earliest* `expiresAt` across all reconnecting peers.
- `alarm()` handler: expire all peers whose `expiresAt <= now`, broadcast `peer-left`, reschedule
  the alarm to the next earliest. (One alarm, many logical timers — persisted, survives eviction.)
- Resume within grace: `peer-resumed {oldId, newId}` — atomic swap, ticket consumed, no duplicate.

### 3.4 Subscription reconcile (frontend, carried over)
Keep the fix we already shipped as the *design*: `reconcile(roster)` ensures the set of SFU
subscriptions exactly matches the live publishers. Called on every presence event. Idempotent.
A stale cfSession guard aborts a subscribe whose publisher changed mid-POST.

### 3.5 What stays identical
- The `fetch()` calls to `rtc.live.cloudflare.com` (SFU session create/track add) work unchanged
  from a Worker/DO — actually nicer (same CF network).
- TURN credential minting (currently `ice-config`) → a Worker route.

---

## 4. Data model → D1

Port the existing tables (users, rooms, meeting_sessions, llm_settings, recording index) to D1.
- SQL is largely portable; `better-sqlite3` synchronous calls become D1 async (`await`).
- Migrations: keep the `NNNN_name.sql` idempotent convention; apply via `wrangler d1 migrations`.
- Sessions/settings are per-owner KV-ish rows — trivial in D1.

---

## 5. Recording → R2 (per-person, downloadable)

- Each participant's stream is recorded to a **separate R2 object** (one `.webm` per speaker),
  keyed `sessions/<sessionId>/<displayName>-<clientId>.webm`.
- **Downloadable**: a Worker route streams the R2 object with `Content-Disposition: attachment`
  (mirrors the current `/api/recordings/:filename/download`).
- The recording *index* (who/when/size/duration) lives in D1; the bytes live in R2.
- Upload path: browser `MediaRecorder` → chunked PUT to a Worker → R2 multipart. No filesystem.

---

## 6. Transcription (DISABLED by default; whisper as a 3rd-party/decoupled provider)

> Per direction: in CFBASE, **transcription is off by default — we just record per person and
> make it downloadable.** Whisper is treated as one pluggable provider, never inline.

- **Default:** `transcriptionMode = 'off'`. Calls produce per-person downloadable recordings and
  nothing else. Zero STT cost/latency unless a host opts in.
- **When enabled** (host setting `auto` | `ondemand`): recording finalize → enqueue a message on
  a **CF Queue** → a **Transcription Worker** consumes it, pulls the R2 object, and calls a
  provider:
  - `workers-ai` — Cloudflare Workers AI Whisper (stays on CF, no egress).
  - `thirdparty` — external STT (Deepgram / AssemblyAI / OpenAI) via `MEET_STT_*` secrets.
  - (No on-box Python — Workers can't run it; that coupling is exactly what we're removing.)
- Result transcript written back to R2 (+ index row in D1). Named-per-speaker aggregation is the
  same approach proven in the current app (per-user object → per-name lines).
- **This mirrors the decoupling already shipped in the current app** (post-call, serialized,
  provider seam) — CFBASE just makes the provider a Queue→Worker instead of a child process, and
  flips the default to off.

---

## 7. Media — unchanged (and why int'l PH↔US keeps working)

- **Do not rebuild media.** Cloudflare Calls SFU + TURN already carry the audio/video over CF's
  global anycast network. A PH user and a US user each hit their nearest CF edge; the SFU bridges
  them. This is what makes the current international call work, and it is untouched by everything
  above.
- Edge-native signaling (RoomDO) actually *improves* call **setup** latency internationally (a PH
  user reaches a PH-edge Worker), but the ongoing media path is identical.
- Carry over the int'l diagnostics (`/app/diagnostics`, RTT≥150ms long-haul detection, the
  VPN-on-desktop guidance) — these are TURN-relay concerns independent of hosting.

---

## 8. Migration strategy — strangler, not big-bang

The current app works; do **not** rewrite everything at once. Each step is independently
shippable and validated by the existing harness.

1. **Frontend → CF Pages.** Static deploy. Point it at the existing backend. (Days.)
2. **RoomDO behind the same WS protocol.** Implement the peer state machine + alarms in a DO,
   run it in parallel, cut rooms over one at a time. Re-run the reconnect/ghost/4-way/durability
   harness against the DO. (The big step. ~1.5–3 weeks for someone fluent in DOs, because the
   spec + tests already exist.)
3. **D1 + R2.** Move data + recordings; keep the Worker API identical.
4. **Transcription Queue→Worker.** Off by default; enable Workers AI / external STT when wanted.
5. **Retire the VPS** once signaling + storage + transcription are native. CF Calls/TURN were
   already native from day one.

---

## 9. Risks / open questions (design with Peer2)

- **WS hibernation semantics** — serializing per-connection attachment state across hibernation;
  reconstructing peer↔ws mapping on wake. Highest-fidelity area; mirrors where the reconnect/ghost
  bugs lived, so it needs the same rigor.
- **Single-alarm scheduling** for N concurrent grace timers — the sorted-next-expiry pattern.
- **DO eviction mid-call** — what must be persisted (tickets, admitted set) vs reconstructable.
- **Workers AI Whisper quality** vs faster-whisper `medium` for named cross-talk — A/B before
  committing; the external-STT seam is the fallback.
- **R2 multipart upload** from `MediaRecorder` chunks — backpressure + finalize-on-call-end.
- **Cost model** — DO duration + requests + R2 storage/egress + Workers AI minutes vs a flat VPS.

---

## 10. Effort estimate (rough)

| Step | Effort |
|---|---|
| Frontend → Pages | 1–3 days |
| RoomDO signaling (the core) | 1.5–3 weeks |
| D1 + R2 | 1–1.5 weeks |
| Transcription Queue→Worker (off by default) | 3–5 days |
| Harness port + validation | ongoing, alongside |

De-risker: we already have the **spec** (working code) and the **tests** (measurement harness).
This is the cheapest moment to do it — the knowledge is fresh.

---

## 11. The test harness (carry it over — it's the most valuable asset)

Port the existing measurement harness as a first-class deliverable:
- Per-track getStats `bytesDelta`, WebAudio `energyAboveFloorMs`, FFT tone attribution.
- Remote-machine relay (drive a second real machine, e.g. across the world) to prove int'l both
  directions — not synthetic-only.
- The reconnect / ghost / 4-way / durability / screenshare / recording / transcription scenarios.
- Adversarial verification (independent raw-log check; verifier ≠ implementer) — this caught
  every overclaim during the current build.

---

### Appendix A — current app, for reference
- Stack: Angular + Node/Express + `ws` + `better-sqlite3`; CF Calls SFU + TURN; CF Tunnel →
  `serve.js` (localhost:4700) consolidated proxy. Live at `https://voice.silverjrom.app`.
- The real fixes that inform this design are committed on branch
  `feat/remote-audio-e2e-20260619` (reconnect re-subscribe, ghost-participant, per-user recording,
  transcription decoupling). See repo `changes.md` and `plan/WK_0526/meet-remote-audio-e2e/`.
