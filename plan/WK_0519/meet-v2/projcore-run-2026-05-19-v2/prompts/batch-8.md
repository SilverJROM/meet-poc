# Batch v2-B8 — Frontend: participant sidebar + host actions + leave UX + active-speaker (FINAL BATCH)

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** v2-B8
**Branch:** `feat/meet-v2-b8-sidebar-actions-leave-speaker` — off B7 HEAD.

This is the LAST batch of Run 1. After B8 PASS + Phase 2 acceptance, Run 1 is done.

**Requirements assigned:**
- **R8.1** — Collapsible right-side participant sidebar with In-call + Waiting-to-join
- **R8.2** — Host kebab actions: Mute participant, Remove from meeting
- **R8.3** — Host's own row: kebab disabled / not rendered
- **R8.4** — Leave confirm dialog (host only): End for all / Just leave
- **R8.5** — End-meeting-for-all client-orchestrated flush-recorder-then-broadcast
- **R8.6** — Non-host meeting-ended toast + 5s auto-dismiss + nav
- **R8.7** — Active-speaker highlight via Web Audio RMS at 8Hz

Read before coding:
- `og-requirements.md` R8
- `scenarios.md` S8.1-S8.9
- `context-handoff.md` (post-B7 state + full B8 spec)
- Existing `<app-waiting-room-panel>` (REPLACE with sidebar)
- Existing `recorder.service.ts` (for flush-on-end)

---

## ⚠️ Hard reminder: COMMIT BEFORE STATUS: DONE

B7 honored this rule after I called it out in the B7 brief. Keep that discipline for B8. Triple-check:

```bash
git status --short --branch    # only the branch line, nothing else
git log --oneline -5            # your B8 commits visible
```

---

## Expected (acceptance criteria)

### Step 1 — `<app-participant-sidebar>` component

Replaces `<app-waiting-room-panel>` (which is a floating panel). New sidebar at `frontend/src/app/components/participant-sidebar/`.

Layout:
- Right-side docked panel, ~320px wide, full call-panel height
- Collapsible: toggle button in `<app-controls-bar>` (people icon with badge showing total admitted count)
- When closed: panel hidden (slide-out animation)
- When open: panel slides in, tiles-grid auto-resizes (existing grid handles via CSS)

Sections inside (in order):
1. **"In the call"** — every admitted peer
   - Row: avatar circle (initials, same color hash from B6) + name + mic icon (on/off) + cam icon (on/off) + Host badge if applicable
   - For HOST VIEWER ONLY: kebab (⋮) menu at right edge of each non-self row → opens with "Mute participant" + "Remove from meeting"
   - Host's own row: kebab not rendered (R8.3)
2. **"Waiting to join"** — HOST-ONLY section (hidden for non-hosts) — knockers with inline Admit + Reject buttons

Inputs:
- `peers: Signal<PeerState[]>` (from `room.page.ts`)
- `knockers: Signal<Knocker[]>` (from `room.page.ts`)
- `isHost: Signal<boolean>`
- `myClientId: string`

Outputs:
- `mute(clientId)` → bubble to `room.page.ts` → send `{type:'mute-target', clientId}` (B2 wired this)
- `remove(clientId)` → bubble → send `{type:'remove-peer', clientId}` (B2 wired)
- `admit(clientId)` → existing flow (already wired)
- `reject(clientId)` → existing flow

**Delete the old `<app-waiting-room-panel>` component** after migration. Update `room.page.html` to use the new sidebar instead.

### Step 2 — Mute & Remove host actions (R8.2)

The backend wiring is already done in B2:
- Server handles `{type:'mute-target', clientId}` → sends `{type:'mute-request', from:<host>}` to target peer
- Server handles `{type:'remove-peer', clientId}` → sends `{type:'peer-removed', reason}` to target + closes their WS

Frontend wiring for B8:
- On receiving `{type:'mute-request', from}`: `MediaService.toggleMic()` to ENSURE mic is OFF (idempotent — if already muted, no-op); show toast "Host muted you."
- On receiving `{type:'peer-removed', reason}`: navigate immediately to `/app/rooms` (authed) or `/` with a toast "You were removed by the host." Close WS gracefully.

### Step 3 — Leave confirm dialog (R8.4)

New component `<app-leave-dialog>` at `frontend/src/app/components/leave-dialog/`.

When user clicks Leave button:
- If `isHost()`: render the dialog modal
- If not: skip dialog, execute existing direct-leave flow

Dialog template:
```html
<div class="leave-modal" role="dialog" aria-labelledby="leave-title">
  <h2 id="leave-title">Leave meeting</h2>
  <p>You're the host. What would you like to do?</p>
  <button class="primary danger" (click)="endForAll()" [disabled]="busy()">
    End meeting for everyone
  </button>
  <button class="secondary" (click)="justLeave()" [disabled]="busy()">
    Leave but keep meeting going
  </button>
  <button class="ghost cancel" (click)="cancel()" [disabled]="busy()" aria-label="Cancel">✕</button>
  @if (busy()) { <p class="spinner-line">Finalizing meeting…</p> }
</div>
```

