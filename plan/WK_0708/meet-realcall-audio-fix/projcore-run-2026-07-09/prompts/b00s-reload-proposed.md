# B00S-RELOAD — PROPOSED

## Recon (done, informs plan below)
- Only production call site of the two-phase API is `e2e/harness/call-driver.ts:372-453`: `startReceiveSideRecording` (installs hook pre-nav) → `joinBrowser`'s single `page.goto(roomUrl)` (`call-driver.ts:193`) → optional `onLive` mid-call hook → `stopReceiveSideRecording`. **No `page.reload()` anywhere in the production flow** — confirmed by grep across `e2e/harness/`.
- The only existing reload-detection mechanism, anywhere in the repo, is the `navCount` history monkeypatch inside `installCaptureHook` (`receive-side-recorder.ts:174-189`) — no `framenavigated`, `page.on('load'`, `documentLoadCount`, or `__b08s2Doc` exists yet.
- `classifyCapture` is unit-tested as a pure function (`receive-side-recorder.test.ts`) and the live hook's nav-gating is separately tested in `b08s2-receive-capture-hook.browser.test.ts`'s second `it()` (lines 166-203) via **simulated** `history.replaceState/pushState` calls — never a real `page.reload()`. That's the gap binding #6(b) calls out.
- `call-driver.test.ts` (lines 599-809) exercises `installCaptureHook`/`stopAndEncodeCapture`/the two-phase API against **plain mock page objects** that implement `addInitScript`/`evaluate`/`url()` but **not** `.on()`. Any new `page.on('load', ...)` wiring must be guarded the same way the existing `url()` ordering-guard is ("mocks without `.on()` are allowed, test-only"), or these unit tests break.

## 1. Mechanism (authoritative, out-of-page)
- New module-level `WeakMap<Page, { count: number }>` in `receive-side-recorder.ts` (`documentLoadCounts`).
- `installCaptureHook(page)`: if `typeof (page as any).on === 'function'` (same defensive pattern as the existing `url()` guard), register a counter and `page.on('load', () => counter.count++)` before returning. `Page`'s `'load'` event is main-frame-scoped (unlike `framenavigated`, which also fires for subframes), so no extra filtering is needed. First real navigation (the join `page.goto`) ticks it to 1 — that's expected, not a reload. A genuine `page.reload()` later ticks it to 2+.
- New exported accessor `getDocumentLoadCount(page: Page): number | undefined` (thin read of the WeakMap) so browser tests can assert the out-of-page count directly without threading it through `stopAndEncodeCapture`.
- **DELETE** the `window.history.replaceState`/`pushState` monkeypatch block (`receive-side-recorder.ts:174-189`) entirely from the `addInitScript` callback. Harness stops mutating the app under test.
- **DELETE** `navCount` from the `B08S2CaptureState` interface and from both state-init object literals (the `!originalRtcPeerConnection` early-return branch and the main init) — dead field once the monkeypatch is gone.
- **ADD** optional in-page corroboration that survives reload: at the very top of the `addInitScript` callback (before the `originalRtcPeerConnection` check, so it runs on every document regardless of RTC availability):
  ```js
  const epoch = Number(sessionStorage.getItem('__b08s2Doc') || '0') + 1;
  sessionStorage.setItem('__b08s2Doc', String(epoch));
  (window as any).__b08s2Doc = epoch;
  ```
  `sessionStorage` survives a real reload (cleared only on tab/context close), so `epoch` reads 1 on first load and 2+ after a true reload — while SPA route changes never re-run `addInitScript` at all, so `epoch` can't move on a route change. Read via `page.evaluate(() => sessionStorage.getItem('__b08s2Doc'))` in tests, asserted explicitly (not inferred from `pcCount===0`).

