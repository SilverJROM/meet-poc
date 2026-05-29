# Batch B2 — 5 generic backgrounds + picker UI (R19)

> **Role for THIS dispatch:** You are the IMPLEMENTER. You are NOT projcore. Claude /projcore is supervising from session `lkvc` and watching this session (`lkvc-codex`) for your STATUS callback. Do NOT invoke the `$projcore` skill, do NOT spawn additional sessions, do NOT modify queue.md / progress.md / req-matrix.md / context-handoff.md / north-star.md / og-requirements.md / callbacks.md. Implement THIS batch's scope and emit `STATUS: DONE — Batch B2 ready for validation` when finished.

## Read first (mandatory)

1. `plan/WK_0526/meet-backgrounds/projcore-run-2026-05-28/context-handoff.md` — what B1 already shipped (DO NOT reimplement).
2. `plan/WK_0526/meet-backgrounds/projcore-run-2026-05-28/og-requirements.md` § R19 — acceptance criteria.

Then you may skim:
- `frontend/src/app/services/background-effects.service.ts` (LOCKED — read-only for B2).
- `frontend/src/app/pages/room/room.page.ts` — find `togglePreviewBlur`, `devModeBgBlur`, the SFU sync effect.
- `frontend/src/app/components/lobby-preview/lobby-preview.component.{html,ts,scss}` — temp B1 toggle lives here.
- `frontend/src/app/pages/room/room.page.html` — find the controls bar area where a wand-icon button goes.

## Plan handshake — NOT required for B2

B2 is a UI batch, smaller surface than B1. Skip the PROPOSED handshake. Go directly to implementation after reading.

## Scope

### R19.1 — Asset sourcing & bundle

