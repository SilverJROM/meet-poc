# Batch 6 Scenarios Implemented

| Scenario | Status | Evidence |
|---|---|---|
| S6.1 coturn process running | N/A | coturn deferred per JROM on 2026-05-19 |
| S6.2 frontend ICE_SERVERS includes coturn URL | N/A | coturn deferred per JROM; STUN-only remains |
| S6.3 voice.silverjrom.app serves new app | PASS | `voice-silverjrom-app.spec.ts`, `screenshots/curl-voice-after.txt`, `screenshots/voice-silverjrom-app-new.png` |
| S6.4 end-to-end smoke | PASS (batch-level) | B3, B4, B5 targeted regressions green against live local proxy on port 4700; final full acceptance remains /projcore Phase 2 |
| S6.5 legacy recordings preserved | PASS | count before `6`, immediately after cutover `6`; no cleanup of `recordings/` |
| S6.6 rollback documented | PASS | `ROLLBACK.md`; not dry-run tested because legacy source was deleted per JROM directive |

## Scope Notes

- No coturn install or config was attempted.
- No Cloudflare dashboard or local tunnel config edit was attempted.
- `legacy-poc/` was deleted per JROM's explicit directive.
