# Batch 1 Changes — Host remote-audio playout: honest playability + AudioContext resume

## Branch: `feat/host-audio-playout-mic-persist-20260601`  (Cut from `master` @ `d3591e4`)

## User Report (verbatim from brief / og-requirements.md)
> "i just had a call with a user (from the US) and he was able to hear me and see my video but, i cant hear him, he is able to share screen that works but the voice is still broken on his part, he tried joining on a phone with the same issue please check the diagnosis and fix this"

(R1 only. R2 mic-persistence is B2 — out of scope.)

## Root Cause (mechanism-level)
Two distinct mechanisms in the Web-Audio mixer playout path (mixer is the SOLE remote-audio sink; per-tile `<audio>` are silenced when `remoteAudioMixerEnabled()` is true):

- **BUG-1 — dishonest playability detection.** `RemoteAudioService.unlockAndPlayRemoteSinks()` and `allSinksPlaying()` computed playability from `HTMLAudioElement.paused` ONLY, **never** `AudioContext.state`. A `MediaStreamAudioSourceNode` pulls ZERO samples (`jitterBufferEmittedCount` stays 0 ⇒ silence) while its `AudioContext.state !== 'running'`, yet a suspended context leaves the output element un-paused and `play()` resolves. So a **suspended-context-with-sources** state returned `allPlayable = true` ⇒ `room.page.ts` set `remoteAudioBlocked = false` ⇒ the `.audio-unblock-notice` "Tap to enable audio" banner never surfaced ⇒ the host heard nothing with no recovery affordance. This is the exact match for the diagnostics data (`bytesReceived` 1.4M, `jitterBufferEmittedCount` 0, host-only).

- **BUG-2 — non-gesture re-unlock + no source-add re-evaluation.** The host typically performs the unlock gesture while alone (0 sources, mixer `play()` skipped), and the `syncPeers` effect re-unlock fires from `window.setTimeout(…, 0)` — OUTSIDE the user-gesture call stack — so `AudioContext.resume()` is silently rejected by the browser and the suspended state was never re-surfaced when a remote source arrived.

Confirmed via localhost repro (`__suspendForTest` + `__injectRemoteSourceForTest` hooks): suspended-context-with-sources ⇒ banner now surfaces; genuine gesture resumes `suspended → running`, `outputPlaying false → true`, banner clears. Evidence: `screenshots/localhost-repro-debugsnapshot.md`.

## Code Changes

### New file — `frontend/src/app/services/remote-audio-playability.ts`
- `evaluateRemoteAudioPlayability(input)` — PURE, framework-free decision fn. Locked rule (U1-U10): `mixerEnabled && sourcesCount>0` ⇒ playable requires `contextState==='running' && outputAttached && !outputPaused && perPeerAllUnpaused`; `sourcesCount===0` OR `!mixerEnabled` ⇒ returns exactly `perPeerAllUnpaused`. This is the BUG-1 fix surface.

