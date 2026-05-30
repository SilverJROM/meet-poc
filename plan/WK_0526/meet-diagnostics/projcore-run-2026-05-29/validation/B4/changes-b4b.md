# Batch Changes — B4b (R7: surface per-remote inbound AUDIO health + flag silent remote)

## Branch
`feat/meet-diagnostics-audio-20260529` (cut from base@c3ad403). New commit on top: `6a96b9e`. No new branch, no merge.

## User Report (verbatim — og-requirements R7)
"R7 — Surface remote audio health in the diagnostics view. The existing per-publisher inbound stats (bytesReceived, packetsReceived, concealedSamples) are surfaced in the diagnostics UI so a silent remote is visible at a glance (a peer with near-zero audio bytes + high concealment is flagged), not buried in JSON."

## Root Cause (feature — 1-line what+where)
The diagnostics view rendered SFU inbound tracks via `sfuInboundSummary` (`diagnostics.page.ts:293-301`, `.html:138-143`) showing frames/pkts/lost/jb but NOT `bytesReceived` and NO silence verdict, so a silent remote (the one-way-audio bug) was invisible unless you read the raw JSON. Fix: add a pure classifier `classifyRemoteAudioHealth` driven solely by concealment ratio, wire it into the diagnostics component, and render an at-a-glance per-publisher audio-health block + a `SILENT REMOTE` flag.

## Code Changes (per file: WHAT + WHY, named fn/binding)

### NEW `frontend/src/app/services/remote-audio-health.ts` (pure, framework-free)
- `type RemoteAudioHealth = 'ok' | 'silent' | 'unknown'`.
- `const SILENT_REMOTE_CONCEALMENT_RATIO = 0.5` and `const SILENT_REMOTE_MIN_EMITTED_SAMPLES = 48000` — single source of truth for the threshold and the emitted-samples floor (~1s @48kHz). No magic numbers anywhere else.
- `interface RemoteAudioInboundStats { kind; bytesReceived; packetsReceived; jitterBufferEmittedCount; concealedSamples }` — minimal structural input so the module imports no Angular type. `SfuInboundTrackStats` (`meeting-sessions.service.ts:267-280`) is structurally assignable to it (verified: all five fields present with identical nullability), confirmed by the component compiling against it.
- `concealmentRatio(track)` — `concealedSamples / (concealedSamples + jitterBufferEmittedCount)`; returns `null` when either operand is null OR the denominator is 0 (no divide-by-zero, no NaN).
- `classifyRemoteAudioHealth(track, _sourceMicSilent?)` — kind!=='audio' or either operand null ⇒ `'unknown'`; `emittedTotal = concealed + emitted`; `emittedTotal < FLOOR` ⇒ `'unknown'` (this also covers the 0+0 div0 case); else `ratio >= 0.5 ⇒ 'silent'`, else `'ok'`. **D2: `_sourceMicSilent` NEVER changes the verdict** (1-line comment states this; it is accepted only for signature compatibility and consumed by the label helper).
- `remoteAudioBadgeLabel(health, sourceMicSilent?)` — `'SILENT REMOTE · silent at source'` when `health==='silent' && sourceMicSilent===true`; `'SILENT REMOTE'` when `health==='silent'`; `''` otherwise (no badge for ok/unknown).
- **D1 honored:** bytes/packets are display-only; `concealmentRatio` is the sole programmatic verdict driver.

### NEW `frontend/src/app/services/remote-audio-health.spec.ts` (tsx + node:assert/strict)
Mirrors `mic-energy.spec.ts` conventions (ESM `.js` import extension, `import assert from 'node:assert/strict'`, IIFE-style `{}` blocks, trailing `console.log`). Covers RAH-1..RAH-9 fixtures + the RAH-12 label-mapper assertions + constant sanity. Final line: `console.log('remote-audio-health: all assertions passed')`.

### EDIT `frontend/src/app/pages/diagnostics/diagnostics.page.ts`
- Imports `classifyRemoteAudioHealth`, `concealmentRatio`, `remoteAudioBadgeLabel`, `RemoteAudioHealth` from `'../../services/remote-audio-health'`.
- `publisherNameMap()` / `publisherMicSilentMap()` (private) — scan `detail()?.entries` building `clientId→clientName` and `clientId→micSilent` (R6 attribution link via `payload.clientId/clientName/micSilent`).
- `publisherName(id)` → mapped name, fallback `id.slice(0,8)`. `sourceMicSilentFor(id): boolean | null`.
- `remoteAudioHealthFor(track)` wraps `classifyRemoteAudioHealth(track, sourceMicSilentFor(track.publisherClientId))`.
- `remoteAudioHealthClass(track)` → `silent⇒'audio-recv-bad'`, `ok⇒'audio-recv-ok'`, `unknown⇒'audio-recv-neutral'` (reuses the two existing classes; one new neutral).
- `remoteAudioBadge(track)` → label helper result (empty string for ok/unknown ⇒ no badge).
- `concealmentPctLabel(track)` → `'concealment n/a'` when ratio null, else `'NN.N% concealed'` (D1 corroboration display).
- `remoteAudioRows(entry)` → maps `entry.payload.sfuDiagnostics?.inboundTracks` filtered to `kind==='audio'` into `{name,bytes,packets,concealment,health,class,badge}` for the at-a-glance block.

