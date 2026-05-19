# Batch v2-B7 — Frontend: controls polish + recording banner + device failure UX

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** v2-B7
**Branch:** `feat/meet-v2-b7-controls-banner-failure` — off B6 HEAD.

**Requirements assigned:**
- **R7.1** — Icon-state controls with `aria-pressed`
- **R7.2** — Record button visible only to host (not in DOM for non-hosts)
- **R7.3** — "Host is recording" banner visible to ALL with duration counter
- **R7.4** — Permission denied + no-devices error UI polish
- **R7.5** — Camera-off renders avatar in-call (already mostly closed by B6 overlays; just verify local-self flip)

Read before coding:
- `og-requirements.md` R7
- `scenarios.md` S7.1-S7.5
- `context-handoff.md` (post-B6 state + full B7 spec)
- Existing `<app-controls-bar>` component
- Existing B5 permission-denied placeholder

---

## ⚠️ Hard reminder: COMMIT BEFORE STATUS: DONE

B6 missed this rule for the SECOND time in v2 (after v1-B4). Triple-check before posting your callback:

```bash
git status --short --branch    # must show only the branch line (clean tree)
git log --oneline -5            # must show your B7 commits
```

If you forget, /projcore sends the same correction and we waste 15min on a process gap that's a 30-second discipline check.

---

## Expected (acceptance criteria)

### Step 1 — Icon-state controls in `<app-controls-bar>`

Replace the text-flip buttons. Each control = ONE button with state.

Template pattern:
```html
<button
  type="button"
  class="control-btn"
  [class.is-off]="!micOn()"
  [attr.aria-pressed]="micOn()"
  [attr.aria-label]="micOn() ? 'Mute microphone' : 'Unmute microphone'"
  [title]="micOn() ? 'Mute (Ctrl+D)' : 'Unmute (Ctrl+D)'"
  (click)="onMicToggle()">
  <ion-icon [name]="micOn() ? 'mic' : 'mic-off'"></ion-icon>
</button>
```

Same pattern for camera, screen-share, record (host-only — see Step 2), leave.

