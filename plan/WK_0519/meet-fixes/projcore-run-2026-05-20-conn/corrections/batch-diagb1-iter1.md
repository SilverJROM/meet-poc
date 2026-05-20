# DIAGB1 — Correction iter 1

**Gate failed:** §1.10 gate 4 (targeted/Run-1 regression). Run-1 set + diagb1 = **73 passed, 1 FAILED.**

## The single gap (bounded — fix ONLY this)

`e2e/tests/v2-b5-lobby/lobby-mic-meter.spec.ts` — **S5.2 "mic level meter shows activity" FAILS.**

```
> 6 | await expect.poll(() => page.locator('app-mic-meter .bar.is-active').count(), { timeout: 2500 }).toBeGreaterThan(0);
Error: expect(received).toBeGreaterThan(expected)
```

**Root cause:** DR-6 moved the mic meter (VU) behind the "Test / configure devices" expander on the default quick-join lobby. You correctly added `page.getByRole('button', { name: 'Test / configure devices' }).click()` to `lobby-device-selector.spec.ts`, `device-modal.spec.ts`, the mobile specs, and `two-axis-matrix.spec.ts` — but **missed `lobby-mic-meter.spec.ts`**, which calls `gotoOwnedLobby(page)` then asserts the mic meter directly without expanding.

## Concrete ask

1. Update S5.2 to expand the device test (click "Test / configure devices") before asserting the mic meter — consistent with the sibling lobby specs you already fixed.
2. Confirm the mic meter GENUINELY shows activity after expanding (the assertion must prove real meter activity, not just that the element exists). The fake-device mic should drive `.bar.is-active`.
3. **Sweep the rest of `e2e/tests/v2-b5-lobby/`** (and any other Run-1 spec) for any remaining assertion that depends on the now-collapsed device panel / mic meter / device dropdowns without expanding first. Fix all consistently in this pass so we don't iterate again.

## Preserved — do NOT redo

Everything else in e92e514 is accepted: DR-6 quick-join, DR-7 validation, DR-9 pending-list broadcast, DR-10 doorbell, backend 101/1-skip, diagb1 e2e 5/5, the other spec updates. This correction is ONLY the missed lobby-mic-meter expander click + the v2-b5 sweep.

## Completion

COMMIT the fix. Re-run the full Run-1 set + diagb1 to confirm green. End with `STATUS: DONE — <reason>` + append `[projcore callback] diagb1 DONE <note>` to callbacks.md.
