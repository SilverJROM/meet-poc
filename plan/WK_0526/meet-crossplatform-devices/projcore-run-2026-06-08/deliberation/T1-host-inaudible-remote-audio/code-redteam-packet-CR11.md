# CODE RED-TEAM — round CR11 — lens L11: security-thread closure verify + whole-diff final correctness sweep
# (Your role = the model you run as.) STREAK 0/3 — fresh lens.
## Context
The clientKey credential thread is now (claimed) fully closed: store-time strip (CR-fix-8) + read-time redaction in parsePayload covering OLD rows (CR-fix-9) + participant_client_key not returned + admission/reconnect preserved (backend 14/14). The audio fix has been stable since CR-fix-6. Verify the security closure is COMPLETE and do a final whole-diff correctness sweep.
## READ the CURRENT files (frontend/src + backend/src/modules/sessions/*) + ../IMPL-prod-diff.patch.
## Your task — lens L11 (evidence file:line)
1. **Security closure COMPLETE?** Is raw clientKey now truly absent from EVERY read surface for BOTH old and new rows: list, detail, download.json, and ANY other path that returns payload (admin? export? logs? error bodies?)? Does the read-time redaction in parsePayload cover ALL callers (every `parsePayload(row.payload_json)` site)? Is there any OTHER secret/token in the payload (e.g. cfSessionId, tokens) that is a credential and still exposed? Admission/reconnect still intact?
2. **Whole-diff final correctness:** a fresh-eyes pass over the COMPLETE diff (audio registry + sink + watchdog + diagnostics + backend redaction). Any remaining bug of ANY class — correctness, race, leak, state, regression, security — that all prior lenses (L1-L10) missed or that the fixes re-introduced?
3. **Requirement closure unchanged:** confirm the core R1/R2/R3 (host hears all remote on selected device, never suppressed, diagnostics localize) still hold after the security changes (the backend redaction must not have altered what the diagnostics CAPTURE for debugging — only what's RETURNED).
## Output `<role>-coderedteam-CR11.md`:
```
# <role> CODE red-team CR11 (lens L11: security closure + final sweep)
## clientKey/credential closure: complete (old+new, all paths)? admission intact? other exposed secret? (file:line)
## Whole-diff final sweep: any remaining bug (any class)? (file:line) or "none"
## R1/R2/R3 still hold after security changes? 
## NEW bugs (table) or "none"
STATUS: CLEAN or STATUS: BUGS — <worst>
```
Honest CLEAN if clean.
