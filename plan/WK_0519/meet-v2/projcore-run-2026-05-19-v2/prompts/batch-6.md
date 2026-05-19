# Batch v2-B6 — Frontend: in-call dynamic grid + per-tile overlays + meeting clock

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** v2-B6
**Branch:** `feat/meet-v2-b6-grid-overlays-clock` — off B5 HEAD.

**Requirements assigned:**
- **R6.1** — Dynamic grid: 1=center-capped, 2=split, 3-4=2x2, 5-9=3x3
- **R6.2** — Per-tile overlays: mute icon, camera-off avatar, host badge
- **R6.3** — `media-state` WS broadcast for mic/cam state
- **R6.4** — Meeting elapsed-time clock in topbar
- **R6.5** — `tiles-grid` centered max-width container + responsive fallbacks

Read before coding:
- `og-requirements.md` (R6 section)
- `scenarios.md` (S6.1-S6.6)
- `context-handoff.md` (post-B5 state + B6 spec details)
- `frontend/src/app/pages/room/room.page.{ts,html,scss}` — the target surface (JROM screenshot complaint anchor)
- `frontend/src/app/components/tile/` — per-tile component to extend
- `backend/src/modules/signaling/index.ts` — add `media-state` relay

---

## Expected (acceptance criteria)

This is the batch that closes JROM's "meeting UI is trash" verbatim complaint. Optimize for visual impact AND correctness.

### Step 1 — Backend `media-state` relay

In `signaling/index.ts`, add a new message handler:

```typescript
if (msg.type === 'media-state') {
  if (state !== 'admitted') return;
  const mic = Boolean(msg.mic);
  const cam = Boolean(msg.cam);
  for (const [id, peer] of live.admitted) {
    if (id === clientId) continue;
    send(peer.ws, { type: 'media-state', clientId, mic, cam });
  }
  return;
}
```

No host gating (anyone can broadcast their own state). No DB persistence (transient).

Add a backend test in `signaling-host-actions.test.ts` or new `signaling-media-state.test.ts` verifying the relay: owner + 2 admitted guests; guest1 broadcasts `media-state`; owner + guest2 receive it; guest1 does NOT receive their own broadcast.

### Step 2 — Dynamic grid CSS

Replace the broken `auto-fit minmax(260px, 1fr)` in `room.page.scss`:

```scss
.call-panel {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 16px;
}

.tiles-grid {
  display: grid;
  gap: 12px;
  padding: 16px 0;
  align-items: stretch;

  &[data-count="1"] {
    grid-template-columns: minmax(0, 720px);
    justify-content: center;
  }
  &[data-count="2"] {
    grid-template-columns: 1fr 1fr;
  }
  &[data-count="3"],
  &[data-count="4"] {
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: minmax(0, 1fr);
  }
  &[data-count="5"],
  &[data-count="6"],
  &[data-count="7"],
  &[data-count="8"],
  &[data-count="9"] {
    grid-template-columns: 1fr 1fr 1fr;
    grid-auto-rows: minmax(0, 1fr);
  }
  /* 10+ (won't happen at 8-cap but documented fallback) */
  &[data-count="10"],
  &[data-count="11"],
  &[data-count="12"] {
    grid-template-columns: 1fr 1fr 1fr;
    grid-auto-rows: minmax(0, 1fr);
    overflow-y: auto;
    max-height: calc(100vh - 200px);
  }
}

@media (max-width: 1024px) {
  .tiles-grid {
    &[data-count="3"],
    &[data-count="4"],
    &[data-count="5"],
    &[data-count="6"],
    &[data-count="7"],
    &[data-count="8"],
    &[data-count="9"] {
      grid-template-columns: 1fr 1fr;
    }
  }
}

@media (max-width: 640px) {
  .tiles-grid {
    grid-template-columns: 1fr !important;
  }
}
```

Apply via `<main class="tiles-grid" [attr.data-count]="peers().length">`.

