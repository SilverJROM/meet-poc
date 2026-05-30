# validation/batch-3b — projcore gate (R5 global/admin kill-switch)
**Verdict: PASS** · HEAD 2c36c86. B3 (R4+R5) complete.
- Migration 0012_app_settings.sql: idempotent KV (CREATE TABLE IF NOT EXISTS). ✓
- admin/index.ts: GET+PUT /admin/settings/diagnostics under EXISTING `admin` (requireAdmin) middleware, SCOPED to the single diagnostics flag (not a general editor). NS8 honored — reuse, no new boundary. ✓
- app-settings/store.ts: get/set, default TRUE (fail-open). Single DB key source.
- sessions/index.ts POST gate: after admitted check → global OFF ⇒ {ok:true,persisted:false}, NO persistence (authoritative immediate server kill). ✓
- /api/me: diagnosticsGloballyEnabled on BOTH guest + signed-in paths. ✓
- Client: computeEffectiveDiagnosticsEnabled(userToggle, globalEnabled) pure AND-gate wired into ALL 3 timers (start/queue/flush); AuthService signal default true / fail-open ?? true; admin toggle UI with "Master switch…" copy. Precedence = global OFF beats user ON. ✓
- Build ✓ BE+FE green. Tests ✓ I re-ran: backend admin-diagnostics-killswitch + auth-me-logout (12/12); FE diagnostics-prefs (incl B-1 effective-gate truth table) passed.
- Q0: R5 covered (server gate + client stop + admin runtime flip + precedence). Mid-session-flip = backend-gate-authoritative + client stops on next entry (documented, intended). Residual: live two-party flip OFF→ON = manual (NS5).
- R5 → VERIFIED (live @manual).
