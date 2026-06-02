# B2 — Persistence-decision approach (R2 mic selection)

## Decision
Extract the "what should `selectedAudioId` be" choice into a **pure, framework-free function** `resolveSelectedAudioId({ chosenId, trackReportedId, enumeratedIds, storedId })` (+ `isGenericAudioDeviceId`) in `frontend/src/app/services/device-selection.ts`, unit-proven via `device-selection.spec.ts` (node:assert/strict, `npx tsx`). `syncSelectedAudioIdToTrack` (room.page.ts) routes through it instead of adopting `track.getSettings().deviceId` unconditionally.

## Decision order (the contract)
1. `trackReportedId` concrete (non-generic) AND enumerated → **adopt it** (genuine switch/recovery to a different real device).
2. else `chosenId` still enumerated → **keep `chosenId`** (THE FIX — never downgrade a present choice to `''`/generic).
3. else `storedId` enumerated → restore it (reload restore).
4. else `trackReportedId` enumerated (generic `'default'`) → accept it (legit unplugged→default fallback).
5. else `'default'` if enumerated.
6. else `enumeratedIds[0] ?? ''`.

`isGenericAudioDeviceId` ≡ `''` | `'default'` | `'communications'`.

## Why a pure function (NS5)
The real-hardware failure modes (`default`↔hash aliasing, tracks that report no `deviceId`) are not reproducible under the Playwright fake-device harness (it round-trips the chosen `deviceId` faithfully). A pure decision function makes every case deterministically provable (P1-P7) without a browser, and isolates the persistence policy from Angular/WebRTC lifecycle.

## Fallback preservation
The legitimate "device unplugged ⇒ fall back" path (`replaceInCallAudio` catch, `reacquireDefaultLobbyAudio`) fires only after the **exact** `getUserMedia` throws; the track it then acquires reports a concrete/`'default'` id → decision branch 1 or 4 adopts it. Only the **present-but-reset** case (branch 2) changed behavior.

## Divergence from the original plan (documented)
The PROPOSED/APPROVED plan scoped the fix to `room.page.ts:syncSelectedAudioIdToTrack`. QA E2 then proved the user-facing **reopen** snap-back was a *second, distinct* mechanism: the device-dialog mic `<select [value]="selectedAudioId()">` over dynamic `@for` options — Angular re-applies `[value]` only when the bound expression changes, so a reopened/re-rendered option list resets the native select to its first option (`'default'`) while the signal stays Mic 2. Fixed with per-option `[selected]="device.deviceId === selectedAudioId()"` (re-evaluated every render). Authorized by the brief's "fix the ACTUAL root cause + document divergence" clause and its pre-authorization of the device-dialog component.

## Caveats (deferred, out of R2 scope)
- camera-select + speaker-select in device-dialog have the identical `[value]`-over-dynamic-options desync — same one-line `[selected]` fix available; deferred (not R2).
- recovery sites (room.page.ts:2314 mic-sweep / :2414 recover) share `syncSelectedAudioIdToTrack`; a recovery track reporting an empty/generic id could briefly lag the displayed label — never breaks capture. Out of scope per JROM Q1 answer (keep recovery rewire out; documented caveat).