### `frontend/src/app/services/remote-audio.service.ts`
- `unlockAndPlayRemoteSinks()` — kicks off `context.resume()` **synchronously in-stack** (before the first `await`) so transient user-activation isn't lost; routes the return value through `evaluateRemoteAudioPlayability(...)` instead of the old `element.paused`-only computation (BUG-1 fix). On a non-gesture caller the resume rejects and the honest non-running verdict stands.
- `allSinksPlaying()` — now routes through `evaluateRemoteAudioPlayability(...)` (same honest verdict).
- `sourcesVersion` signal — bumped in `addSource`/`removeSource` so reactive consumers re-evaluate the banner on source-add (BUG-2 / R1.3).
- `outputPlaying` signal + `attachOutputListeners`/`detachOutputListeners` — tracks genuine mixer-output playout via element `playing`/`play`/`pause`/`ended` events, so the banner clears only once playout truly settles (not on a transient `.paused` read) and re-raises on suspend.
- `suspendForTest()` — localhost-guarded (at call site) test hook: `context.suspend()` to drive the suspended-with-sources negative path (E2/E4).
- `injectRemoteSourceForTest(id, stream)` / `removeRemoteSourceForTest(id)` — localhost-guarded (at call site) test hooks that mount a REAL `MediaStreamAudioSourceNode` into the live mixer graph (mirrors active-speaker's `injectDebugStream`), so e2e exercises the genuine `sources.size > 0` running-required branch without flaky cross-context ICE.

### `frontend/src/app/pages/room/room.page.ts`
- New reactive **authoritative playability effect** (NS2+NS3): tracks `contextState` + `outputPlaying` + `sourcesVersion`; while in-call with mixer sources, sets `remoteAudioBlocked = !(contextState==='running' && outputPlaying)`. This surfaces the banner on the suspended-with-sources reality (incl. the BUG-2 source-add path the `setTimeout(0)` re-unlock could not resume) and clears it once playout settles. Genuine gesture entry points (join, `enableRemoteAudio`) already call `unlockAudioFromGesture` → resume-in-stack + honest report.
- `remoteAudioMixer` debug object now exposes a fresh `debugSnapshot()` method + the localhost-only `__suspendForTest` / `__injectRemoteSourceForTest` / `__removeRemoteSourceForTest` hooks (next to the existing localhost-gated helpers). New `RemoteAudioMixerDebug` type; `__meetDebug.remoteAudioMixer` typing updated.
- No change to `setMutedAll`/`setVolume`/gain (R1.4). `room.page.html` banner was already wired — not touched.

## Commits
- `<hash>` [batch-1] honest remote-audio playability + AudioContext resume re-arm (R1) | scenarios: U1-U10, E1-E6

## Standing Rules (if discovered)
- Mixer-playout playability MUST treat a non-`running` `AudioContext` (with sources) as NOT playable; `element.paused` alone is insufficient. All future playability checks route through `evaluateRemoteAudioPlayability`.

## Verification
- **Frontend build / type-check:** PASS — `npm run build -w frontend` (Application bundle generation complete; pre-existing unrelated warnings only).
- **e2e type-check:** PASS — `npx tsc --noEmit -p e2e/tsconfig.json` (no host-audio errors).
- **Unit spec (HARD):** PASS — `npx tsx frontend/src/app/services/remote-audio-playability.spec.ts` → "remote-audio-playability: all assertions passed" (U1-U10). Regression: `remote-audio-health.spec.ts` re-run → "all assertions passed".
- **E2E (HARD E1-E5, SOFT E6):** PASS — `npm test -w e2e -- e2e/tests/b1-host-audio/ --config=playwright.config.ts --workers=1` → **6 passed**; re-run `--repeat-each=2` → **12 passed** (deterministic). E6 SOFT passed via the honest fake-media snapshot-proxy fallback (no live inbound RTP under headless — reported, did not gate). Ran against an isolated webserver (ports 4730/4731/4740 + isolated DB/recordings) to avoid live PM2 collision.
- **DEV deploy:** `npm run build -w frontend` + `pm2 restart meet-poc-be meet-poc-fe` (no env change). Smoke: BE `/health` 200, FE `/login` 200, DEV tunnel `https://voice.silverjrom.app/login` 200.
- **Localhost repro note (NS5):** `screenshots/localhost-repro-debugsnapshot.md` — debugSnapshot `suspended → running`, `outputPaused` false, `outputPlaying false → true`, banner surfaces then clears.

## Bug Reproductions
- **Before:** suspended `AudioContext` + sources ⇒ `allPlayable = true` (element-paused-only) ⇒ banner suppressed ⇒ silent host, no recovery. (Mechanism reproduced; matches diagnostics `emitted=0`.)
- **After:** suspended + sources ⇒ `evaluateRemoteAudioPlayability` returns `false` ⇒ banner surfaces (E2). Genuine gesture ⇒ `resume()` re-attempted in-stack ⇒ `running` + `outputPlaying` ⇒ banner clears (E3). Source added while suspended ⇒ banner surfaces, then gesture recovers (E4). Volume + mute-all unaffected, no spurious re-block (E5).

## Caveats
- **PRE-EXISTING:** the reference `e2e/tests/v3-audiofix` harness selectors ("Start with camera on", "Join") are stale against the current lobby UI (label drift to "Camera off"/"Join now"); the B1 harness uses the current selectors. Not a B1 regression — flagged for a later harness refresh.
- **HARNESS LIMITATION (NS5, expected):** two ephemeral Chromium contexts do NOT complete a mesh (`?sfu=0`) WebRTC peer connection in this headless sandbox (peer stays `connecting`, no remote stream arrives — confirmed via diagnostic), and the SFU path needs live Cloudflare credentials. The B1 e2e therefore mounts a real synthetic remote source into the live mixer graph via the localhost-only injection hook, exercising the genuine product playability/resume code end-to-end. Real climbing-`jitterBufferEmittedCount` two-machine confirmation remains JROM's seat per NS5 — the `contextState`/`outputPlaying` transition is the deterministic proxy.
