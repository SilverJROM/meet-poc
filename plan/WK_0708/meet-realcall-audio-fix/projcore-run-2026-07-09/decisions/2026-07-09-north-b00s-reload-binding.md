# North B00S-RELOAD binding (2026-07-09)

INVALID_RELOAD = real document loads, not history mutations.
- DELETE window.history replaceState/pushState monkeypatch entirely.
- DELETE unit test locking navCount>1 => INVALID_RELOAD (FALSE invariant).
- Primary: count page.on('load') or main-frame framenavigated between install and stop; >1 => INVALID_RELOAD.
- Optional: sessionStorage epoch __b08s2Doc that survives reload.
- Regression BOTH directions: (a) Angular SPA route change does NOT trip (b) page.reload() DOES trip.
- Re-gate B08S-2 taxonomy with codex55.
- AC15 stays SCOPED; B00S rows are structural not ACs.
