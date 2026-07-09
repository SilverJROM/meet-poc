# Co-planner brief — Phase 0.5 RE-PLAN (D28 realignment)

**Role:** co-planner (exactly two of you: opus + codex55). You co-own the plan.
**Run dir:** `/home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09`
**Repo cwd:** `/home/agjrom/websites/meet-poc`
**Branch:** `batch-01-diagnosis-2026-07-08` — **do NOT merge to main**
**Callback file:** `$RUN_DIR/callbacks.md`

Emit lines:
`[projcore callback] coplanner <A|B> STATUS: PROPOSED | WORKING | DONE | BLOCKED — <note>`

Also append the same line to `$RUN_DIR/callbacks.md`.

---

## Your job (re-plan only — do not implement code)

1. Read (in order) if not already loaded:
   - `realignment-from-north.md`
   - `decisions/2026-07-09-codex55-consult-turn-refuted-sender-liveness.md` (D28)
   - `og-requirements.md` (AC4 amended; AC15–AC18 new)
   - `decisions/2026-07-09-north-voids-tgap-3400.md` (D27)
   - `decisions/2026-07-09-harness-team-and-scope.md` (D14–D26)
   - effort `north-star.md` + project `/home/agjrom/websites/meet-poc/north-star.md` §6
   - existing `plan.md` + `queue-batches.md` (B01–B07 banked)

2. Deliberate together (write findings to `$RUN_DIR/decisions/2026-07-09-d28-replanning-notes.md`).

3. **Rewrite** `$RUN_DIR/plan.md` as an ATOMIC vertical-slice plan:
   - Every batch: `<30 min non-test`, ~1–3 tests, tight diff, 95/5
   - **Every row MUST annotate:** `impl_tier: L1|L2|L3`, `validator_tier: L1|L2|L3`, `deliberation: yes|no`, `redteam: yes|no (budget|standard|elite)`
   - Capture-path / mic-energy / AudioParam / gUM / sender recovery → **impl L3, validator L3, deliberation:yes, redteam:standard** (topology default for capture-path)
   - Routine harness / gates → L2 / L2, redteam budget or no
   - **sonnet never validates sonnet** — if impl L3 sonnet, validator must be L3 opus
   - codex55 validator L1/L2 until <1% headroom then sonnet backup (log independence loss)

4. **Do NOT rewrite og-requirements.md** unless a genuine contradiction is found (north owns it; D28 already amended it). Prefer plan-only delta. If you must patch og-requirements, only append a dated note section — never retcon JROM verbatim.

5. Update `$RUN_DIR/queue-batches.md` to match the new plan (banked VERIFIED rows stay VERIFIED).

---

## BANKED — do not redo, do not revert (11 commits)

| batch | commits | status |
|---|---|---|
| B01 | eada423, b0f2bce, 22db4f4 | VERIFIED ledger+guards |
| B02 | 058af0e, 202f156 | VERIFIED arbiter |
| B03 | 27a5ef7 | VERIFIED fixed-clock |
| B04 | 6a16127 | code stands; **T_gap number VOID (D27)** — re-open real measurement post dual-call harness |
| B05 | df13135 | VERIFIED gUM shim |
| B06 | 2850c2a, 45c2d7b | VERIFIED pactl control (AC2 still open) |
| B07 | 3b19bfa | VERIFIED Mode A/B injection contracts (AC4/AC5 still open) |

Burn: **0/25**. ACs closed: **0/18**.

---

## Binding D28 scope (must fold into plan)

1. **TURN hypothesis REFUTED.** One bundled `RTCPeerConnection` carries both directions. Failure is capture/sender/encode/publish — not ICE. Do not sequence "fix TURN first."

2. **AC15 FIRST-CLASS, SEQUENCE EARLY** (T1 discriminator).  
   During far-end-transcribed speech: assert `totalAudioEnergy` + `totalSamplesDuration` advance **AND** `packetsSent` + `bytesSent` advance.  
   Inject independently: (i) capture-dead, (ii) sender-dead-with-capture-alive. Prove harness distinguishes.  
   Place **immediately after banked B07** (or as the first net-new batch). Do not bury after B13.

