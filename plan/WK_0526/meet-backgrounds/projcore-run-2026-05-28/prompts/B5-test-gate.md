# Batch B5 — E2E + final gate (R22)

> **Role for THIS dispatch:** You are the IMPLEMENTER. You are NOT projcore. Claude /projcore supervises from session `lkvc`. Do NOT modify queue/progress/req-matrix/context-handoff/north-star/og-requirements/callbacks. Implement THIS batch only.

## Read first

1. `plan/WK_0526/meet-backgrounds/projcore-run-2026-05-28/context-handoff.md` — what R18-R21 shipped.
2. `plan/WK_0526/meet-backgrounds/projcore-run-2026-05-28/og-requirements.md` § R22.
3. `e2e/tests/fixloop-banner/` — example specs to follow the existing fixture pattern.
4. `e2e/playwright.config.ts` — confirm base config.
5. `frontend/src/app/pages/room/room.page.ts` — confirm `window.__meetDebug.effectiveLocalStream` exists (B1 added it).

## No PROPOSED handshake — write one spec.

## Scope

### R22.1 — New playwright spec

Create `e2e/tests/background-effects.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
// import the existing helpers/fixtures used by fixloop-banner

test.describe.configure({ retries: 1 });

test.describe('Background effects', () => {
  test('composite stream replaces raw when blur is active', async ({ page, api /* whatever fixture */ }) => {
    const room = await api.createRoom('B5 BG Effects');
    await page.goto(`/r/${room.id}?role=host&name=host`);

    // Wait for lobby to fully render with camera preview ready.
    await expect(page.locator('app-lobby-preview')).toBeVisible();
    await page.waitForFunction(() => !!window.__meetDebug?.localStream?.getVideoTracks()[0]);

    // Locate picker; click Blur tile. Use accessible label/role.
    const blurTile = page.locator('app-background-picker [role="radio"]:has-text("Blur")');
    await blurTile.click();

    // Wait for model ready AND composite stream in place.
    await page.waitForFunction(() => {
      const dbg = window.__meetDebug;
      return !!dbg?.effectiveLocalStream
        && !!dbg.localStream
        && dbg.effectiveLocalStream !== dbg.localStream
        && (dbg.effectiveLocalStream as MediaStream).getVideoTracks()[0]?.readyState === 'live';
    }, null, { timeout: 30000 });

    // Compare track IDs.
    const state = await page.evaluate(() => ({
      rawId: window.__meetDebug?.localStream?.getVideoTracks()[0]?.id ?? null,
      effId: window.__meetDebug?.effectiveLocalStream?.getVideoTracks()[0]?.id ?? null,
    }));
    expect(state.rawId).not.toBeNull();
    expect(state.effId).not.toBeNull();
    expect(state.effId).not.toBe(state.rawId);

    // Toggle back to None.
    const noneTile = page.locator('app-background-picker [role="radio"]:has-text("None")');
    await noneTile.click();

    // Effective should drop back to raw.
    await page.waitForFunction(() => {
      const dbg = window.__meetDebug;
      return !!dbg && dbg.effectiveLocalStream === dbg.localStream;
    }, null, { timeout: 5000 });

    await api.dispose();
  });
});
```

Adjust imports/fixtures to match the existing pattern. Use the room/api fixtures that fixloop-banner uses (likely `e2e/tests/fixtures/` or similar — check first).

### R22.2 — Run gates

```bash
cd backend && npm run build
cd frontend && ng build
cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line
cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/background-effects.spec.ts --reporter=line
```

All four MUST pass.

### R22.3 — Test pollution cleanup

Per JROM standing instruction (memory `feedback_test_pollution_cleanup.md`): clean up the test room created by the spec. The `api.dispose()` call (or whichever fixture handles teardown) should delete the room after the test ends. The persistent room `TEST_ROOM01` (`3f324d8be763`) is the only one we leave alive.

### R22.4 — Validation doc

Write `validation/B5-test-gate.md` documenting:
- Files touched (just the new spec + this MD)
- Spec coverage: assertions made, timing assumptions, retry strategy
- Final gate results: 4 PASS rows (backend build, frontend build, fixloop-banner 16/16, background-effects 1/1)
- Phase 2b summary: 5 batches, 5 commits, all 5 requirements VERIFIED
- Note that JROM-side manual smoke is OUT OF SCOPE for this run (separately needed before declaring production-ready)

### R22.5 — Commit

Single atomic commit: `test(bg): playwright spec for composite stream + R22 gate (R22)`

Touch ONLY:
- `e2e/tests/background-effects.spec.ts` (new)
- `validation/B5-test-gate.md` (new)

If a new fixture file is REQUIRED that doesn't exist, you may create it under `e2e/tests/fixtures/` — but try to reuse first.

## Hard constraints

- ONLY touch the new spec file + validation MD (+ a fixture file IF and only if absolutely required).
- DO NOT touch frontend code.
- DO NOT touch background-effects.service.ts.
- DO NOT touch background-picker.component.*.
- DO NOT touch room.page.ts.
- DO NOT touch backend.
- Spec must complete in <60s including model load.
- Test rooms MUST be cleaned up (delete after spec ends).

## Acceptance gate

1. Code review by projcore: spec exercises composite-stream-in-use semantics via `window.__meetDebug`; toggle-back-to-none restores raw; one happy path (no over-coverage).
2. All four build/test rows green.
3. Validation MD written.
4. Commit message exactly: `test(bg): playwright spec for composite stream + R22 gate (R22)`.

## Stop conditions

- If the existing fixloop-banner fixtures cannot be reused for room creation, STOP and report — do NOT spawn parallel infrastructure.
- If the MediaPipe model fails to load in the playwright environment, document and STOP — that's a CI-level concern outside this batch.
- If the spec is genuinely flaky (more than retry handles), STOP — investigate the timing assumption rather than masking with longer waits.

## Self-check

- [ ] New spec at e2e/tests/background-effects.spec.ts
- [ ] Spec uses existing fixtures (no parallel infra)
- [ ] Spec asserts track-id-difference when blur active
- [ ] Spec asserts effective===raw when None
- [ ] backend build PASS
- [ ] frontend ng build PASS
- [ ] fixloop-banner 16/16 PASS
- [ ] background-effects 1/1 PASS
- [ ] Test rooms cleaned up post-spec
- [ ] validation/B5-test-gate.md written
- [ ] Single atomic commit

Final line MUST be EXACTLY: `STATUS: DONE — Batch B5 ready for validation`