## 2. `classifyCapture` API change
- Extend the second param: `stats?: { inboundAudioRtp?: number; documentLoadCount?: number }`.
- Replace `if (state.navCount && state.navCount > 1) return INVALID_RELOAD` with `if (stats?.documentLoadCount !== undefined && stats.documentLoadCount > 1) return INVALID_RELOAD`, kept in the same position (right after the `installed` check, before `pcCount`) so precedence over the other INVALID_* kinds is unchanged.
- `stopAndEncodeCapture(page, outputDir, hookId)`: after reading `{ state, stats }` from `page.evaluate(...)`, merge `documentLoadCount: documentLoadCounts.get(page)?.count` into the `stats` object passed to `classifyCapture`. If the hook-missing path returns `stats: null`, pass `{ documentLoadCount }` alone.
- Mock pages in `call-driver.test.ts` never call `.on()`, so `documentLoadCounts.get(page)` is always `undefined` there → `documentLoadCount` stays `undefined` → no behavior change for those existing tests. Their stray `navCount: 1` mock fields become inert extra properties; not touching that file (out of scope, harmless).

## 3. Test changes
- `receive-side-recorder.test.ts`: remove the `navCount > 1 => INVALID_RELOAD` unit test (lines 19-37, the one whose own comment already flags it as testing a **replaced** contract) and the `{ navCount: 2 }` row in the table-driven invalid-states test (line 164). Add two replacements: `classifyCapture(validState, { documentLoadCount: 2 })` → `INVALID_RELOAD`, and `classifyCapture(validState, { documentLoadCount: 1 })` (and `undefined`) → not `INVALID_RELOAD`. Strip the now-dead `navCount: 1` from the remaining fixture literals in this file.
- `b08s2-receive-capture-hook.browser.test.ts`: **delete** the second `it()` (lines 166-203 — simulated pre/post-PC history mutation, mechanism no longer exists). Add two new real-browser tests, both directions per binding #6:
  - (a) **SPA-style same-document navigation does NOT trip INVALID_RELOAD**: install hook, `page.goto(server.url)`, then call `history.pushState({}, '', location.href)` in-page (stand-in for Angular Router — this synthetic test harness has no real SPA app to route within) → assert `getDocumentLoadCount(page) === 1` and `sessionStorage.__b08s2Doc === '1'`, and that `classifyCapture(state, { documentLoadCount: 1 })` is not `INVALID_RELOAD`.
  - (b) **A real `page.reload()` DOES trip INVALID_RELOAD**: install hook, `page.goto(server.url)`, then `await page.reload()` → assert `getDocumentLoadCount(page) === 2` and `sessionStorage.__b08s2Doc === '2'` (corroboration), and `classifyCapture(state, { documentLoadCount: 2 }).kind === 'INVALID_RELOAD'`.
- No changes needed to `call-driver.ts` (reload never occurs there) or `call-driver.test.ts` (mocks unaffected per §2).

## 4. Files
- `e2e/harness/receive-side-recorder.ts` — remove history monkeypatch + `navCount`; add `documentLoadCounts` WeakMap, `page.on('load')` wiring (guarded), `getDocumentLoadCount` export, sessionStorage epoch, `classifyCapture`/`stopAndEncodeCapture` signature changes.
- `e2e/harness/__tests__/receive-side-recorder.test.ts` — replace navCount-based INVALID_RELOAD test + table row with documentLoadCount-based equivalents.
- `e2e/harness/__tests__/b08s2-receive-capture-hook.browser.test.ts` — delete simulated nav-gating test; add real SPA-style-nav (does not trip) + real `page.reload()` (does trip) tests.

## 5. Estimate
Impl ~20-25 min (small, contained diff), sonnet. Re-gate: run `receive-side-recorder.test.ts` (vitest) + `b08s2-receive-capture-hook.browser.test.ts` (real Chromium, ~2 loopback calls, 0 acceptance burns — no room/SFU/login, matches existing pattern in this file) green, then ready for codex55 FINAL per binding.

Awaiting APPROVED-PLAN.
