# Multi-peer hardening — validation

## Files touched
- `frontend/src/app/services/sfu-mid-reconcile.ts` — kind validation + length guard; fail loudly + throw so retry path can recover
- `frontend/src/app/services/sfu-client.service.ts` — peer-count-aware simulcast (h/m/l at 1-2/3-4/5+ subscribed video peers) + `updateCameraLayer()` triggered on subscribe-cleanup + `pendingOntrack` cleared on peer-leave
- `e2e/tests/fixloop-banner/multipeer.spec.ts` (NEW) — 4-peer (host + 3 guests) consistency test asserting all peers reach connected + no host subscribe-stuck warnings

## Three risks closed
1. **Positional reconcile** — `responseTracks[i] ↔ newTransceiverMids[i]` pairing is now validated (length match + kind match against `transceiver.receiver.track.kind`). Throws on mismatch → subscribe op fails → existing retry path kicks in. Loud failure beats silent corruption at N=4+.
2. **No simulcast downgrade** — `cameraRidNow()` now returns 'l' at 5+ subscribed video peers, 'm' at 3-4, 'h' otherwise. `updateCameraLayer()` re-fires when subscribed-publisher count changes.
3. **Orphan `pendingOntrack`** — cleared per-mid alongside `midToEntry.delete()` in the peer-leave cleanup path.

## Validation
- `cd backend && npm run build` — PASS
- `cd frontend && ng build` — PASS
- `E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — **5/5 PASS** in 19.6s
- 3 consecutive single-run multi-peer tests: all PASS in 18.5-18.9s
- DB diagnostics from multi-peer sessions show **every peer subscribed to every other peer with firstFrameAtMs populated** (200-1000ms latency range), audio bytes flowing all directions

## Bug found in initial test (not the product)
Codex initially flagged the multi-peer spec as failing — but the failure was a test assertion bug: the spec asserted ALL `expectedPeers` tiles have `data-state="connected"`, but the LOCAL tile is `data-state="local"`. Corrected the assertion to expect `expectedPeers - 1` connected tiles + 1 local tile. Multi-peer SFU subscribe was working correctly all along; codex's hardening is purely defensive.

## CF documented limits (research)
- 50 API calls/sec/session — well within capacity for N≤8 peers
- 64 tracks/API call — well within capacity (we send 1-2 tracks per subscribe)
- No upper limit on tracks per session — bandwidth-bound

## Non-issues (verified safe at N=4-8)
- opQueue serialization is strictly serial — confirmed via diagnostic timing data
- ontrack buffer doesn't collide across peers (mid-keyed)
- Backend `sfu-roster` / `sfu-presence` broadcasting is O(N) per join, well within limits
- WebAudio mixer correctly disconnects removed peer sources (no leak)
- `.tiles-grid` CSS handles N=5-12 tiles
