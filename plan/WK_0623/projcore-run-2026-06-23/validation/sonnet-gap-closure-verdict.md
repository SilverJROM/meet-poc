# Validator Verdict — Gap Closure (sonnet, 2026-06-24)

Validator: sonnet (independent, verifier ≠ fixer)
Branch: main
Run at: 2026-06-24 01:28–01:32 UTC

---

## Check 1: Scope Hygiene

Files modified by implementer (codex55):

| File | Category | Assessment |
|------|----------|------------|
| `backend/scripts/test_owner_labeling.py` | Test guard (Python) | OK |
| `backend/tests/transcribe-python.test.ts` | Test wrapper (Vitest) | OK |
| `backend/tests/signaling-background-relay.test.ts` | New test (Vitest) | OK |
| `frontend/src/app/components/tile/tile.component.spec.ts` | New test (Angular/Vitest) | OK |
| `frontend/angular.json` | CI wiring (test target) | OK |
| `frontend/tsconfig.tile-spec.json` | CI wiring (focused tsconfig) | OK |
| `frontend/package.json` + `package-lock.json` | Dev dep (`jsdom`) | OK |
| `plan/**`, `progress.md`, `.overmind-state.json` | Plan / infra state | OK |

**No production source touched** (`backend/src/**`, `frontend/src/app/**` non-spec, `backend/scripts/transcribe.py` logic all clean).

**SCOPE: PASS**

---

## Check 2: Green on Fixed Code

### Backend (`cd backend && npm test`)

```
Test Files  33 passed | 1 skipped (34)
Tests       237 passed | 1 skipped (238)
Duration    79.67s
```

New tests ran and passed:
- `✓ tests/transcribe-python.test.ts (1 test) 61ms`
- `✓ tests/signaling-background-relay.test.ts` (included in the 33-pass run)

Python guard confirmed actually executing python3 (not skipping): `Ran 4 tests in 0.002s — OK`

### Frontend (`cd frontend && npm test`)

```
Test Files  1 passed (1)
Tests       2 passed (2)
Duration    2.31s
```

New test ran and passed:
- `✓ |meet-poc-frontend| spec-app-components-tile-tile.component.spec.js (2 tests) 183ms`

**GREEN-ON-FIXED: PASS**

---

## Check 3: Revert-Sensitivity Proof

### GAP 1 (B1) — transcribe.py owner-labeling / mixed-skip / versioned sidecar

**Sabotage applied:** Changed `label_words_with_owner` in `backend/scripts/transcribe.py` to emit `"name": "?"` instead of the real participant name.

**Guard triggered:** `tests/transcribe-python.test.ts`

**Result:**
```
FAILED (failures=3)
Test Files  1 failed (1)
Tests       1 failed (1)
```

**Failing assertion (line 24):**
```
❯ tests/transcribe-python.test.ts:24:12
  expect(() => { execFileSync(python, ['scripts/test_owner_labeling.py', '-v'], ...) }).not.toThrow();
AssertionError: expected function not to throw but it threw Error
```

The Python guard reported 3 of 4 sub-tests failing (names `?` instead of `host`/`Peer2`/`Host`; `assertNotIn("?", names)` triggered; versioned sidecar payload `lines[0]["name"] != "Host"`).

**Production restored:** `git diff` shows zero diff on `transcribe.py`.

**GAP 1 REVERT-SENSITIVITY: PASS — guard goes RED on revert**

---

### GAP 2a (B4) — Tile cam-off image background / initials chip render

**Sabotage applied:** Removed `has-bg-image` class from `.camera-off-avatar` div in `frontend/src/app/components/tile/tile.component.html`.

**Guard triggered:** `frontend/src/app/components/tile/tile.component.spec.ts`

**Result:**
```
Test Files  1 failed (1)
Tests       2 failed (2)
```

**Failing assertions:**
```
× TileComponent camera-off background avatar > renders local image background with initials chip when camera is off
  AssertionError: expected null not to be null
  ❯ src/app/components/tile/tile.component.spec.ts:52:24
    expect(avatar).not.toBeNull()  // querySelector('.camera-off-avatar.has-bg-image') returned null

× TileComponent camera-off background avatar > renders a relayed built-in image background descriptor for remote camera-off peers
  AssertionError: expected null not to be null
  ❯ src/app/components/tile/tile.component.spec.ts:73:24
    expect(avatar).not.toBeNull()
```

Both local-image and remote-relayed-descriptor paths caught.

**Production restored:** `git diff` shows zero diff on `tile.component.html`.

**GAP 2a REVERT-SENSITIVITY: PASS — guard goes RED on revert**

---

### GAP 2b — Signaling media-state.background relay

**Sabotage applied:** Stripped `...(background ? { background } : {})` spread from the `media-state` broadcast in `backend/src/modules/signaling/index.ts`.

**Guard triggered:** `backend/tests/signaling-background-relay.test.ts`

**Result:**
```
Test Files  1 failed (1)
Tests       1 failed (1)
```

**Failing assertion (line 36):**
```
❯ tests/signaling-background-relay.test.ts:36:21
  expect(relayed).toMatchObject({
    type: 'media-state',
    clientId: ownerAdmitted.clientId,
    background: { kind: 'image', id: 'city' },   // ← absent from actual
  });
```

Received message had `{type, clientId, mic, cam, screenOn}` but no `background` key — `toMatchObject` correctly fails.

**Production restored:** `git diff` shows zero diff on `signaling/index.ts`.

**GAP 2b REVERT-SENSITIVITY: PASS — guard goes RED on revert**

---

## Summary Table

| Gap | Scope clean? | Green-on-fixed? | RED-on-revert? | Failing assertion captured |
|-----|-------------|----------------|----------------|---------------------------|
| G1 — transcribe.py owner-label / mixed-skip / versioned sidecar | ✅ | ✅ | ✅ | `transcribe-python.test.ts:24` `.not.toThrow()` / Python `assertNotIn("?", names)` |
| G2a — tile cam-off backdrop + initials chip | ✅ | ✅ | ✅ | `tile.component.spec.ts:52,73` `expected null not to be null` |
| G2b — media-state.background relay | ✅ | ✅ | ✅ | `signaling-background-relay.test.ts:36` `toMatchObject` / missing `background` key |

All three guards prove revert-sensitivity. No production edits left behind. All post-restore suite runs clean.

---

VERDICT: PASS

STATUS: VALIDATED
