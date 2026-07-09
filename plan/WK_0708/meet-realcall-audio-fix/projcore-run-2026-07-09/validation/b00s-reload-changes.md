# B00S-RELOAD — changes.md

## What
`INVALID_RELOAD` was driven by an in-page `navCount` incremented by a
`window.history.replaceState`/`pushState` monkeypatch — a false invariant in
both directions: a real `page.reload()` destroys the document, so
`addInitScript` re-runs and resets `navCount` to 1 (guard never fires on an
actual reload), while Angular Router's SPA route changes call
`history.pushState`/`replaceState` and always fired it (false positive).

Replaced with an out-of-page, authoritative signal: a `page.on('load')`
counter (`documentLoadCount`) tracked per `Page` between `installCaptureHook`
and `stopAndEncodeCapture`. `documentLoadCount > 1` ⇒ `INVALID_RELOAD`. An
in-page `sessionStorage` epoch (`__b08s2Doc`) is kept as optional
corroboration — it survives a real reload (unlike window state) and cannot
move on an SPA route change (no document is re-created).

## Why
North binding (`decisions/2026-07-09-north-invalid-reload-document-load.md`,
`decisions/2026-07-09-north-b00s-reload-binding.md`): the harness must never
mutate the app under test, and the guard must be tested in both directions —
SPA nav must not trip it, a real reload must.

## Mechanism
- `receive-side-recorder.ts`:
  - **Deleted** the `window.history.replaceState`/`pushState` monkeypatch and
    the `navCount` field from `B08S2CaptureState` and both state-init
    literals.
  - **Added** `documentLoadCounts: WeakMap<Page, {count:number}>`, populated
    in `installCaptureHook` via `page.on('load', () => counter.count++)`,
    guarded behind `typeof (page as any).on === 'function'` so mock `Page`
    objects (no `.on()`) used in `call-driver.test.ts` are unaffected.
  - **Added** `getDocumentLoadCount(page)` export for test/inspection use.
  - **Added** the `sessionStorage` epoch write at the top of the
    `addInitScript` callback, wrapped in `try/catch` — opaque-origin
    documents (e.g. `about:blank`) throw on `sessionStorage` access, which
    would otherwise abort the whole init script before
    `__b08s2ReceiveCapture` gets set (caught this via a real regression in
    `call-driver.test.ts`'s existing `page.goto('about:blank')` test).
  - `classifyCapture(state, stats)`: `stats` gained an optional
    `documentLoadCount`; the `INVALID_RELOAD` check now reads
    `stats.documentLoadCount > 1` instead of `state.navCount`, same position
    in the precedence chain.
  - `stopAndEncodeCapture`: merges `documentLoadCounts.get(page)?.count` into
    the `stats` object passed to `classifyCapture`.
- `receive-side-recorder.test.ts`: replaced the `navCount`-based
  `INVALID_RELOAD` unit test + table-driven row with `documentLoadCount`-based
  equivalents (`>1` ⇒ INVALID_RELOAD; `1`/`undefined` ⇒ not). Stripped the now
  dead `navCount` field from all other fixture literals.
- `b08s2-receive-capture-hook.browser.test.ts`: deleted the simulated
  pre/post-PC `history.replaceState`/`pushState` test (mechanism no longer
  exists). Added two real-browser regression tests:
  - SPA-style same-document `history.pushState` does **not** move
    `documentLoadCount` or the `__b08s2Doc` epoch, and does not trip
    `INVALID_RELOAD`.
  - An actual `page.reload()` **does** move `documentLoadCount` to 2 and the
    `__b08s2Doc` epoch to `'2'`, and trips `INVALID_RELOAD`.

No changes needed in `call-driver.ts` (no `page.reload()` in the production
flow) or `call-driver.test.ts` (mock pages lack `.on()`, so
`documentLoadCount` stays `undefined` for them — no behavior change).

## Verification
- `receive-side-recorder.test.ts`: 15/15 green.
- `b08s2-receive-capture-hook.browser.test.ts`: 3/3 green (real Chromium,
  loopback fake-device audio, 0 acceptance burns — no room/SFU/login).
- `call-driver.test.ts`: 14/14 green, 5 skipped (real-call gated).
  Caught and fixed a real regression here mid-implementation (sessionStorage
  throwing on `about:blank` broke hook install) before it shipped.
- `tsc --noEmit`: identical pre-existing error set as main (one pre-existing
  type error in `stopAndEncodeCapture`'s stats merge incidentally fixed by
  this change); no new errors introduced.
- Full `e2e/harness/__tests__` sweep: only pre-existing unrelated failure
  (`conversation-scheduler.test.ts` missing `durationMs` on bot-speech
  manifests, from a different batch — confirmed present on `main` via
  `git stash` before this change too).
