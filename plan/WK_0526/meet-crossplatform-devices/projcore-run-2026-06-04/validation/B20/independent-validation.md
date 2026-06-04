# B20 — Independent Validation (projcore, solo): UX1/UX2/D1/CMP1

**Verdict: SOLID** — committed by projcore. Solo-validated (UI/join-flow, low-risk; D1 + UX2 logic reviewed carefully). Verifier ≠ fixer.

## Scope re-derivation (projcore, before dispatch)
R9-S1/S2 confirmed ALREADY DONE by B14 (`local-media-recovery.ts`) → correctly excluded from B20. The lobby back-link was already conditional; only the 3 terminal panels needed UX1.

## Proof re-run by projcore
- `npx tsx room-decisions.spec.ts` → all assertions pass (Enter→submit; Shift+Enter→no; isComposing→no; keyCode 229→no; protected non-owner unverified→prompt; owner/open/verified→no prompt). ✅
- regression specs pass: room-recording, room-lifecycle, media-acquisition. ✅
- `npx ng build` green (pre-existing warnings only). ✅
- DEV: pm2 meet-poc-fe restarted (online).

## Diff review (scope clean — no R9/SFU/signaling/recorder/transport/mic-select/relay touched)
- **UX1** room.page.html not-found/rejected/error panels → `[routerLink]="auth.user() ? '/app/rooms' : '/'"` + conditional label. Guest no longer dead-ends at /login. ✅
- **UX2** chat textarea `(keydown.enter)="handleChatEnter($event)"`; `handleChatEnter` = `if (!shouldSubmitChat(e)) return; sendChat(e)`. `shouldSubmitChat` = Enter && !shift && !(isComposing||keyCode===229). Shift+Enter/IME → falls through to textarea newline; plain Enter sends; form submit-button path unchanged. ✅
- **D1** bootstrap captures `joinRoutePasswordRequired` + `joinRouteIsOwner` (own signals, separate from in-call isOwner); `continueAsGuest` gates on `shouldPromptGuestPassword({passwordRequired,isOwner,verifiedPassword})` → opens passwordPromptOpen + returns, else prepareLobbyDeviceCheck. Protected-room /join guest is now prompted after entering name; submitRoomPassword proceeds to lobby. Owner/signed-in/open-room paths unchanged. ✅
- **CMP1** device-dialog camera + speaker selects → removed select-level `[value]`, added per-option `[selected]` (camera: `=== selectedVideoId()`, speaker: `=== selectedAudioOutputId()`), speaker "System default" `[selected]="!selectedAudioOutputId()"`. Mirrors the mic fix → no reopen snap-back. Mic select untouched. ✅

## Honesty
UX2 + D1 logic unit-proven via room-decisions.spec. UX1 (guest back-link renders "Back to home"→/) and CMP1 (selects retain device on reopen) are template changes proven by ng build + reasoning; live visual confirmation is a quick JROM/manual check (low-risk template bindings).
