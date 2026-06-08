# CODE RED-TEAM — round CR9 — lens L9: payload privacy/security + perf-at-scale + FINAL requirement closure
# (Your role = the model you run as.) STREAK 0/3 — fresh lens (NOT prior lenses).
## READ the CURRENT files + ../IMPL-prod-diff.patch + ../../og-requirements.md (R1/R2/R3) + ../jrom-evidence-addendum.md.
## Your task — lens L9 (evidence file:line)
1. **Diagnostics payload privacy/security.** The uploaded diagnostics now include: selectedAudioOutputId + per-publisher sinkId (device ids), trackId/trackName, the advertised-publisher manifest (clientIds + trackNames), plus pre-existing egress IP / platform / UA. (a) Are device ids / IPs appropriately REDACTED or OWNER-ONLY gated (per the project's owner-only diagnostics rule)? Could a NON-owner participant's payload leak another participant's PII (IP/device)? (b) Is the per-publisher manifest exposing anything sensitive cross-tenant? (c) Payload size bounded under many publishers? Trace the upload path (room.page buildDiagnosticsPayload → meeting-sessions service → server endpoint) + who can READ it.
2. **Performance / scale under many publishers (5-10).** syncPeers diff, registry iteration, playoutDiagnostics, refreshBlockedState, applyOutputDevice (Promise.all over registry), and any `document.querySelectorAll('audio[data-remote-audio]')` on recovery — any O(n^2), repeated full-DOM scans per peer, or per-render thrash that degrades with publisher count? Element/timer growth?
3. **FINAL requirement closure (the point of all this).** Re-read R1/R2/R3 + the JROM evidence (host received clean RTP from 2 US devices but heard NEITHER, no banner, had a non-default speaker selected). Walk the CURRENT code end-to-end for THAT EXACT scenario: does the host now HEAR both, on the selected device, with honest diagnostics? Is there ANY residual path to the ORIGINAL symptom (received-but-silent, no banner)? This is the closure check.
4. Anything prior lenses + coordinator missed.
## Output `<role>-coderedteam-CR9.md`:
```
# <role> CODE red-team CR9 (lens L9: privacy/perf/closure)
## Privacy/security of payload: OK or leak (file:line)
## Perf-at-scale: OK or hotspot (file:line)
## FINAL closure: does the EXACT JROM scenario now resolve to "host hears both on selected device, honest diagnostics"? any residual original-symptom path?
## NEW bugs (table) or "none"
STATUS: CLEAN — private/scales/closed   OR   STATUS: BUGS — <worst>
```
Different lens than CR1-8. Honest CLEAN if clean.
