# Batch B04 — Baseline two-call T_gap derivation
## Proposed Implementation

**STATUS: PROPOSED**

---

## Objective

Derive `T_gap` (maximum acceptable audible gap between speaker turns in 2-party calls) from two baseline instrumented 3–5 minute .140 <-> .123 calls, establishing the silence threshold that later batches (B14, B15, B16) use to distinguish natural pauses from capture failures.

---

## Approach

### 1. **Environment Setup (5 min)**
- Wake dev_machine 192.168.254.123 if offline: `python3 /home/agjrom/websites/local_dev/wake-123.py`
- Verify .140 and .123 are reachable (ping, browser access to app)
- Confirm B03 scheduler + B02 arbiter are instrumented and ready
- If machines unavailable → fallback scaffold (see below)

### 2. **Run Baseline Call 1 (5-7 min call + 2 min analysis)**
- Launch .140 (harness endpoint A) with fixed-clock scheduler (B03), no attenuated stimuli yet
- Launch .123 (harness endpoint B) with matching scheduler
- Both bots use local llama/whisper/piper with pre-generated speech assets (from B03)
- Record both receive-side audio via B02 arbiter (LoudnessAnalyzer + RecordingArbiter)
- Let call run 3–5 minutes of natural bidirectional conversation
- Call completes or harness detects termination; burn 1/25 from ledger
- Save recording paths (call-1-recv-140.wav, call-1-recv-123.wav)

### 3. **Run Baseline Call 2 (5-7 min call + 2 min analysis)**
- Repeat with fresh session/room IDs
- Same parameters, different random seed for bot utterance timing
- Burn 1/25 from ledger (2/25 total)
- Save recording paths (call-2-recv-140.wav, call-2-recv-123.wav)

### 4. **Extract Gaps from Recordings and Transcripts (10 min)**
For each of the 4 receive-side recordings:
- **Transcript-driven silence windows:** Use B02 arbiter transcript extraction + timestamp alignment
  - Parse transcript utterance start/end times (whisper alignment)
  - Identify silence intervals between consecutive speaker turns (both local-to-remote and remote-to-local)
- **Confirm with audio analysis:** Use RMS/LUFS thresholds from B02 to mark low-energy segments
  - Voiced segments (RMS > silence-floor); non-voiced intervals are candidate gaps
  - Cross-check transcript silence windows with actual audio silence to avoid over-counting pauses

### 5. **Compute T_gap Distribution (10 min)**
- Collect all silence durations from both calls (both endpoints)
- Build gap histogram (bin by 100ms intervals, e.g., 0–0.1s, 0.1–0.2s, ..., 1.0–1.5s, >1.5s)
- Identify natural pause patterns:
  - **Expected natural gaps:** ~200–800ms for human-like turn-taking (captured in ~1–2 transcripts' normal pauses)
  - **Outliers:** gaps >1.5s suggest a network/processing hiccup or legitimate hesitation
- **Derive T_gap:** Use 95th percentile of observed natural gap durations
  - Conservative: if observed max natural gap is ~1.2s, set T_gap = 1.5s (add 25% safety margin)
  - Rationale: gaps ≥T_gap in later batches (B14/B15) are treated as failures; T_gap must not falsely flag natural conversation

### 6. **Write decisions/T_gap.md**
- **T_gap value:** Stated in seconds (e.g., "T_gap = 1.5s")
- **Histogram:** Raw data (bins + counts) + 50th/95th/99th percentile values
- **Source recordings:** Paths to both .140 and .123 receive-side recordings and transcripts
- **Rationale:** Why this T_gap; what natural patterns were observed; margin applied
- **Call burn count:** Exactly 2/25
- **Mechanism note:** "Derived from receive-side recording RMS/LUFS silence windows and transcript turn-taking analysis. Natural gaps in 2-party conversation establish baseline; T_gap set to protect against false failure detection in recovery batches (B14–B16)."

---

## Acceptance Criteria (from brief)

- ✅ Decision file `decisions/T_gap.md` exists
- ✅ Records T_gap value (in seconds)
- ✅ Includes histogram and source recording/transcript paths
- ✅ Call burn count logged as 2/25
- ✅ Rationale present (recording/transcript drives value, not stats alone)

---

## Fallback: Dry-Run Scaffold (if machines unavailable)

If .140 or .123 is unreachable:
1. **Propose minimal scaffold:**
   - Use B03 scheduler in **memory-only mode** (no actual browser calls)
   - Inject pre-recorded baseline audio segments (silence gaps from prior successful production calls, if available)
   - Measure gaps from synthetic transcript alignment
   - Derive T_gap from mock gap distribution

2. **Honest scope statement:**
   - "T_gap derived from harness-simulated gaps (not live call); live baseline calls required in production"
   - Mark decision file with `SIMULATED: yes`; note what requires live validation later

3. **What must be redone live:**
   - Two real .140 <-> .123 baseline calls before B08 (sweep) gates on T_gap
   - Confirm simulated T_gap matches live call gaps within ±10%

---

## Dependencies

- **B03:** Fixed-clock scheduler (✅ verified in progress.md)
- **B02:** Recording/transcript arbiter (✅ verified in progress.md)
- **B01:** Call ledger + cleanup guards (✅ verified in progress.md)

---

## Effort Estimate

- Environment setup + 2 calls: 15 min
- Gap extraction + histogram: 10 min
- Decision file write: 5 min
- **Total: ~30 min**

---

## Notes for Validator/Redteam

- **Validator L2 (codex55):** Verify T_gap is defensible (histogram makes sense; rationale is sound; margin is appropriate)
- **Redteam budget (haiku):** Spot-check histogram bins; confirm recording paths are real and cleanup-guarded
- **Mechanism:** Transcript turn-taking is authoritative; RMS/LUFS corroborates but does not override
