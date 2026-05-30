# B3 — Diagnostics User Preferences — changes.md

> Append-only per batch. B3a (R4) below. B3b will append its own section beneath this — do NOT clobber.

---

## B3a (R4)

### Branch

`feat/meet-diagnostics-audio-20260529` (continued; B3a committed on top of `2c062ff`). No new branch.

### User Report (verbatim)

> "R4 — User-level diagnostics on/off toggle. A visible toggle in Settings (default ON). When OFF, that client stops collecting AND uploading diagnostics. Persisted."

JROM (verbatim):

> "just add an on/off switch to these diagnostics so that when we are at a certain point we can just off these"

### Root Cause (feature — what + where)

This is a feature, not a bug. The localStorage flag `meet-poc.diagnosticsLogging` already gated diagnostics collect + upload at three sites in `room.page.ts` (`startDiagnosticsLogger`, `queueDiagnosticsLog`, `flushDiagnosticsLog`), each early-returning when the `diagnosticsLoggingEnabled` signal is false. But the flag had **no setter and no UI** — there was no way for a user to flip it. The key constant and reader also lived privately inside `room.page.ts`, so a Settings control could not share the contract without duplicating the key literal.

What this batch lands:
1. A **shared prefs module** (`frontend/src/app/services/diagnostics-prefs.ts`) that owns the key literal (single source of truth), the reader (contract preserved verbatim), and a new writer.
2. `room.page.ts` rewired to **consume** the shared reader (its private duplicate const + function deleted — no dead code, deferral OFF).
3. A **labeled toggle in Settings → Account** (default ON, seeded from the reader, persists immediately via the writer on change).
4. A **unit spec** exercising the real exported reader/writer (S-1..S-8 + writer error-safety) via `npx tsx`.

### Code Changes (per file — WHAT + WHY)

**NEW `frontend/src/app/services/diagnostics-prefs.ts`**
- `export const DIAGNOSTICS_LOGGING_STORAGE_KEY = 'meet-poc.diagnosticsLogging'` — single source of truth for the flag key. After this batch the literal exists ONLY here (and a sanity assertion in the spec).
- `export function readDiagnosticsLoggingEnabled(): boolean` — preserves the exact original contract: `window.localStorage.getItem(KEY) !== '0'` in a try/catch that returns `true` on throw. Absent ⇒ `true`; `'0'` ⇒ `false`; any other value ⇒ `true`; localStorage throws ⇒ `true`.
- `export function writeDiagnosticsLoggingEnabled(enabled: boolean): void` — `setItem(KEY, enabled ? '1' : '0')` guarded by try/catch (swallowed, no throw to callers). Round-trips through the reader: `false` ⇒ stores `'0'` (reader false); `true` ⇒ stores `'1'` (reader true). WHY: lets the Settings control persist to the SAME flag the in-call gates read.

**`frontend/src/app/pages/room/room.page.ts`**
- Added `import { readDiagnosticsLoggingEnabled } from '../../services/diagnostics-prefs';`.
- DELETED the private `const DIAGNOSTICS_LOGGING_STORAGE_KEY = 'meet-poc.diagnosticsLogging'` (was line 46).
- DELETED the private `function readDiagnosticsLoggingEnabled()` (was lines 3011–3017). WHY: no dead duplicate — single source of truth now lives in the shared module (deferral OFF, pre-live).
- KEPT `readonly diagnosticsLoggingEnabled = signal(readDiagnosticsLoggingEnabled())` (now seeded from the shared import). The three gate sites (`startDiagnosticsLogger`, `queueDiagnosticsLog`, `flushDiagnosticsLog`) read the signal unchanged. The interface field `diagnosticsLoggingEnabled?: boolean` (~line 3184, a debug-snapshot property — NOT the key literal) is untouched.

**`frontend/src/app/components/account-settings/account-settings.component.ts`** (the Account tab body, `<app-account-settings />`)
- Added `import { readDiagnosticsLoggingEnabled, writeDiagnosticsLoggingEnabled } from '../../services/diagnostics-prefs';`.
- Added `readonly diagnosticsLogging = signal(readDiagnosticsLoggingEnabled())` — initial state seeded from the reader (NOT hardcoded `true`), so the absent-key⇒true contract gives default ON and a persisted `'0'` renders unchecked on load.
- Added `setDiagnosticsLogging(enabled: boolean)` — sets the local signal AND calls `writeDiagnosticsLoggingEnabled(enabled)` so the change persists immediately to the same flag. No network call.

**`frontend/src/app/components/account-settings/account-settings.component.html`**
- Added a "Diagnostics" `account-field` block at the end (after Telegram, behind a divider) with a hint and a `label.toggle-row` containing `<input type="checkbox" name="diagnosticsLogging" [ngModel]="diagnosticsLogging()" (ngModelChange)="setDiagnosticsLogging($event)">` labeled "Diagnostics logging". Reuses the existing `toggle-row` markup pattern; no new top-level Settings tab.

