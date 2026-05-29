# Implementation Plan — Fix-loop Run
**Created:** 2026-05-28
**Lifecycle:** pre-live (deferral OFF)
**Pattern:** 2 — codex-in-tmux, session `lkvc-38-audio-fix`, child `lkvc-38-audio-fix-codex`

---

## Batch overview

| Batch | Title | Req | Est | Primary files |
|-------|-------|-----|-----|---------------|
| B1 | Knock banner toast with inline admit/reject | R1, R2, R3, R4 | 25min | `room.page.ts`, `room.page.html`, `room.page.scss` |
| B2 | Trim audio-publish poll + subscribe-stuck warning | R5, R6 | 20min | `room.page.ts`, `sfu-client.service.ts` |
| B3 | Build + deploy DEV + 2-browser validate | ALL | 20min | build + pm2 + playwright smoke |

---

## B1 — Knock banner toast (R1, R2, R3, R4)

**Template addition** (`room.page.html`, inside `<section class="call-panel">` near the other in-call notices block at lines 91–115):

```html
@if (isHost() && knockers().length > 0) {
  <div class="knock-banner" role="alert">
    @for (knocker of knockers(); track knocker.id) {
      <div class="knock-banner-row">
        <span class="knock-name"><strong>{{ knocker.name }}</strong> wants to join</span>
        <div class="knock-banner-actions">
          <button type="button" class="primary-btn" (click)="admit(knocker.id)">Admit</button>
          <button type="button" class="secondary-btn" (click)="reject(knocker.id)">Reject</button>
        </div>
      </div>
    }
  </div>
}
```

- Reactive to `knockers()` signal (already populated by existing `knock` / `knock-cancelled` / `pending-list` handlers — no TS changes needed for the data flow).
- `isHost()` gate satisfies R4.
- Auto-dismisses when knocker is removed (via existing `removeKnocker` from `admit` / `reject` / `knock-cancelled`).

**Style** (`room.page.scss`, append):

```scss
.knock-banner {
  display: flex; flex-direction: column; gap: 8px;
  background: #1a73e8;       /* google meet blue */
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  margin: 8px 12px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  animation: knock-slide-in 200ms ease-out;
}
.knock-banner-row { display: flex; align-items: center; gap: 12px; justify-content: space-between; flex-wrap: wrap; }
.knock-name { font-size: 15px; }
.knock-banner-actions { display: flex; gap: 8px; }
.knock-banner .primary-btn { background: #fff; color: #1a73e8; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; }
.knock-banner .primary-btn:hover { background: #f1f3f4; }
.knock-banner .secondary-btn { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.6); padding: 6px 14px; border-radius: 6px; cursor: pointer; }
.knock-banner .secondary-btn:hover { background: rgba(255,255,255,0.1); }
@keyframes knock-slide-in { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
```

**TS:** No new methods needed. `admit(clientId)` and `reject(clientId)` already exist (room.page.ts:737, plus the `reject` method nearby). Confirm both are non-private; if `reject` is private, expose it (or add a wrapper).

**Gate:** `ng build` 0 errors. DEV: host browser, guest knocks → banner appears with name + buttons.

---

## B2 — Trim audio-publish poll + subscribe-stuck warning (R5, R6)

### Part 1 — Trim poll (room.page.ts:948)

Change `Date.now() + 5000` → `Date.now() + 1500`. One-line edit.

### Part 2 — Subscribe-stuck warning (sfu-client.service.ts)

Add a per-publisher 10s timer when subscribe is initiated; clear when first frame arrives. On expiry, `console.warn` a structured snapshot.

Implementation sketch — add to the `SfuClient` class:

```typescript
private subscribeStuckTimers = new Map<string, ReturnType<typeof setTimeout>>();
private readonly SUBSCRIBE_STUCK_THRESHOLD_MS = 10_000;

private armSubscribeStuckWatchdog(publisherClientId: string): void {
  if (this.subscribeStuckTimers.has(publisherClientId)) return;
  const initiatedAt = this.subscribeInitiatedAt.get(publisherClientId) ?? Date.now();
  const timer = setTimeout(() => {
    if (this.subscribeFirstFrameAt.has(publisherClientId)) return;
    console.warn('[sfu] subscribe stuck >10s — no ontrack from publisher', {
      publisherClientId,
      initiatedAtMs: initiatedAt,
      elapsedMs: Date.now() - initiatedAt,
      subscribedClientIds: [...this.subscribedClientIds],
      pcConnectionState: this.pc?.connectionState ?? null,
      pcIceConnectionState: this.pc?.iceConnectionState ?? null,
      retryAttempts: this.subscribeRetryAttempts.get(publisherClientId) ?? 0,
    });
  }, this.SUBSCRIBE_STUCK_THRESHOLD_MS);
  this.subscribeStuckTimers.set(publisherClientId, timer);
}

private disarmSubscribeStuckWatchdog(publisherClientId: string): void {
  const timer = this.subscribeStuckTimers.get(publisherClientId);
  if (timer) {
    clearTimeout(timer);
    this.subscribeStuckTimers.delete(publisherClientId);
  }
}
```

- **Arm**: call `armSubscribeStuckWatchdog(publisher.clientId)` at the end of `subscribeIfNeeded` (line 100) just before `}`.
- **Disarm**: call `disarmSubscribeStuckWatchdog(entry.publisherClientId)` inside `pc.ontrack` (line 591) when a first frame arrives — guard on `!this.subscribeFirstFrameAt.has(...)` so it only fires for the first track from that publisher.
- **Cleanup**: also disarm in `resetForReconnect` and any place that resets state (look at line 514 area).

**Gate:** `ng build` 0 errors. Manual code review — no behavior change in success path.

---

## B3 — Build + deploy DEV + validate

1. `cd frontend && ng build` — 0 errors required.
2. `cd backend && npm run build` — 0 errors required (sanity).
3. `pm2 restart meet-poc-fe`.
4. Playwright 2-browser smoke spawned by Claude validator:
   - Host browser navigates to `voice.silverjrom.app/room/3f324d8be763`, takes screenshot
   - Guest browser navigates to `voice.silverjrom.app/join/3f324d8be763`, enters name "ValidGuest" + clicks Join
   - Host browser: assert banner with text "ValidGuest wants to join" appears within 5s + Admit button visible
   - Host clicks Admit; assert banner disappears within 3s
   - Both browsers: assert each peer tile transitions from CONNECTING → CONNECTED within 4s of admit (test R5 indirectly)
   - Capture HAR + screenshots to `validation/`

**Gate:** All assertions PASS → mark all 4 reqs VERIFIED.

---

## Dependencies
- B1 and B2 are independent. Can be done in parallel within the same codex session if codex chooses, or sequentially.
- B3 depends on both B1 and B2 completing.

---

## Iteration policy
- If a batch fails validation, send a correction brief to codex (verifier ≠ fixer; do not fix in-place).
- After 3 failed iterations on a single batch, write NEEDS-INFO to OVM `current_task` for JROM to see, and pause.
