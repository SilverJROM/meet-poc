# B0 changes — SR-0: Raise/remove participant cap

## What changed

**`backend/src/modules/signaling/index.ts`**
- `MAX_ADMITTED = 5` → `MAX_ADMITTED = 30` (comment: SFU-era product cap; was mesh DR-50 = 5)
- Removed `MAX_MOBILE_ADMITTED = 4` constant
- Removed `mobileAdmittedCount()` helper (was only used for mobile cap check)
- Removed the mobile cap rejection block (`if (declaredMobile && mobileAdmittedCount >= MAX_MOBILE_ADMITTED)`)
- Both `room full (max ${MAX_ADMITTED})` error template literals now render "room full (max 30)"

**`backend/tests/signaling-room-full.test.ts`**
- S2.11 updated: now asserts 6 participants (owner + 5 guests) are all admitted — proves old mesh cap of 5 is gone

**`backend/tests/signaling-mobile-cap.test.ts`**
- S5.3 updated: now asserts 5 mobile participants all admitted — proves old mobile-specific cap of 4 is gone
- S5.5 updated: asserts 6 total mobile participants admitted — mobile peers count against global cap only

## Why

The mesh fan-out topology required a low cap (5 total, 4 mobile) to prevent quadratic bandwidth explosion. The SFU cutover (Cloudflare Realtime) forwards streams server-side, removing the fan-out constraint entirely. The mobile-specific lower limit was specifically to protect phone uplinks from mesh fan-out; on SFU, phones only receive forwarded streams, so no separate mobile limit is needed. `MAX_ADMITTED = 30` is an explicit product/billing guard, not a topology constraint.

## Build + test result

- `npm run build` — clean (0 errors)
- `signaling-room-full.test.ts` — 1/1 pass
- `signaling-mobile-cap.test.ts` — 2/2 pass
