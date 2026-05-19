# meet-poc

Self-hosted WebRTC meeting prototype. Browser-based audio + video calls with screen share and recording. No SFU, no vendor — full-mesh P2P + a tiny Node signaling server.

**Scope:** prototype only. Designed to be thrown away or rewritten when porting into lokalcamp.

## Stack
- **Server**: Node + Express (static + recording upload) + `ws` (WebSocket signaling). Single file: `server.js`.
- **Client**: plain HTML/CSS + vanilla JS using browser WebRTC API. `public/`.
- **Topology**: full-mesh P2P. Each participant opens an `RTCPeerConnection` to every other participant. Good for 2–4 people; degrades past that.
- **Recording**: client-side `MediaRecorder` mixing local mic + every peer's audio into one stream. Recording participant uploads the resulting `.webm` to the server (`recordings/`).

## Run

```bash
cd /home/agjrom/websites/meet-poc
npm install
npm start
```

Server prints:
```
meet-poc listening on http://0.0.0.0:3000
```

## Local test (one machine)

1. Open `http://localhost:4700` in browser tab A — enter name `Alice`, room `test`, click Join.
2. Open `http://localhost:4700` in tab B (or a second browser) — enter name `Bob`, room `test`, click Join.
3. You should hear yourself echo (use headphones to avoid feedback).
4. Toggle camera, screen share, record. Hit Record again to stop and upload — the saved file appears in `recordings/`.

## Cross-internet test (via Cloudflare Tunnel)

WebSocket signaling needs HTTPS for remote browsers (because `getUserMedia` requires a secure context). CF Tunnel terminates TLS for you.

```bash
# In another terminal, point a tunnel at the PoC
cloudflared tunnel --url http://localhost:4700
```

Cloudflared prints a `https://<random>.trycloudflare.com` URL — share it with your partner.

Or, if you want a stable hostname under your existing tunnel:
```bash
# Add a route to your named tunnel config (config.yml):
#   - hostname: meet-poc.silverjrom.app
#     service: http://localhost:4700
cloudflared tunnel route dns <tunnel-name> meet-poc.silverjrom.app
```

Both you and your partner open `https://meet-poc.silverjrom.app`, enter the same room name, click Join.

## Where recordings go

`recordings/` next to `server.js`. Each file is `YYYY-MM-DDTHH-MM-SS-ms_<room>_<rand>.webm`. Audio-only `.webm` (Opus codec) — ready to feed Whisper or Deepgram later.

```bash
ls -la recordings/
```

To play one: `vlc recordings/<file>` or open in browser.

## Troubleshooting

### "Mic/camera access failed"
Browsers require a secure context (HTTPS or `localhost`). If you're testing on a LAN IP like `http://192.168.x.x:3000`, the browser will refuse `getUserMedia`. Use `localhost` for local testing, or expose via CF tunnel for HTTPS.

### Peers connect via signaling but no audio/video flows
Connection state on the tile reports `failed`. This is the **NAT-traversal** case where pure STUN can't punch through (symmetric NAT on one side). You need a TURN relay server.

Fast options:
- **Add coturn locally** (~30 min) — `apt install coturn`, configure, then add its URL to `ICE_SERVERS` in `public/client.js`.
- **Use a managed TURN** like Twilio's NTS (free trial) or metered.ca's free TURN.

If you and your partner are both on home wifi with typical NATs, STUN alone usually works.

### Echo / feedback when testing on one machine
Use headphones, or mute one tab.

### Recording only captures my voice, not the other person
Make sure their audio track has arrived **before** you press Record. The mixer adds existing peer streams at start and any new peers that join after — but if a peer's audio track hasn't been received yet (rare), restart the recording after they're in.

## Architecture cheat sheet

```
Browser A                    Node signaling (server.js)                Browser B
    |                                  |                                    |
    | WS: join {room,name}             |                                    |
    |--------------------------------->|                                    |
    |<----- joined {clientId, peers[]} |                                    |
    |                                  |   WS: join {room,name}             |
    |                                  |<-----------------------------------|
    |<------ peer-joined {Bob}         |------ joined {clientId, [Alice]}-->|
    |                                  |                                    |
    | SDP offer ----------signal------>|----signal--SDP offer-------------->|
    |<-----------------signal----------|<---signal--SDP answer--------------|
    |                                  |                                    |
    | ICE candidates ----signal------->|----signal-----ICE candidates------>|
    |<-----------------signal----------|<---signal-----ICE candidates-------|
    |                                  |                                    |
    |================== direct P2P media (RTP) =============================|
    |                                  (or via TURN if P2P fails)           |
```

Signaling traffic goes through the Node server (so it goes through CF tunnel when you expose it). **Media (audio/video RTP) goes peer-to-peer** — it does NOT traverse your server or the tunnel. That's what makes WebRTC scale cheaply.

## Files

| Path | Purpose |
|------|---------|
| `server.js` | HTTP + WebSocket + recording upload |
| `public/index.html` | Lobby + call UI |
| `public/style.css` | Styling |
| `public/client.js` | WebRTC client + recording |
| `recordings/` | Saved audio recordings (gitignored) |
| `package.json` | Deps: `express`, `ws` |

## What's intentionally NOT in this PoC

- Persistent room state / database
- Auth (anyone with the URL can join any room)
- Chat panel
- Server-side recording / SFU
- Multi-party recording mix that survives one participant leaving
- E2E encryption beyond WebRTC's built-in DTLS-SRTP
- Mobile-optimized UI
- Reconnection logic if signaling drops

When porting to lokalcamp, all of the above gets revisited.
