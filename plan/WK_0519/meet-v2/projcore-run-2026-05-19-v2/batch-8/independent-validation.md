# v2-B8 Independent Validation

## Summary

Self-validation complete and ready for `/projcore` independent Phase 2 acceptance.

## Requirement Mapping

| Requirement | Status | Evidence |
|---|---|---|
| R8.1 Collapsible participant sidebar | VERIFIED | S8.1/S8.2; host/non-host screenshots |
| R8.2 Host mute/remove actions | VERIFIED | S8.3/S8.4 |
| R8.3 Host own row has no kebab | VERIFIED | S8.1 host sidebar DOM |
| R8.4 Host leave confirm dialog | VERIFIED | S8.5; screenshot |
| R8.5 End-for-all recording flush | VERIFIED | S8.7 upload file exists before host navigation |
| R8.6 Non-host meeting-ended toast | VERIFIED | S8.7/S8.8 |
| R8.7 Active-speaker 8 Hz highlight | VERIFIED | S8.9; `activeSpeakerHz` in [6,10] |

## Validation Runs

- B8 targeted: 8/8 PASS.
- Backend: 43/43 PASS.
- Root build: PASS.
- B3-B8 sweep: 40/40 PASS with `--workers=1`.
- Live smoke: PASS at `https://voice.silverjrom.app`.

## Readiness

Run 1 is ready for Phase 2 fresh-context final validation after B8 commit and callback.