Create `frontend/src/assets/backgrounds/` with **5 generic backgrounds**, target ≤500KB each, 1280×720 or 1920×1080 (don't go above 1920w):

1. `city.jpg` — urban skyline / cityscape
2. `library.jpg` — library / bookshelves
3. `beach.jpg` — beach / coastline
4. `mountain.jpg` — mountain landscape
5. `gradient.jpg` — abstract gradient / soft pattern (this one can be a solo gradient — calmer "neutral" choice)

**Sourcing — try in this order, document which path you took in `CREDITS.md`:**

**Option A (preferred):** Curl-able CC0 photos from Pexels or Unsplash that don't require an API key.
   - Pexels free-tier API (if you can get a `PEXELS_API_KEY` from env or via a curl free endpoint) → search → download.
   - Direct Unsplash image URLs you can verify are CC0 (no auth needed for `images.unsplash.com/photo-<id>?w=1280&fm=jpg`).
   - If you find a single curated CC0 source that works, use it for all 5.

**Option B (acceptable fallback):** Procedurally generate via canvas + write JPEG to disk using `node -e` script with `sharp` or `canvas` package. Examples: gradient sweeps, geometric patterns, abstract scenes. Document as "generated, CC0 by author" in CREDITS.

**Option C (last resort):** SVG-based stylized backgrounds (e.g., flat-vector cityscape, stylized waves, etc.). Save as `.svg` instead of `.jpg`. Tiny file size (~5-15KB each). Document in CREDITS as "Generated SVG, CC0".

**DO NOT** commit anything with unclear licensing. CC0 / public-domain only.

After sourcing, create `frontend/src/assets/backgrounds/CREDITS.md`:
```md
# Background assets — credits

| File | Source | Photographer / Author | License | URL |
|------|--------|----------------------|---------|-----|
| city.jpg | <source> | <name or "Generated"> | CC0 | <url or "n/a"> |
| ... | ... | ... | ... | ... |

Method: <A/B/C> — <one-line justification>
```

### R19.2 — Picker component

Create `frontend/src/app/components/background-picker/background-picker.component.{ts,html,scss}`:

```ts
@Component({
  selector: 'app-background-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './background-picker.component.html',
  styleUrl: './background-picker.component.scss',
})
export class BackgroundPickerComponent {
  readonly backgroundEffects = inject(BackgroundEffectsService);
  readonly closeRequested = output<void>();  // emits on Esc / overlay backdrop click in-call usage
  // Internal: predefined asset list, currently-selected id, localStorage persistence.
}
```

Grid of 7 tiles:
- "None" tile — selects mode='none'.
- "Blur" tile — selects mode='blur'.
- 5 image tiles — selects mode='image' + setBackgroundImage(assetPath).

Each tile:
- 96×54 px thumbnail (16:9 ratio).
- Visible selection ring (`outline: 2px solid var(--accent)`) when active.
- Keyboard accessible (`role="radio"` inside `role="radiogroup"`, focus ring, Enter/Space toggles).
- Hover/focus states.

Persistence:
- On select → write `localStorage.setItem('meet-poc:bg:selected', JSON.stringify({ mode, asset?: string }))`.
- On component init → read localStorage → apply via `setMode` + `setBackgroundImage`.

### R19.3 — Lobby integration

Replace the temporary B1 blur toggle in `lobby-preview.component.html` with `<app-background-picker />`. Remove from `room.page.ts`:
- `devModeBgBlur` signal
- `togglePreviewBlur()` method
- The TEMPORARY button HTML in `lobby-preview.component.html`
- The TEMPORARY styles in `lobby-preview.component.scss` (if any)

Keep `effectiveLocalStream`, `replaceEffectiveVideoTrack`, the SFU sync effect, `lastSfuVideoTrack` — those are LOCKED.

### R19.4 — In-call integration

In `room.page.html` controls bar (find existing buttons like camera-toggle, mic-toggle), add a wand/sparkles icon button. Click → opens `<app-background-picker />` as an overlay panel anchored near the button. Close on:
- Esc keypress (host)
- Click outside the panel
- Re-click of the wand button

Reasonable placement: a fixed-position panel at the bottom-right or floating above the controls bar.

### R19.5 — Initial mode applied at join

If user opened the lobby with mode=blur or mode=image (loaded from localStorage), the SFU publish at admit should use the composite stream from the start. Check that B1's wiring already handles this via `effectiveLocalStream()` being read during join (`joinPublishFlow` or wherever the publish happens).

If it doesn't naturally work, the smallest fix is to ensure `replaceEffectiveVideoTrack(media.localStream()?.getVideoTracks()[0])` is called once after `localPublishState().status === 'published'` if mode is non-none. The existing SFU sync effect should handle this; verify don't add redundant calls.

### R19.6 — Manual self-check

1. `cd backend && npm run build` — PASS.
2. `cd frontend && ng build` — PASS.
3. Manual: open dev URL, lobby. Verify picker renders, click each tile, see preview update live.
4. Manual: pick "Library", refresh page → picker should re-select "Library" on load.
5. Manual: join a call, click wand icon → picker opens, change to "Beach", second browser confirms guest sees beach background behind host.
6. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — 16/16 PASS.
7. Screenshot the picker open in lobby: `validation/B2-picker-lobby.png`.
8. Screenshot the picker open in-call: `validation/B2-picker-in-call.png`.

## Hard constraints

- ONLY touch: new `background-picker.component.*` files, `lobby-preview.component.*` (remove temp B1 toggle), `room.page.{ts,html}` (remove temp toggle + add wand button + overlay), `frontend/src/assets/backgrounds/*` (new assets + CREDITS.md). NO other files.
- DO NOT touch `background-effects.service.ts`.
- DO NOT add custom upload (B3 scope) — picker stays at 7 tiles for now.
- DO NOT add mobile-specific behavior (B4 scope).
- DO NOT touch backend.
- DO NOT remove `lastSfuVideoTrack`, `effectiveLocalStream`, or the SFU sync effect.
- Asset file size: each ≤500KB, total bundle increase ≤2.5MB.
- Picker must be keyboard-accessible.

## Acceptance gate

1. Code review by projcore: picker is its own standalone component; lobby & in-call integrate without re-wiring B1; localStorage persistence works on reload; CREDITS.md exists with clear license attribution.
2. Build + existing e2e green.
3. Two screenshots in `validation/`: B2-picker-lobby.png + B2-picker-in-call.png.
4. Write `validation/B2-picker-ui.md`: files touched, asset sourcing path taken (A/B/C + justification), picker component API, integration points, accessibility approach.
5. Commit message: `feat(bg): 5 generic backgrounds + picker UI (R19)`.

## Stop conditions

- If you cannot source 5 CC0-clean assets after trying Option A → B → C, STOP and report — do NOT commit ambiguously-licensed files.
- If the in-call overlay collides with existing controls bar UI in a way that requires touching unrelated components, STOP and report scope.
- If existing 16 e2e tests fail because of picker rendering, fix or STOP — do not commit a regression.

## Self-check before final commit

- [ ] All 5 assets present + ≤500KB each + license clear in CREDITS.md
- [ ] Picker component standalone + keyboard-navigable
- [ ] Lobby temp B1 toggle FULLY removed (devModeBgBlur signal, togglePreviewBlur method, button HTML/SCSS)
- [ ] In-call wand button + overlay works (open/close/Esc/outside-click)
- [ ] localStorage persists selection across reload
- [ ] e2e fixloop-banner 16/16 PASS
- [ ] Two screenshots saved
- [ ] validation/B2-picker-ui.md written

Final line MUST be EXACTLY: `STATUS: DONE — Batch B2 ready for validation`
