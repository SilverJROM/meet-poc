# Independent Validation — B4b (R7: surface remote audio health in diagnostics)

**Validator:** independent fresh-eyes (no plan/scenarios/review consulted)
**Branch:** feat/meet-diagnostics-audio-20260529 @ 6a96b9e (parent c3ad403)
**Verdict: PASS**

---

## Requirement under test (R7)
Surface per-publisher inbound stats (bytesReceived, packetsReceived, concealedSamples) in the
diagnostics UI so a silent remote is visible at a glance (near-zero audio bytes + high concealment
is flagged), not buried in JSON.

## Checks performed (all re-run independently)

### 1. Classifier flags silent by the stated signature — PASS
- Re-ran the unit spec myself: `npx tsx src/app/services/remote-audio-health.spec.ts` →
  `remote-audio-health: all assertions passed`, **exit 0**.
- Independently reasoned the math (`remote-audio-health.ts:37-62`):
  `concealmentRatio = concealed/(concealed+emitted)`, threshold `SILENT_REMOTE_CONCEALMENT_RATIO = 0.5`
  (>= inclusive), floor `SILENT_REMOTE_MIN_EMITTED_SAMPLES = 48000`.
- Ran my own adversarial fixtures beyond the spec:
  - high concealment (0.7, total 100000) ⇒ `silent` ✓
  - healthy (0.0002, total 480001) ⇒ `ok`; zero concealed ⇒ `ok`; exactly-at-floor low-ratio ⇒ `ok` ✓
  - just below floor (47999) ⇒ `unknown` ✓
  - null operands ⇒ `unknown` (no throw); 0+0 ⇒ `unknown` (floor catches div0); `concealmentRatio` returns
    `null` on null/zero-denominator (no NaN) ✓
  - null track ⇒ `unknown` (guard) ✓
- **A healthy remote CANNOT be false-flagged silent** (low ratio always `ok`/`unknown`; below-floor never
  `silent`). **Cannot crash on empty stats** (null/zero guards return `unknown`/`null`).
- One theoretical edge: `undefined` (not `null`) operands fall through to `ratio = NaN < 48000 == false`
  ⇒ would return `'ok'` (not `silent`). This is **UNREACHABLE in production**: `SfuInboundTrackStats`
  (`meeting-sessions.service.ts:272-279`) types all five fields strictly as `number | null` (never
  optional/undefined). Even if it occurred it errs toward `ok`, never a false `silent`. Non-issue for R7.

### 2. View surfaces per-publisher stats + SILENT badge at a glance — PASS
- New "Remote audio health" at-a-glance block in `latest` section (`diagnostics.page.html:98-116`),
  gated on `remoteAudioRows(latest).length`; one row per inbound AUDIO track showing **participant name +
  bytes + packets + concealment% + verdict span**.
- Badge gating (`.html:107-113`): `@if (row.badge)` → badge; `@else if health==='ok'` → "audio ok";
  `@else` → "audio health unknown". `row.badge` is non-empty ONLY when health==='silent'
  (`remoteAudioBadgeLabel` returns `''` for ok/unknown — verified in spec RAH-12). **Badge appears ONLY for
  'silent', never for ok/unknown.** ✓
- Per-entry SFU inbound loop also surfaces it (`.html:159-170`): audio tracks render publisherName + bytes +
  concealmentPctLabel + `[class]=remoteAudioHealthClass`, badge appended only when `remoteAudioBadge(track)`
  non-empty. ✓
- **View does NOT re-implement verdict math:** `grep -nE 'concealedSamples\s*/|>=\s*0\.5|0\.5|48000|SILENT_REMOTE_'`
  in `diagnostics.page.ts` → **no matches**. Component imports the shared classifier
  (`diagnostics.page.ts:23 from '../../services/remote-audio-health'`) and delegates verdict via
  `remoteAudioHealthFor` → `classifyRemoteAudioHealth`. The literal "SILENT REMOTE" text does **not** appear
  in any view file — it originates only in `remoteAudioBadgeLabel`. ✓
- SCSS classes present (`diagnostics.page.scss`): `.audio-recv-ok/-bad/-neutral` (231/236/241), block layout
  `.remote-audio-health`/`.remote-audio-row` + 980px responsive collapse. ✓

### 3. Source-side micSilent only HARDENS, never flips ok→silent — PASS
- `classifyRemoteAudioHealth(track, _sourceMicSilent?)` ignores the second arg entirely for the verdict
  (`remote-audio-health.ts:51`, commented D2); it is consumed only by `remoteAudioBadgeLabel`.
- Spec RAH-8 (re-run, passed): `ok` + `sourceMicSilent===true` STAYS `ok`, label `''`. RAH-7: a verdict
  already `silent` + micSilent ⇒ label hardens to `'SILENT REMOTE · silent at source'` but verdict unchanged.
- `remoteAudioBadgeLabel` (`:64-70`) returns `''` unless `health==='silent'`, so micSilent can never
  manufacture a badge on a non-silent remote. ✓

### 4. Scope: frontend-only, exactly 5 files — PASS
- `git show 6a96b9e --stat` lists exactly:
  diagnostics.page.html, diagnostics.page.scss, diagnostics.page.ts,
  remote-audio-health.spec.ts, remote-audio-health.ts.
- No backend / migration / signaling / SFU / in-call / room.page changes. ✓

### 5. Build green — PASS
- `npm run build` → `Application bundle generation complete`, **exit 0**. Exactly 3 pre-existing warnings
  (RoomsPage unused DatePipe, Stencil empty-glob, MediaPipe non-ESM) — all unrelated to B4b. ✓

## On the headless live-render caveat
The implementer flags RAH-14/RAH-15 (live silent-remote render) as MANUAL-PENDING because fake media always
emits a tone in headless. I agree this is a legitimate user-seat step, not a validation gap: the LOGIC
(pure classifier, re-run + adversarially probed) and the WIRING (view binds the shared classifier, badge
gated on 'silent', stats surfaced per publisher) together prove R7. The badge text is a deterministic
function of a verdict I have independently exercised across the full truth table.

## Conclusion
R7 is satisfied. The classifier flags silent by near-zero-audio + high-concealment, cannot false-flag a
healthy remote, cannot crash on empty stats; the view surfaces bytes/packets/concealment%/badge per
participant at a glance and delegates all verdict math to the shared classifier; micSilent only hardens the
label; scope is frontend-only (5 files); build is green.

**STATUS: PASS**