SCSS:
- `.control-btn` neutral state: dark bg, white icon
- `.control-btn.is-off`: red bg (#dc2626), white icon
- Hover: lift effect or border-glow
- Focus-visible: keyboard outline ring
- 44-48px minimum size (touch-target prep for Run 3 mobile)

### Step 2 — Record button host-only

In `<app-controls-bar>`:
- New `@Input() isHost = signal(false)` from parent.
- Template: `@if (isHost()) { <button ...record...> }` — conditional so the button is NOT in DOM for non-hosts.
- The leaving guest's controls bar should never have a Record button rendered, ever.

`room.page.ts` provides `isHost` signal from `hostClientId === myClientId`.

### Step 3 — "Host is recording" banner

New component `<app-recording-banner>` at `frontend/src/app/components/recording-banner/`:

Inputs (or owned signals in `room.page.ts` and passed in):
- `isRecording: Signal<boolean>`
- `startedAt: Signal<number|null>` — Date.now() when `recording-started` received

Template:
```html
@if (isRecording()) {
  <div class="recording-banner" role="status" aria-live="polite">
    <span class="dot"></span>
    <span class="label">Host is recording</span>
    <span class="duration">{{ formatted() }}</span>
  </div>
}
```

SCSS: red dot pulsing animation, red-tinted bg, fixed position OR docked above tiles-grid (lean: docked above grid).

`room.page.ts` wiring:
- On `recording-started` WS message: set `isRecording=true`, `recordingStartedAt=Date.now()`, start a tick interval for the duration counter
- On `recording-stopped`: set `isRecording=false`, clear interval
- The host's own click on Record button: also send `{type:'recording-state', state:'started'}` to server, which broadcasts `recording-started` back — host's banner appears via the same broadcast path. No optimistic update needed.

### Step 4 — Device failure UX polish

Expand the existing lobby permission-denied placeholder. Add specific copy + actions per failure type:

```typescript
// In room.page.ts or a new helper
type LobbyError =
  | { kind: 'denied' }
  | { kind: 'no-devices' }
  | { kind: 'video-denied-but-audio-ok' }
  | { kind: 'unknown'; message: string };

permissionError = signal<LobbyError | null>(null);
```

Rendering (in lobby template):
```html
@switch (permissionError()?.kind) {
  @case ('denied') {
    <div class="lobby-error">
      <h3>⚠ Microphone access denied</h3>
      <p>To join this call, allow microphone access for <strong>voice.silverjrom.app</strong> in your browser settings, then click Retry.</p>
      <button (click)="retryPreflight()">Retry</button>
    </div>
  }
  @case ('no-devices') {
    <div class="lobby-error">
      <h3>⚠ No microphone detected</h3>
      <p>Please connect a microphone and refresh the page.</p>
    </div>
  }
  @case ('video-denied-but-audio-ok') {
    <div class="lobby-warning">
      <p>Camera unavailable — joining audio-only. You can enable video later if you change your browser permissions.</p>
    </div>
  }
  @case ('unknown') {
    <div class="lobby-error">
      <h3>⚠ Unable to access media devices</h3>
      <p>{{ permissionError().message }}</p>
      <button (click)="retryPreflight()">Retry</button>
    </div>
  }
}
```

`retryPreflight()` method re-invokes `MediaService.preflight()` and clears `permissionError` on success.

Mid-call device denial (R7.4 stretch): listen for `MediaStreamTrack.onmute` or `onended` on local audio track. If fired mid-call: show a small toast/banner "Microphone disconnected — refresh to rejoin." Non-blocking.

### Step 5 — Local-self camera-off avatar

Verify (don't re-implement — B6 handled this) that when local user toggles camera OFF in-call, their LOCAL tile renders the avatar (not a black video element). The `<app-tile>` already does this for any peer with `camEnabled === false`; the local peer's `camEnabled` signal must flip on toggle.

Add a single test spec to confirm.

### Tests `e2e/tests/v2-b7-controls/`

- `record-button-host-only.spec.ts` (S7.1 host + S7.2) — two-context: host sees Record button via `getByRole`; non-host has 0 such buttons
- `recording-banner.spec.ts` (S7.3) — two-context: host clicks Record, BOTH host's and guest's views show banner with red dot + duration; counter advances after 2s; host clicks Stop, banner gone within 2s
- `permission-denied-polish.spec.ts` (S7.4 denied case) — Playwright with permissions revoked; lobby shows polished error + Retry button
- `no-devices.spec.ts` (S7.4 no-devices case) — `addInitScript` overrides `getUserMedia` to throw `NotFoundError`; verify "No microphone detected" copy, no Retry button
- `controls-aria-pressed.spec.ts` (S7.5) — Mute button has `aria-pressed="true"` after clicking from initial-unmuted state; click again → `aria-pressed="false"`
- `self-camera-off-avatar.spec.ts` (S7.5 / camera-off-in-call) — owner enters call (camera on), clicks Camera button OFF, local tile shows initials avatar

### Build + deploy + parallel-test hygiene

```bash
npm run build -w frontend
pm2 restart meet-poc-fe
```

When running the full regression: codex MAY use `--workers=1` for the cross-batch sweep to avoid the parallel-DB race that B4's ongoing-tab spec hits when run alongside B6 specs. Document choice in test-report.

## Required artifacts

`projcore-run-2026-05-19-v2/batch-7/`:
1. `changes.md`
2. `scenarios-implemented.md` (S7.1-S7.5)
3. `test-report.md` (backend regression + B3-B7 Playwright, prefer `--workers=1` for cross-suite sweep)
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — host controls bar with Record visible; non-host controls bar without Record; recording banner visible during; permission-denied polished; no-devices polished
7. **Decisions:** `decisions/2026-05-19-v2-b7-<slug>.md` for icon choices, exact error copy strings, mid-call denial detection strategy

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** add participant sidebar or host kebab actions (B8).
- **DO NOT** add active-speaker (B8).
- **DO NOT** modify backend.

## Completion protocol

**COMMIT BEFORE STATUS: DONE.** Repeat this rule three times mentally.

```
STATUS: DONE — v2-B7 controls polish + recording banner + device failure UX + 6 scenarios green + live verified
```

— /projcore (Claude, Opus, 2026-05-19)
