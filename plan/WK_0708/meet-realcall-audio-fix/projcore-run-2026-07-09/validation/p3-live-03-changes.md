# P3-LIVE-03 changes.md

## Summary

Batch requirement: "One PASS live split-host SFU smoke: both publish + receive-side WAV with
voiced energy; audioinput path already fixed (2966e05 remap-source)."

**STATUS: BLOCKED.** Not met. No mechanism-level fix for `INVALID_NO_PC` was found this batch.
Tested and disproved two candidate fixes live against .123; both left `pcCount:0`. Full narrative,
evidence, and the next lead: `decisions/2026-07-10-p3-live-02-invalid-no-pc.md` (2026-07-10 —
P3-LIVE-03 follow-up section, appended).

## What was tried

1. **zone.js hypothesis (P3-LIVE-02's leading suspect) — disproven, not just untested.** Read
   `node_modules/zone.js/fesm2015/webapis-rtc-peer-connection.js` directly: it only patches
   `RTCPeerConnection.prototype.addEventListener`/`removeEventListener`, never reassigns the global
   constructor — it structurally cannot produce what we observe. Confirmed the app doesn't even
   load this plugin file (only the bare `zone.js` polyfill per `angular.json`), and there's no
   `webrtc-adapter`/equivalent dependency either.
2. **`Object.defineProperty(window, 'RTCPeerConnection', {writable:false, configurable:false})`**
   in `receive-side-recorder.ts`'s `installCaptureHook` — tested live (4 runs against real .123),
   reverted after (not shipped, since it didn't fix anything): `pcCount` stayed `0`, and the
   property descriptor itself was found reset to `{writable:true, configurable:true}` mid-call —
   not something a plain script-level reassignment can produce against a locked property. `git
   diff` on `receive-side-recorder.ts` is empty — nothing shipped from this line of investigation.
3. Ruled out via direct instrumentation (all confirmed on the actual failing runs, not assumed):
   real page reload (`documentLoadCount` stayed `1`), renderer crash (`page.on('crash')` never
   fired), extra/iframe frame (`page.frames().length === 1` throughout).
4. Traced the real `new RTCPeerConnection(...)` call sites in the **built, shipped** bundle
   (`frontend/dist/meet-poc-frontend/browser/chunk-*.js`, grepped directly — this is what actually
   runs in the browser): the real SFU client's PC, and a second, earlier TURN-relay reachability
   prober that runs during ICE-server setup. Neither ever incremented `pcCount` in any run,
   narrowing the revert to something that happens very early in app bootstrap, not at some later
   "second participant" moment.

## No app code touched, no shipped harness change

`git status` / `git diff --stat` on this batch: empty for `frontend/`, `backend/`, and
`e2e/harness/*.ts` (the `receive-side-recorder.ts` `defineProperty` experiment and
`p3-live-02-smoke.ts` diagnostic additions were both reverted with `git checkout --` before this
report — verified clean). This batch produced findings, not code.

## Calls / cleanup

- 4 smoke attempts (reusing `p3-live-02-smoke.ts` unmodified, plus temporarily-instrumented
  copies), all `acceptanceAttempt:false`, all `purpose:"smoke"`. `callBurnCount` unchanged at 0.
- 4 rooms created (`f447a5df3c60`, `8802dd635541`, `e3e3171b4240`, `e21404ec345c`), all verified
  `canDelete()==true` and DELETEd via the harness API (HTTP 200 each) — same room-leak-on-throw gap
  documented in the P3-LIVE-02 decision doc (not fixed, out of this batch's scope per that doc's
  own reasoning: shared `call-driver.ts` surface, needs its own review).
- Remote (.123) fully restored: no leftover chrome/Xvfb process, `pactl get-default-source` back to
  the original monitor.
- `free -h` checked before every launch; avail stayed ≥24Gi throughout.

## Recommendation for the next batch

CDP-level instrumentation beyond what Playwright's page-level API surfaces — e.g. `Target.*`/
`Runtime.executionContextCreated` event counts via the raw CDP session — is needed to confirm or
rule out a renderer-process/JS-realm swap invisible to `page.on('load')`/`page.on('crash')`. That's
a meaningfully different tool (raw CDP session handling, not `page.evaluate`), a plausible next
"PROPOSED" for whoever continues this.
