# B00S-RELOAD — Document-load INVALID_RELOAD (replace false navCount invariant)

§4b: impl sonnet, FINAL val codex55, redteam budget. 0 acceptance burns.

## Binding (north — do NOT fudge)
1. **DELETE** `window.history.replaceState` / `pushState` monkeypatch entirely. Harness must never mutate the app under test.
2. **DELETE/replace** unit tests that lock `navCount > 1 => INVALID_RELOAD` — that encodes a **FALSE** invariant (same shape as T_gap=3400ms). A real reload re-runs addInitScript and resets state to navCount:1, so the old guard never fires on real reload and always fires on Angular Router.
3. **Primary detection (authoritative, out-of-page):** Between `installCaptureHook` and `stopAndEncodeCapture`, count Playwright main-frame document loads via `page.on('load')` and/or main-frame `framenavigated` (document navigations only — not same-document history). **documentLoadCount > 1 => INVALID_RELOAD**.
4. **Optional in-page corroboration:** sessionStorage epoch e.g. `__b08s2Doc` incremented on each init-script run; n>1 after a true reload. Assert explicitly; do not only infer from pcCount=0.
5. **classifyCapture API:** Replace navCount-based INVALID_RELOAD with something that accepts out-of-page load count (e.g. pass `documentLoadCount` into classifyCapture or check in stopAndEncodeCapture before/alongside classify). Remove navCount from the live path if unused.
6. **Regression tests — BOTH directions mandatory:**
   - (a) Angular SPA route change (or simulated same-document history / SPA navigate) does **NOT** trip INVALID_RELOAD.
   - (b) Actual `page.reload()` **DOES** trip INVALID_RELOAD.
   Without (b) you have not tested the thing the guard exists for.
7. Re-gate B08S-2 taxonomy unit tests + browser tests green; prepare for codex55 FINAL.

## Files likely
- e2e/harness/receive-side-recorder.ts
- e2e/harness/__tests__/receive-side-recorder.test.ts
- e2e/harness/__tests__/b08s2-receive-capture-hook.browser.test.ts (replace navCount gate test; add reload + SPA tests)
- call-driver / stopReceiveSideRecording wiring if install/stop need load listeners

## Deliverables
Atomic commit(s), validation/b00s-reload-changes.md, callback DONE.

## Handshake
PROPOSED first (mech, files, how load count is tracked across pages, test plan) → APPROVED-PLAN → implement.