3. **AC4 AMENDED.** "Detected" no longer closes AC4. Recovery **branches on AC15 diagnosis**:
   - capture-dead → re-acquire mic (current R1)
   - sender-dead → `replaceTrack` / renegotiate / ICE restart  
   Recovery proven by far-end **transcript**. `856104f` may treat the wrong subsystem — plan must allow a fix batch that branches remedies.

4. **AC1/AC2 gain fix:** **absolute target-loudness reference** + smoothing + noise gate/floor + max-gain cap.  
   **NEVER local publisher level. NEVER loudest-remote.**  
   `A` = same-speaker attenuated vs **normal reference at far end** (record normal pass **before** sweep).  
   Pre-fix: expect **A ≈ r** (2-party unity no-op). Boost pre-fix ⇒ REFUTE loudly.  
   **AC17** ≥3-party guard so fix does not regress `A=min(2.5·r,0.88)`. webrtcperf **only** for multi-party/relay/loss — **BANNED as arbiter / capture-path**.

5. **AC16** relay gather + forced `iceTransportPolicy:'relay'` e2e — cheap fragility signal, **not** 07-08 cause. Schedule mid/late; must not displace capture-path.

6. **AC18 LOW** TURN-mint resilience (stub `/api/ice-config`) — loud degrade. Must not displace capture-path. Last-ish before hygiene.

7. **D27 still binding:** real `T_gap` from dual-browser receive-side dropouts only; provisional 500ms wiring; no AC VERIFIED on provisional; B14–B16 re-verify when real T_gap lands.

---

## Suggested sequencing skeleton (you may refine, not ignore AC15-early)

Keep B01–B07 as DONE rows (no rework). Then roughly:

- **B22 / B08a — AC15 sender-liveness harness + dual injection** (EARLY; depends B07) — L3 / L3 / delib yes / redteam standard  
- **B04-real — real dual-browser T_gap** (depends dual-call path ready) — L2  
- **B08 — forced sweep baseline** (headline 2-party no-op; A same-speaker) — L2  
- **B09 — absolute target-loudness gain fix** (NOT local publisher) + AC17 3-party guard — L3  
- **B10 — AudioParam ramp** — L3  
- **B11/B12 — AC1/AC2 gates**  
- **B13 — AC4 Mode A branch-on-diagnosis recovery** (depends AC15) — L3  
- **B14 — AC5 Mode B**  
- **B15/B16 — AC6/AC7** (T_gap gated)  
- **AC16 relay** batch (cheap, non-blocking vs capture)  
- **AC18 TURN resilience** LOW  
- **B17–B21** regression, AC8/AC9, SG, cleanup as before  

Rename/renumber as you see fit; keep IDs stable where banked.

---

## Topology (authoritative — map tiers verbatim)

From `topology.yaml`:
- impl L1 spark↔grokcompose A/B; L2 haiku; L3 sonnet
- val L1/L2 codex55 (backup sonnet); L3 opus
- redteam budget default; standard capture-path; elite only after 2 fails
- planning_criticality: **high** → 2 co-planners only; no full planning panel unless north says so
- child naming: `x-01_<function>_<model>_meet`

---

## Deliverables + done criteria

When you converge:

1. Write final `$RUN_DIR/plan.md` (full table with §4b annotations).
2. Write `$RUN_DIR/queue-batches.md` with banked VERIFIED + new PENDING order.
3. Append brief `$RUN_DIR/decisions/2026-07-09-d28-replanning-notes.md` (key debates + why AC15 early).
4. Callback: `[projcore callback] coplanner <A|B> STATUS: DONE — plan.md + queue-batches.md ready D28`

**Do not implement product code.** Plan only.
**Do not return STATUS: DONE until both files are written and mutually consistent.**

Coord (projcore) will structural-check atomicity/tiers, take custody, rebuild queue/req-matrix if needed, then execute autonomously.
