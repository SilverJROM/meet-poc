# Batch A — UI polish: diagnostics removal + knock-banner toast + admit-all

Three independent low-risk changes. Ship as ONE commit.

## A1 — Remove diagnostics from in-call controls-bar (host + non-host)

File: `frontend/src/app/components/controls-bar/controls-bar.component.html`

There are two buttons that emit `(diagnostics)` (lines ~104-112 and ~120-128). Remove BOTH from the controls-bar. Also remove the `diagnostics` output declaration in `controls-bar.component.ts` if it becomes unused.

File: `frontend/src/app/pages/room/room.page.html`

Remove the `(diagnostics)="toggleDiagnostics()"` binding on `<app-controls-bar>` (line ~62). Also remove the `<section>` that renders the in-call diagnostics panel (`@if (diagnosticsOpen())` block) if it exists. Search for `diagnosticsOpen` usage and remove all in-call panel UI tied to it.

File: `frontend/src/app/pages/room/room.page.ts`

Remove `diagnosticsOpen` signal, `toggleDiagnostics()` method, and any other in-call diagnostics surface code IF they only feed the removed UI. Keep:
- `flushDiagnosticsLog()` and `queueDiagnosticsLog()` — backend logging stays.
- `meetingSessions.sendDiagnosticsBeacon()` — backend logging stays.
- `__meetDebug` global — keep for browser console debugging.

DO NOT remove the `/app/diagnostics` PAGE (it's `pages/diagnostics/`). That's a separate admin route, unrelated.

## A2 — Knock banner → small top-right toast

File: `frontend/src/app/pages/room/room.page.html`

The current `.knock-banner` (around lines 109-122, inside the call-panel notice stack) is a full-width banner. Move it OUT of the notice stack and render it absolutely-positioned in the top-right corner. Persists until admit/reject (no timeout — already auto-removes via knockers list).

Template change shape (illustrative; adapt to actual file):
```html
@if (isHost() && knockers().length > 0) {
  <div class="knock-toast-stack" role="region" aria-label="Waiting to join">
    @for (knocker of knockers(); track knocker.id) {
      <div class="knock-toast" role="alert">
        <span class="knock-name"><strong>{{ knocker.name }}</strong> wants to join</span>
        <div class="knock-toast-actions">
          <button type="button" class="primary-btn" (click)="admit(knocker.id)" title="Admit">Admit</button>
          <button type="button" class="secondary-btn" (click)="reject(knocker.id)" title="Reject">Reject</button>
        </div>
      </div>
    }
    @if (knockers().length >= 2) {
      <button type="button" class="admit-all-btn" (click)="admitAll()">Admit all ({{ knockers().length }})</button>
    }
  </div>
}
```

File: `frontend/src/app/pages/room/room.page.scss`

Replace/append `.knock-toast-stack` + `.knock-toast` styles:
- `.knock-toast-stack`: `position: fixed; top: 16px; right: 16px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; max-width: 280px;`
- `.knock-toast`: white background, subtle shadow `0 4px 12px rgba(0,0,0,0.15)`, 8px radius, 10px 12px padding, smaller font (~13px). Slide-in-from-right animation 200ms.
- `.knock-toast-actions`: flex row, gap 6px, mt 6px.
- `.knock-toast .primary-btn`: small (28px height), blue background, white text.
- `.knock-toast .secondary-btn`: small, outlined, dark text.
- `.admit-all-btn`: small, full-width within stack, green-ish accent.
- Mobile (<640px): stack stays top-right but max-width 240px, slightly smaller padding.

Keep the OLD `.knock-banner` SCSS rules — they're no longer used after this change. Delete them. Don't keep dead CSS.

## A3 — Admit-all functionality

File: `frontend/src/app/pages/room/room.page.ts`

Add method:
```typescript
admitAll(): void {
  for (const knocker of this.knockers()) {
    this.admit(knocker.id);
  }
}
```

That's it — backend handles each `admit` individually, no new WS message needed.

The "Admit all (N)" button is wired in the toast stack template (per A2).

## A4 — Verify record button is host-only

File: `frontend/src/app/components/controls-bar/controls-bar.component.html` line 66

It already has `@if (isHost())` wrapping the record button. Verify nothing else exposes record action to non-hosts. If verified, no code change. Document in validation note.

## Hard constraints
- ONE commit covering A1+A2+A3+A4.
- DO NOT touch the participant-sidebar's waiting-list section — it stays as the OTHER place to find waiting guests (the toast is the proactive notification; sidebar is the full list).
- DO NOT change any signaling protocol.
- Existing fixloop-banner spec EXPECTS `.knock-banner` and `.knock-banner-row` selectors. Update the spec to use `.knock-toast-stack` / `.knock-toast` selectors. The semantic test (banner appears with name + admit button) stays identical.

## Acceptance gate
1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — ALL PASS (including the banner-toast spec after selector update).
4. Manual visual review: confirm toast is top-right, not full-width.
5. Write `validation/A-ui-polish.md`.
6. Commit: `feat(room): top-right knock toast + admit-all + remove in-call diagnostics buttons`.

Final line MUST be: `STATUS: DONE — Batch A ready for validation`.
