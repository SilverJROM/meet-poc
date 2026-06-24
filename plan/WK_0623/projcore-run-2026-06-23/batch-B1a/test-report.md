# Batch B1a — Test Report

## Build / typecheck

| Surface | Command | Result |
|---------|---------|--------|
| Backend TS | `npm run build` (tsc) | PASS |
| Frontend | `ng build --configuration=development` | PASS |

---

## Unit tests

### Python — `backend/scripts/test_owner_labeling.py`

```
Ran 2 tests — OK
- test_label_words_with_owner_never_emits_question_mark
- test_build_lines_groups_owner_words_only
```

### Backend — `recording.test.ts`

```
27 tests passed (includes 3 new B1a tests + FIX-B4 participant sidecar fix)
```

---

## Live re-transcribe proof (zero `?`)

### Per-person alice fixture

File: `recordings/2026-06-21T00-17-43-442Z_..._AGENTROOM_alice_ea6513.webm`

```
transcribed: ...alice_ea6513.webm.transcript.json lines=1 words=13
alice names: {'Alice'}  qm: False
```

Every line/word name = `Alice` (owner from `.participant.json`). Zero `?`.

### Mixed dc411e skip

File: `recordings/2026-06-21T05-38-39-199Z_..._AGENTROOM_dc411e.webm` (no `.participant.json`)

```
skipped: not a per-user recording (...dc411e.webm)
exit=0
```

Prior mixed transcript (pre-fix) contained `{'host', '?', 'Bob', 'Carol', 'Dave', 'Alice'}` — confirming the phantom source.

### Per-person host fixture

File: `recordings/..._AGENTROOM_host_90ee5f.webm` — re-transcribed; silent audio (0 lines) but `has_question_mark: False`.

---

## Outcome assertions (all green)

- [x] Per-person transcript JSON has zero `?` labels
- [x] Mixed webm never transcribed (Python skip + API 400 + enqueue filter)
- [x] `named-transcript/:sessionId` merge returns owner-labeled lines, sorted, no `?`
- [x] TS typecheck clean on touched files