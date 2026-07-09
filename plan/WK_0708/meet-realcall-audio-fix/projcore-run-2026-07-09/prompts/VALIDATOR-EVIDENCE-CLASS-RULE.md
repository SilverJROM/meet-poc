# VALIDATOR RULE (D27 — effective now, every brief)

An AC that names an evidence class (**live recording**, **transcript**, **live call**) **CANNOT** be closed by any other evidence class.

- A self-declared **scaffold** is an **automatic FAIL**, not an "honest PASS."
- Candour is **not** evidence.
- Stats-only / synthetic scheduler gaps / unit mocks do not satisfy recording/transcript/live-call ACs.
- `T_gap=3400ms` is **VOID**. Use `T_gap_provisional=500ms` only for wiring; **no AC VERIFIED** on provisional.
- Dropout ≠ inter-utterance pause. Dropout = far-end silence **during** scripted speech + missing transcript words.
- Call budget: only browser-open + room-join burns a call.
