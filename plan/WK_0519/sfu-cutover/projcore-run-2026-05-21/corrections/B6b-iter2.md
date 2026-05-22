# Correction — B6b iter2 → fix (2nd VALIDATED-FAIL by codex)

Tests PASS (3/3) but codex's source review found a latent CORRECTNESS bug in the empty-mid reconciliation. Fix ONLY these 2 gaps. (This is the 2nd FAIL on B6b — get it right; a 3rd FAIL escalates to JROM.)

## Gap 1 (BUG): mid reconciliation is unsound for DUPLICATE empty mids
- In doSubscribe/doSubscribeTracks (sfu-client.service.ts ~495-527), you seed `midToEntry` and `nextSubscribed` keyed by `rt.mid` (the CF response track mid). **CF returns `mid: ""` for empty for MORE THAN ONE response track in the same subscribe** (e.g. audio + video together). Keying by `""` collides — the last empty-mid entry overwrites the earlier ones. Then the order-based reconciliation (`this.midToEntry.get(rt.mid)` with `rt.mid===""`) attaches the wrong/last stale entry to the first new transceiver, and later empty-mid tracks have no stale entry left → mismatched audio/video mapping or missing entries. This is reachable on EVERY normal subscribe (audio+video), so it's a core-path bug even though the single-track e2e happened to pass.
- FIX (per codex's recommendation): **reconcile by the ordered `responseTracks` / `newTransceivers` arrays directly.** Build each fixed entry from `responseTracks[i]` (for kind/trackName metadata) + the matching new PC transceiver's REAL mid, and set `midToEntry` / `subscribedTracks` ONLY under the real (non-empty) mid. NEVER store an entry under an empty/duplicate mid key. Match response tracks to new transceivers by order (they correspond positionally), not by the empty mid string.

## Gap 2 (TEST): prove the duplicate-empty-mid case
- Add/extend a focused test where AT LEAST TWO subscribe response tracks have `mid: ""` (e.g. a peer's audio + video subscribed together) and assert each maps to its CORRECT real mid + kind (audio→audio entry, video→video entry) — so the duplicate-empty-mid collision cannot regress. A unit-style test of the reconciliation function (if you can factor it out as a pure helper, like the F1/B3 helper pattern) is ideal and fast; otherwise an e2e that subscribes audio+video and asserts both map correctly.

## Preserve (do NOT redo)
- The subscribe-time preferredRid logic (desktop 'h' / mobile 'l'), cameraRidNow/screenshare override, updateCameraLayer PUT, and the iter2 e2e PUT-response 2xx assertion are all CORRECT — codex confirmed. Leave them.

## After fixing
Re-run layer-pref + B4a + B6a regressions + the new duplicate-empty-mid test. Callback FIRST, commit before STATUS: DONE. If the positional response-track↔transceiver matching has a genuine ambiguity you can't resolve safely, STATUS: BLOCKED with specifics rather than guessing.
