# B06 Validation — Faithful PipeWire weak-source mode

**Verdict:** PASS  
**Fix commit:** `45c2d7bf6a72aa5a41115d27e251d70f51100370`  
**Base scaffold commit:** `2850c2aa1f07b33ee469c0f7411e3935cdf564e9`  
**Validated:** 2026-07-09T03:05:30Z  
**Validator:** Codex / `$qa`

## Scope

This re-validation checks the B06 send-back fix in `45c2d7b` on top of `2850c2a`:

- correct live host/source references for `.123`
- real `pactl` read/set/verify/restore proof on `silverjrom@192.168.254.123`
- B06 findings document records live discovery, source-volume control, restore proof, and explicit OPEN status for the full browser dual-call AGC measurement
- B06 remains distinct from B05 forced-mode shim

The original full B06 observational call remains deferred by the fix itself; this PASS is for the send-back minimum DONE path, not for a completed dual-call AGC measurement.

## Commit Check

`git show 45c2d7b` changes:

- `e2e/harness/__tests__/b06-weak-source.test.ts`
- `e2e/harness/weak-source-control.ts`
- `plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09/decisions/b06-findings.md`

The operative B06 test/config examples now use:

- host: `192.168.254.123`
- SSH user in findings/docs: `silverjrom`
- source: `alsa_input.pci-0000_2d_00.4.analog-stereo`

Residual note: `weak-source-control.ts` still has two generic interface/top-comment examples mentioning the old host/source. They are stale comments, but the manual setup section, unit test config, and findings doc use the corrected live values. I do not treat this as blocking for the send-back proof.

## Test Evidence

Command:

```bash
cd /home/agjrom/websites/meet-poc/e2e
npx vitest run harness/__tests__/b06-weak-source.test.ts harness/__tests__/gum-shim.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests       18 passed (18)
```

Breakdown:

- `harness/__tests__/b06-weak-source.test.ts`: 7/7 passed
- `harness/__tests__/gum-shim.test.ts`: 11/11 passed

Note: `npm test -w e2e -- harness/__tests__/b06-weak-source.test.ts harness/__tests__/gum-shim.test.ts` was intentionally not used as final evidence because the workspace script prepends `harness/__tests__`, causing the whole harness directory to run. That broader run failed on pre-existing `call-ledger.test.ts` registering no Vitest suite, while B06 and B05 shim tests passed inside it.

## Live PipeWire Proof

Command shape used:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=8 silverjrom@192.168.254.123 '... pactl read -> set 60% -> verify -> restore raw prior volumes -> verify ...'
```

Observed evidence:

```text
HOST=jromhost
PACTL=/usr/bin/pactl
SERVER: PulseAudio (on PipeWire 0.3.65)
SOURCES:
46	alsa_output.pci-0000_2d_00.4.iec958-stereo.monitor	PipeWire	s32le 2ch 48000Hz	SUSPENDED
47	alsa_input.pci-0000_2d_00.4.analog-stereo	PipeWire	s32le 2ch 48000Hz	SUSPENDED
BEFORE=Volume: front-left: 65536 / 100% / 0.00 dB,   front-right: 65536 / 100% / 0.00 dB
        balance 0.00
AFTER_SET_60=Volume: front-left: 39321 /  60% / -13.31 dB,   front-right: 39321 /  60% / -13.31 dB
        balance 0.00
RESTORED=Volume: front-left: 65536 / 100% / 0.00 dB,   front-right: 65536 / 100% / 0.00 dB
        balance 0.00
RESTORE_MATCH=YES
```

The restore used the raw pre-test channel values parsed from `pactl get-source-volume`, not a hard-coded final percentage.

## Findings Doc Check

`decisions/b06-findings.md` now records:

- live `.123` discovery with the corrected host `silverjrom@192.168.254.123`
- discovered source `alsa_input.pci-0000_2d_00.4.analog-stereo`
- live attenuation proof: 100% -> 60% -> restored to 100%
- explicit OPEN for full dual-call AGC measurement
- distinction between B05 downstream forced shim and B06 pre-Chrome PipeWire attenuation

This satisfies the validator send-back requirement to produce measured live PipeWire control proof and document what remains for the full browser call.

## Acceptance Matrix

| Check | Result | Evidence |
|---|---:|---|
| Correct live host/source replaces stale operative B06 values | PASS | `45c2d7b`; test config and manual section use `.254.123` and analog-stereo source |
| Live host reachable by SSH | PASS | `HOST=jromhost`, `PACTL=/usr/bin/pactl` |
| PipeWire/PulseAudio source discovery works | PASS | `PulseAudio (on PipeWire 0.3.65)`, source `47` present |
| Safe set/restore proof completed | PASS | 100% -> 60% -> restored to exact raw 65536/65536 values, `RESTORE_MATCH=YES` |
| B06 unit/logging scaffold still passes | PASS | 7/7 B06 tests |
| B05 forced mode remains separate and green | PASS | 11/11 `gum-shim.test.ts` tests |
| Findings doc records live proof and remaining work | PASS | `decisions/b06-findings.md` Finding 4 and Finding 6 |
| Full dual-call AGC measurement completed | OPEN | Explicitly deferred in `decisions/b06-findings.md`; not required for this send-back PASS |

## Verdict

PASS for B06 re-validation after `45c2d7b` (+ `2850c2a`).

The fix now proves live PipeWire source control on `silverjrom@192.168.254.123`, verifies attenuation to 60%, restores the source exactly, keeps the B06/B05 harness tests green, and documents the remaining full browser dual-call AGC measurement as OPEN rather than claiming it is complete.