### Step 3 — Per-tile overlays (`<app-tile>`)

Extend the existing tile component:

**Inputs:**
- `peer: PeerState` (already has `id`, `name`, `stream`, `connectionState`, `isLocal`)
- **NEW** signals on peer state (or extend `PeerState` type): `micEnabled: boolean = true`, `camEnabled: boolean = true` (default true so existing PeerState construction doesn't break)
- **NEW** `isHost: boolean = false` (derived in `room.page.ts` from `hostClientId === peer.id`)

**Template additions** (in `tile.component.html`):

```html
<div class="tile-content">
  @if (peer.camEnabled) {
    <video #videoEl autoplay [muted]="peer.isLocal"></video>
  } @else {
    <div class="camera-off-avatar" [style.background]="avatarColor()">
      <span>{{ initial() }}</span>
    </div>
  }

  <div class="tile-overlays">
    @if (peer.isHost) {
      <span class="host-badge">HOST</span>
    }
    @if (!peer.micEnabled) {
      <span class="mute-icon" aria-label="microphone muted">
        <ion-icon name="mic-off"></ion-icon>
      </span>
    }
    <span class="name-label">{{ peer.name }}</span>
  </div>
</div>
```

**Component methods:**
- `initial()`: first letter of `peer.name` uppercased; fallback `?` if empty.
- `avatarColor()`: deterministic HSL from name hash. Example:
  ```typescript
  avatarColor(): string {
    const name = this.peer.name || 'x';
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return `hsl(${h % 360}, 45%, 30%)`;
  }
  ```

**SCSS** (in `tile.component.scss`):
- `.camera-off-avatar`: full-tile flexbox center; circle ~120px with the initial in a large weight font.
- `.host-badge`: small pill, bottom-left, contrast text.
- `.mute-icon`: small icon, bottom-right.
- `.name-label`: existing position (bottom-center or wherever currently rendered).
- All overlays have `position: absolute` inside `.tile-content` which is `position: relative`.

### Step 4 — `media-state` broadcast wiring

**Frontend `MediaService`** — extend:
- Add `micEnabled = signal(true)`, `cameraEnabled = signal(true)` if not already
- When `toggleMic()` flips the local mic track: also call `wsService.send({type:'media-state', mic: micEnabled(), cam: cameraEnabled()})`
- Same for `toggleCamera()` → broadcast new cam state
- The screen-share toggle does NOT trigger `media-state` (separate concern; cam state stays as-is during screen share — its video track is replaced but the "camera enabled" intent is unchanged)

**`room.page.ts`** — subscribe to incoming `media-state` messages:
- When WS message arrives with `{type:'media-state', clientId, mic, cam}`:
  - Update the relevant peer's `micEnabled` + `camEnabled` (mutate the peers signal via `WebrtcService.touchPeer(clientId, {micEnabled, camEnabled})` or add a helper)
- For local peer: `micEnabled` + `camEnabled` derived directly from `MediaService` signals (no round-trip)

**`WebrtcService`** — extend `PeerState`:
- Add `micEnabled: boolean`, `camEnabled: boolean` fields (default true)
- `addPeer()` initializes them to true; subsequent `media-state` updates them via existing `touchPeer()` pattern

### Step 5 — `isHost` derivation

`room.page.ts`:
- Add a `hostClientId = signal<string|null>(null)` set when `admitted` WS message arrives (use the `peers` array passed in admitted — find the one where the email is the room owner; or for guests, the `isOwner` flag tells them whose tile is the host? Actually the `admitted` message gives `peers` w/o flags. Practical approach: server adds `host: bool` to each peer in the `peers` array of admitted/peer-joined broadcasts.) **Suggestion:** simpler — server broadcasts which clientId is host in admitted: `{type:'admitted', clientId, peers, roomTitle, isOwner, hostClientId}`. Backend change is small.

Actually to keep B6 frontend-mostly, alternative: each peer broadcasts their own `media-state` AND a one-time `i-am-host: true` if they own the room. Simpler: extend the existing `admitted` and `peer-joined` to include a `host: bool` flag per peer (backend can derive from `userEmail === room.owner_email`). One backend tweak.

Pick the lighter touch. Document choice in decisions/.

### Step 6 — Meeting clock

In `room.page.ts`:
```typescript
private callStartMs = signal<number | null>(null);
elapsedSec = computed(() => {
  const start = this.callStartMs();
  if (!start) return 0;
  return Math.floor((Date.now() - start) / 1000);  // but this won't auto-update; need an interval
});

// Better: tick signal
private tick = signal(0);
private tickInterval?: ReturnType<typeof setInterval>;

// On state === 'in-call':
this.callStartMs.set(Date.now());
this.tickInterval = setInterval(() => this.tick.update(v => v + 1), 1000);

// On leave / state change:
clearInterval(this.tickInterval);

formattedElapsed = computed(() => {
  this.tick(); // subscribe to tick
  const start = this.callStartMs();
  if (!start) return '0:00';
  const sec = Math.floor((Date.now() - start) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
});
```

Render in `room.page.html` topbar (or controls bar) when in-call:
```html
<span class="meeting-clock" aria-live="off">{{ formattedElapsed() }}</span>
```

### Tests

`e2e/tests/v2-b6-grid/`:
- `grid-1-peer.spec.ts` (S6.1) — owner alone, single tile, measure clientWidth ≤ 720, center
- `grid-2-peer.spec.ts` (S6.2) — two-context, two tiles side-by-side, widths ~ 40-50% each
- `mute-icon.spec.ts` (S6.3) — two-context: guest mutes, owner sees mute icon on guest tile within 2s
- `camera-off-avatar.spec.ts` (S6.4) — two-context: guest camera off, owner sees initials avatar on guest tile
- `host-badge.spec.ts` (S6.5) — two-context: owner sees HOST on own tile, no HOST on guest
- `meeting-clock.spec.ts` (S6.6) — owner enters call, clock = `0:00`, after 2s = `0:02` (±1s)

Two-context tests are costly — keep them tight. Use existing fixtures from B4 (`createRoomViaApi`, `joinOwnerCall`, etc.).

### Build + deploy

```bash
npm run build -w frontend
pm2 restart meet-poc-fe
```

Verify `https://voice.silverjrom.app/room/<id>` lobby + in-call layouts look like Google Meet, not the legacy stretched-letterbox screenshot. Take a manual screenshot of the call view with 1 peer to compare against JROM's original complaint screenshot.

## Required artifacts

`projcore-run-2026-05-19-v2/batch-6/`:
1. `changes.md` — full template + grid CSS approach + media-state protocol summary + clock impl
2. `scenarios-implemented.md` — S6.1-S6.6
3. `test-report.md` — backend regression + B3+B4+B5 regression + B6 targeted
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — **critical for this batch**: 1-peer centered, 2-peer split, 3-peer 2x2, mute icon visible, camera-off avatar, host badge, clock at `0:05`, **JROM-comparison screenshot** showing voice.silverjrom.app's new in-call view (replaces the trash)
7. **Decisions:** `decisions/2026-05-19-v2-b6-<slug>.md` for: host-flag plumbing (extra backend message vs added field on existing), avatar color hash function, clock format edge cases

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** add participant sidebar or kebab actions (B8).
- **DO NOT** add "Host is recording" banner (B7).
- **DO NOT** modify controls-bar visual yet (B7 polishes those).
- **DO NOT** add active-speaker (B8).
- **DO NOT** modify recording or signaling beyond `media-state` + the small host-flag addition.

## Completion protocol

Commit BEFORE STATUS: DONE.

```
STATUS: DONE — v2-B6 grid + per-tile overlays + clock + 6 scenarios green + live verified
```

— /projcore (Claude, Opus, 2026-05-19)
