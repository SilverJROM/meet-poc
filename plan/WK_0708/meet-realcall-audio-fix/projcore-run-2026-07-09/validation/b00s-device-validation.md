# B00S-DEVICE Validation

Validator: L2 codex55
Scope: B00S-DEVICE 36c3aff
Verifier != fixer: yes
device_mode: real-virtual-mic-gated

## Verdict: FAIL

## Gate Results

1. DEFAULT_LAUNCH_ARGS has no `--use-fake-device-for-media-stream`: PASS
   - `e2e/harness/call-driver.ts:73` through `:79` defines defaults without the fake-device flag.
   - The fake-device flag is now appended conditionally at `e2e/harness/call-driver.ts:127` through `:130`.

2. `deviceMode` required: PASS
   - `CallDriverConfig.deviceMode` is required at `e2e/harness/call-driver.ts:35`.
   - Runtime guard rejects missing dynamic/JS configs at `e2e/harness/call-driver.ts:326` through `:331`.
   - Repo grep found CallDriver API consumers updated with explicit `deviceMode`, excluding the intentional omission tests.

3. `real-virtual-mic` omits fake flags + host gate: FAIL
   - Host gate exists: `assertRealVirtualMicHost()` rejects non-.123 hosts at `e2e/harness/call-driver.ts:98` through `:106`, and the real branch invokes it at `:138` through `:142`.
   - Fake flag omission is not satisfied. `buildLaunchArgs()` starts with `const args = [...DEFAULT_LAUNCH_ARGS, ...(config.launchArgs || [])]` at `e2e/harness/call-driver.ts:125`, then the `real-virtual-mic` branch does not strip caller-supplied fake flags.
   - The unit test exposes the gap: `e2e/harness/__tests__/b00s-device.test.ts:76` through `:91` is named "never includes fake-device flags, even if launchArgs tries to sneak them in", but it expects two fake flags to remain in the returned args.

4. Provenance on `CallResult`: PASS
   - `CallResult` includes `provenance: CallProvenance` at `e2e/harness/call-driver.ts:67`.
   - `joinDualBrowserCall()` returns `{ deviceMode: config.deviceMode, stimulus: config.stimulus }` at `e2e/harness/call-driver.ts:462`.

5. Unit tests pass: PASS
   - Command run: `npx vitest run e2e/harness/__tests__/b00s-device.test.ts`
   - Result: 1 test file passed; 11 tests passed; 1 skipped.
   - Skip reason: live `real-virtual-mic` smoke is gated off this host. Host observed as `192.168.254.140`, hostname `minisserver`, no `pactl` found on PATH.

## Evidence

```text
RUN  v2.1.9 /home/agjrom/websites/meet-poc

✓ e2e/harness/__tests__/b00s-device.test.ts (12 tests | 1 skipped) 8ms

Test Files  1 passed (1)
Tests       11 passed | 1 skipped (12)
Duration    501ms
```

## Required Fix Before PASS

- In `buildLaunchArgs()`, the `real-virtual-mic` result must not contain `--use-fake-device-for-media-stream` or `--use-file-for-fake-audio-capture`, including when those flags are supplied via `config.launchArgs`.
- Update the B00S unit test at `e2e/harness/__tests__/b00s-device.test.ts:76` through `:91` to assert zero fake flags in the returned `real-virtual-mic` args.

STATUS: DONE - FAIL