### EDIT `frontend/src/app/pages/diagnostics/diagnostics.page.html`
- New "Remote audio health" at-a-glance block inside the `latest` section (sibling after `.latest-grid`), gated on `remoteAudioRows(latest).length`; per row shows participant name + bytes + packets + concealment% + a verdict span. Badge text appears ONLY when `row.badge` is non-empty (i.e. verdict `'silent'`); `'ok'` shows neutral "audio ok", `'unknown'` shows "audio health unknown" — NO `SILENT REMOTE` text on those branches.
- Per-entry SFU inbound loop (`~138-149`): for `track.kind === 'audio'` renders publisher name + `bytesReceived` + `concealmentPctLabel` with `[class]="remoteAudioHealthClass(track)"` and the badge appended only when present; non-audio tracks keep the unchanged `sfuInboundSummary(track)`.

### EDIT `frontend/src/app/pages/diagnostics/diagnostics.page.scss`
- Added `.audio-recv-neutral` to the shared badge-shape selector group (`:192` area, inherits `display:inline-block`/`border-radius`/`padding`/`font-weight`) + ONE new `.audio-recv-neutral` rule mirroring `.mic-live-neutral` (muted bg/color). `audio-recv-ok`/`audio-recv-bad` rules unchanged (reused). SILENT badge reuses `.audio-recv-bad`.
- Added additive layout for `.remote-audio-health` / `.remote-audio-row` blocks + a 980px responsive collapse (`.remote-audio-row` added to the existing single-column media block). No other style churn.

## Commits
`6a96b9e [batch-4b] surface per-publisher remote audio health + SILENT REMOTE flag (R7) | scenarios: RAH-1..RAH-15`

## Standing Rules
None — no new cross-cutting pattern emerged (followed the existing `*-energy.ts` pure-helper + `*RecvClass` view-mapper precedents).

## Verification
- **Unit spec (PRIMARY proof, RAH-1..RAH-9 + RAH-12 mapper + constants):**
  `cd frontend && npx tsx src/app/services/remote-audio-health.spec.ts` → `remote-audio-health: all assertions passed`, exit `0`.
- **Type-check / build:** `cd frontend && npm run build` (`ng build`) → `Application bundle generation complete`, exit `0`. The 3 warnings (RoomsPage unused DatePipe, Stencil empty-glob, MediaPipe non-ESM) are PRE-EXISTING and unrelated to B4b.
- **RAH-10 structural anti-assertion:** `grep -n "concealedSamples /" diagnostics.page.ts` → no match (no hand-rolled verdict math in the component; verdict comes only from the shared classifier).
- **Scope:** `git show --stat HEAD` → exactly the 5 frontend paths. No backend/migration/signaling/B2/B3/B6/SFU/room.page files touched. The pre-existing `M` on `plan/.../2026-05-29-one-way-audio-and-diagnostics.md` was present at run start and was deliberately NOT staged.
- **Smoke:** localhost only (no deploy). Build artifact generated.

## Bug Reproductions
N/A — feature (view-layer surfacing), not a bug fix.

## Caveats
- **RAH-14 (render-smoke) / RAH-15 (real silent remote) — NOT run headless (NS5, MANUAL-PENDING).** A genuinely silent remote with sustained high concealment above the 48000-sample floor cannot be forced with fake-media headless, so the rendered "SILENT REMOTE" badge is proven by the pure classifier unit (binding) + the committed-source structural wiring, NOT by a live observation. JROM to confirm at the USER seat on `http://localhost:4700` with two real participants (one muted-at-source/dead-mic). PRE-EXISTING constraint of the diagnostics surface, not a regression.
- The at-a-glance block reads the LATEST entry's `inboundTracks`; if the latest sample has no SFU audio inbound tracks the block does not render (intended — matches the `@if` guard pattern already used for the SFU section).
- `publisherName` resolution depends on B4a/R6 attribution (`payload.clientId/clientName`) being populated for the publisher; when no name match exists it falls back to the truncated clientId (no blank label). This attribution path is owned by B4a and is out of B4b scope.