### Step 4 — End-for-all client-orchestrated flush (R8.5) — the critical sequence

This is the **Claude-peer's catch from intake**. Server cannot finalize a browser MediaRecorder; the client must orchestrate.

`endForAll()` method:
```typescript
async endForAll() {
  this.busy.set(true);
  try {
    // Step 1: if recording, stop + upload locally (8s hard timeout)
    if (this.recorder.isRecording()) {
      try {
        const blob = await Promise.race([
          this.recorder.stop(),
          new Promise<Blob | null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);
        if (blob) {
          await Promise.race([
            this.recorder.upload(blob, this.roomId),
            new Promise<void>((resolve) => setTimeout(resolve, 8000)),
          ]);
        }
      } catch (e) {
        console.warn('[end-for-all] recorder flush failed', e);
      }
    }

    // Step 2: send meeting-ended-by-host
    this.ws.send({ type: 'meeting-ended-by-host' });

    // Step 3: wait briefly for server broadcast confirmation
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } finally {
    // Step 4: close + navigate regardless of step 1-3 outcomes
    this.ws.close();
    this.router.navigate(['/app/rooms']);
  }
}
```

`justLeave()` method: existing leave flow (close WS, navigate, don't send meeting-ended-by-host).

Document: if host tab closes during the flush sequence (Step 1), the partial blob may be lost. Accepted per og-requirements R8.5.

### Step 5 — Non-host meeting-ended toast (R8.6)

New component `<app-meeting-ended-toast>` at `frontend/src/app/components/meeting-ended-toast/`.

When `room.page.ts` receives `{type:'meeting-ended', reason}` WS broadcast (B2 wired the server-side):
- Render the toast modal: "The host ended this meeting" + OK button + visible 5-second countdown
- On OK or after 5s timeout: navigate to `/app/rooms` (authed) or `/` (unauthed); close WS

### Step 6 — Active-speaker highlight (R8.7) — explicit 8Hz throttle

New service `frontend/src/app/services/active-speaker.service.ts` OR extend `MediaService`.

For every REMOTE peer's stream (NOT local):
- Create `AnalyserNode` on the audio track of the peer's MediaStream
- `setInterval(125)` (= 8 Hz) computes RMS
- Tracks which peer has the highest RMS above -40 dBFS threshold (codex may tune; log decision)
- That peer's `<app-tile>` gets `.is-speaking` class
- All other tiles: no class
- When all below threshold: no tile gets the class

`__meetDebug.activeSpeakerHz` — expose the actual tick frequency for the S8.9 test to verify the 8 Hz throttle is honored (NOT 60 fps requestAnimationFrame). Implementation: count ticks per second in a rolling window.

Cleanup: on peer-left or call-end, stop the interval + close the analyzer + remove from tracking map.

### Tests `e2e/tests/v2-b8-sidebar/`

Use `--workers=1` for the cross-batch sweep per B6 learning.

- `sidebar-toggle-counts.spec.ts` (S8.1)
- `sidebar-non-host.spec.ts` (S8.2)
- `mute-participant.spec.ts` (S8.3)
- `remove-participant.spec.ts` (S8.4)
- `leave-host-dialog.spec.ts` (S8.5)
- `end-for-all.spec.ts` (S8.6 + S8.7 — combined two-context: host clicks End-for-all → guest receives toast → both navigate)
- `meeting-ended-toast.spec.ts` (S8.8 — explicit toast + auto-dismiss countdown)
- `active-speaker.spec.ts` (S8.9 — `.is-speaking` class + `__meetDebug.activeSpeakerHz` in [6, 10])

### Build + deploy

```bash
npm run build -w frontend
pm2 restart meet-poc-fe
```

Verify live: voice.silverjrom.app shows the new sidebar; host actions work; Leave dialog appears for host; non-host gets meeting-ended toast.

## Required artifacts

`projcore-run-2026-05-19-v2/batch-8/`:
1. `changes.md` — full template + sidebar contents table + end-for-all flow diagram + active-speaker throttle proof
2. `scenarios-implemented.md` — S8.1-S8.9
3. `test-report.md` — backend regression + full B3-B8 Playwright `--workers=1`
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — sidebar open (host view with kebab + waiting-to-join section), sidebar open (non-host, no waiting section), leave-dialog visible, end-for-all spinner state, meeting-ended toast on non-host
7. **Decisions:** `decisions/2026-05-19-v2-b8-<slug>.md` for: active-speaker threshold tune, sidebar collapse animation duration, dialog button order/colors, recording-flush-timeout value (8s)

## Scope (hard limits — final batch)

- **DO** items in Expected.
- **DO NOT** modify backend (all WS messages B8 uses are already wired in B2).
- **DO NOT** touch /app/* tabs or recordings list.
- **DO NOT** make any other UX polish (any "while I'm here" items belong to v2.5 or Run 3).

## Completion protocol

**COMMIT BEFORE STATUS: DONE. Verify clean tree before callback.**

```
STATUS: DONE — v2-B8 sidebar + host actions + leave UX + active-speaker + 9 scenarios green + live verified — Run 1 ready for Phase 2 acceptance
```

— /projcore (Claude, Opus, 2026-05-19)