**`frontend/src/app/components/account-settings/account-settings.component.scss`**
- Added a scoped `.toggle-row` rule (flex, gap, accent-color) — the component is view-encapsulated, so it does not inherit the `toggle-row` style defined in other pages; this keeps the checkbox + label rendered cleanly inline.

### Commits

- `[batch-3a] diagnostics user toggle: shared diagnostics-prefs (read+write) wired to Settings toggle + room.page reader | scenarios: S-1..S-16`

### Standing Rules

- The flag key literal `'meet-poc.diagnosticsLogging'` lives ONLY in `diagnostics-prefs.ts` going forward. Any future reader/writer/consumer imports from that module — do not re-introduce inline `localStorage.getItem('meet-poc.diagnosticsLogging')` elsewhere.

### Verification

Lifecycle = **pre-live** (default, project_specs has no post-live flag) ⇒ deferral OFF: dead duplicate const + function removed in the same batch; no TODO/FIXME, no orphan code.

Commands (all from repo root unless noted):

| Check | Command | Result |
|---|---|---|
| New unit spec (S-1..S-8 + writer error-safety) | `cd frontend && npx tsx src/app/services/diagnostics-prefs.spec.ts` | **PASS** — `diagnostics-prefs: all assertions passed`, exit 0 |
| Reference spec sanity (untouched) | `cd frontend && npx tsx src/app/services/mic-energy.spec.ts` | **PASS** — exit 0 |
| Frontend build (NS5) | `cd frontend && npm run build` | **PASS** — exit 0 (only pre-existing unrelated warnings: DatePipe in RoomsPage, stencil glob, mediapipe CommonJS) |
| Backend build (untouched, no breakage) | `cd backend && npm run build` | **PASS** — exit 0 |

Structural grep evidence:

```
# room.page.ts — duplicate removed, key literal centralized, shared import present (S-14)
grep -c "function readDiagnosticsLoggingEnabled" room.page.ts   => 0
grep -c "'meet-poc.diagnosticsLogging'"          room.page.ts   => 0
grep -c "DIAGNOSTICS_LOGGING_STORAGE_KEY"        room.page.ts   => 0
grep -n  "diagnostics-prefs"                     room.page.ts   => import present (line 32)
grep -c  "diagnosticsLoggingEnabled()"           room.page.ts   => 4 (3 gates + debug-snapshot field; all via the signal) (S-15)

# Settings — label, reader-seeded init, writer-on-change (S-9..S-13)
account-settings.component.html : label "Diagnostics logging" + checkbox bound to diagnosticsLogging()
account-settings.component.ts   : diagnosticsLogging = signal(readDiagnosticsLoggingEnabled())  (not hardcoded true)
account-settings.component.ts   : setDiagnosticsLogging() -> writeDiagnosticsLoggingEnabled($event)

# Single source of truth — key literal only in the shared module (+ a spec sanity assertion)
grep -rn "'meet-poc.diagnosticsLogging'" src/app/
  => services/diagnostics-prefs.ts (the export)
  => services/diagnostics-prefs.spec.ts (assert KEY === literal — sanity only, not a second definition)
```

Smoke walk (structural / unit; live network gate is the S-16 manual NS5 note, headless cannot drive a real WebRTC call):
- Fresh state (no key) ⇒ reader returns true ⇒ Settings toggle renders checked (default ON), in-call signal true ⇒ diagnostics flow.
- Toggle OFF in Settings ⇒ `setDiagnosticsLogging(false)` ⇒ writer stores `'0'` ⇒ next `readDiagnosticsLoggingEnabled()` is false. A room page seeding its signal from the reader (on mount) then short-circuits all three gates ⇒ no collect, no upload POSTs.
- Toggle back ON ⇒ writer stores `'1'` ⇒ reader true ⇒ gates resume.

### Caveats

- **S-16 (live call network gate) — manual NS5 only.** Headless cannot fully drive a live two-party WebRTC call to observe `/api/meeting-sessions/:id/diagnostics` POSTs start/stop. The three gate sites short-circuit on the signal (proven by S-15 grep + the round-trip unit proof). Manual localhost steps are recorded in scenarios.md S-16; to be executed at independent validation. PRE-EXISTING constraint, not a regression.
- **Cross-tab/navigation freshness:** the Settings signal and the room signal are each seeded from localStorage at construction. A change made in Settings is picked up by the room page when the room (re)mounts and re-seeds its signal from the reader (Settings and the call are separate routes). If a future flow keeps the in-call page mounted while editing Settings in the same tab, a live re-read would be needed — out of scope for B3a (R4 says "Persisted", which localStorage satisfies). Noted as adjacent, not a defect of this batch.
- **Persistence is per-device (localStorage), by design** — backend persistence / `/api/me` field / admin surface / migrations are explicitly B3b and out of scope here.
- Pre-existing frontend build warnings (DatePipe unused in RoomsPage, stencil empty-glob, mediapipe non-ESM) are unrelated to this change.
