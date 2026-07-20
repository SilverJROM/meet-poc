# B00S-DEVICE Validation r2

Validator: Codex reviewer
Scope: B00S-DEVICE re-gate after `5876b9d` (`fix(B00S-DEVICE): reject fake-device flags under real-virtual-mic`)
Baseline prior FAIL: sneaked fake flags
Verifier != fixer: yes
device_mode: real-virtual-mic-gated

## Verdict: PASS

## Gate Results

1. `real-virtual-mic` rejects sneaked fake media flags: PASS
   - `e2e/harness/call-driver.ts:124` builds launch args from defaults plus caller `launchArgs`.
   - `e2e/harness/call-driver.ts:138` through `:148` filters the final args and throws when either forbidden fake-device flag is present:
     - `--use-fake-device-for-media-stream`
     - `--use-file-for-fake-audio-capture...`
   - The throw happens before `assertRealVirtualMicHost()` at `e2e/harness/call-driver.ts:149`, so a caller cannot hide the fake flags behind the `.123` host gate.

2. Regression test covers the prior failure shape: PASS
   - `e2e/harness/__tests__/b00s-device.test.ts:76` through `:90` sets `MEET_REAL_MIC_HOST=123` and asserts that `deviceMode: 'real-virtual-mic'` with fake-device launch args throws `/forbids fake-device flags/`.
   - This specifically blocks the prior behavior where fake flags could be supplied through `launchArgs` and survive silently.

3. Individual forbidden-flag verification: PASS
   - Direct probe command run from `e2e/`:

```text
node --import ../node_modules/tsx/dist/esm/index.mjs --eval "<buildLaunchArgs probe>"
```

   - Result:

```text
PASS individual forbidden flag throws: --use-fake-device-for-media-stream
PASS individual forbidden flag throws: --use-file-for-fake-audio-capture=/tone.wav
```

4. Targeted B00S test run: PASS
   - Command run from `e2e/`:

```text
npx vitest run harness/__tests__/b00s-device.test.ts
```

   - Result:

```text
Test Files  1 passed (1)
Tests       11 passed | 1 skipped (12)
Duration    451ms
```

   - The single skip is the expected live `real-virtual-mic` smoke gated off this host because it is not `.123`.

5. Requested npm test invocation behavior: PASS
   - Command run from repo root:

```text
npm test -w e2e -- harness/__tests__/b00s-device.test.ts
```

   - Because the `e2e` package script already includes `vitest run harness/__tests__`, npm appended the target file and Vitest ran the full harness suite. Result:

```text
Test Files  16 passed (16)
Tests       141 passed | 6 skipped (147)
Duration    111.81s
```

   - The requested `b00s-device.test.ts` file passed inside that run:

```text
harness/__tests__/b00s-device.test.ts (12 tests | 1 skipped)
```

## Caveats

- This is a gated validation on the current host, not a live `.123` PipeWire virtual-mic smoke. The live smoke remains intentionally skipped unless run on `.123` or with a truthful `.123` runner.
- No hardening script was run: `project_specs.md` says hardening protocol is not adopted for this repo.

STATUS: DONE - PASS r2
