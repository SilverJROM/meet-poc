# North binding — INVALID_RELOAD is document-load, not history (2026-07-09)

## Verdict
B08S-2's `navCount` (history.replaceState/pushState) guard is **wrong in both directions**:
- Real reload destroys document → addInitScript re-runs → `__b08s2ReceiveCapture` resets navCount:1 → guard **never** fires on actual reload.
- SPA route changes (Angular Router) **do** fire → false INVALID_RELOAD.

`pcCount>=1` gate (716d6d1) is a **band-aid on a wrong invariant** — remove history monkeypatch entirely.

## THE FIX (binding)
1. **Primary (authoritative, out-of-page, zero app perturbation):** Playwright `page.on('load')` or main-frame `framenavigated`; **>1 document load** between install and stop ⇒ `INVALID_RELOAD`.
2. **Optional in-page corroboration that survives reload:** sessionStorage epoch `__b08s2Doc` increment; n>1 ⇒ multi-load. Do not infer only from pcCount=0.
3. **Remove** `window.history.replaceState/pushState` monkeypatch — harness must never mutate behaviour of system under test.
4. **Unit contract change:** `navCount>1 => INVALID_RELOAD` was a **false invariant** (same shape as T_gap=3400ms). Change the contract, not the truth.
5. Re-gate B08S-2 taxonomy with **codex55**.

## Call-budget clarification (binding)
25 burn **ONLY** on ACCEPTANCE-ATTEMPT calls — 3–5 min conversing AC8-class.
Harness bring-up / smoke / **sub-60s** browser calls **do NOT burn**, but each must be **logged** in ledger with duration + purpose.
Supersedes looser D27 wording ("any browser+join burns").
