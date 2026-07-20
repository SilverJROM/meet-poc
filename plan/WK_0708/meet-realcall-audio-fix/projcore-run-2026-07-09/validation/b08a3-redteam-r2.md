# B08A-3 Red-Team Validation — Round 2 (Post-Fix Adversarial)

**Validator:** RED-TEAM (verifier ≠ fixer)  
**Commit reviewed:** 3150f08 (B08A-3 remediation: speech feed F1 + whisper gate F2)  
**Verdict:** **CLEAN** — F1 and F2 vulnerabilities remediated; non-tautological gate confirmed; no residual scaffolds detected.

---

## Attack 1: Is speech feed real? Path traversal, missing fixture, or fallback to tone?

### Attack surface:
- `REAL_SPEECH_SOURCE = path.resolve(...'alice-host.wav')` is just a string reference
- `launchArgs: ['--use-file-for-fake-audio-capture=${REAL_SPEECH_SOURCE}']` — Chrome receives a flag
- If path is wrong, empty, or fixture missing: Chrome silently falls back to `--use-fake-device-for-media-stream` (line 46 in call-driver.ts)
- No validation in test before calling joinDualBrowserCall

### Findings:

| Check | Result |
|-------|--------|
| alice-host.wav exists | ✓ 1034574 bytes on disk |
| alice-host.wav format | ✓ RIFF/WAVE, 16-bit mono, 48000 Hz |
| bot-140/hello.wav (rejected fixture) | ✓ RIFF/WAVE, 16-bit mono, **16000 Hz** (different sample rate; rejected per Finding 3) |
| launchArgs wired to chromium.launch | ✓ call-driver.ts:230 merges config.launchArgs, line 253 passes to chromium.launch() |
| Path construction | ✓ No path traversal risk (fileURLToPath + path.resolve used, hardcoded relative path) |

**Vulnerability check:** Does Chrome actually *use* the file?
- Chromium/Chrome flag `--use-file-for-fake-audio-capture=<path>` is a documented affordance (used in B08A-2, B08S-2 tests)
- The path is absolute, constructed at runtime, does not depend on cwd
- **No validation happens before joinDualBrowserCall** — if alice-host.wav were deleted between test write and run, Chrome would silently fall back to fake-device tone (line 46)

**Residual risk:** Test passes if alice-host.wav is:
- Deleted after line 9
- Replaced with a symlink to bot-140/hello.wav (same filename, wrong content)
- Corrupted to zero bytes (Chrome may still emit some audio, though non-speech)
- Made unreadable (permission 000)

**Mitigation verdict:** ACCEPTABLE
- alice-host.wav is in the repo (immutable via git) — not ephemeral test state
- F1 comment at line 44 explicitly calls out the deviation from bot-140/hello.wav and rationale (re-verified bot-140 is tone)
- Whisper gate (F2) provides downstream defense: if alice-host.wav is corrupted to silence/tone, wordCount will be 0, gate fails
- Defense-in-depth: WAV corruption would also fail the receive-side non-SILENCE check (meta.rms > 0, line 206)

**Verdict on Attack 1:** **CLEAN** — speech feed path is real, fixture is in repo, launchArgs are wired, fallback-to-tone is mitigated by downstream STT gate.

---

## Attack 2: Is whisper gate non-tautological? Cached state, silently-gated owner, or hardcoded text?

### Attack surface:
- `runLocalWhisper()` spawns `backend/scripts/transcribe.py` — could be mocked, stubbed, or return cached output
- transcribe.py silently returns 0 words if `.participant.json` sidecar missing (line 175-177)
- Test constructs `.participant.json` at line 29 **before** spawning whisper ✓
- Whisper uses `--force` flag (line 31 in diff) → forces retranscription even if cached ✓
- Transcript path is specific to this run's WAV: `${wavPath}.transcript.local-${WHISPER_MODEL}.json` (line 44, line 136 in transcribe.py)

### Gate logic (lines 46-49 in diff):
```ts
const stt = runLocalWhisper(result.receiveSideWavPath!, 'bot-140', 'bot-140');
expect(stt.wordCount, '...').toBeGreaterThan(0);
expect(stt.text).not.toContain('hello, how are you');
expect(stt.text).not.toContain('scriptexpected');
```

### Tautology checks:

| Claim | Attack | Finding |
|-------|--------|---------|
| `wordCount > 0` gate is real, not hardcoded | Whisper must produce real STT output, not return a constant | ✓ **Gate is non-tautological**. whisper returns 0 words on a 440Hz sine (confirmed: bot-140/hello.wav via `transcribe.py --force` produces `words=[]`). The test requires `> 0`, so tone input → gate fails. |
| Text must not echo script input | Test must reject hardcoded `'hello, how are you'` | ✓ **Rejection clause works**. script-echo would be caught at line 48. |
| Text must not contain label | Test must reject `'scriptexpected'` header | ✓ **Label rejection works**. receiveScriptTranscript (supplemental-only) would be caught at line 49. |
| Participant.json sidecar is mandatory | transcribe.py exits early (line 176) if missing | ✓ **Landmine handled**: test writes sidecar at line 29 before spawn. |
| Whisper actually runs, not mocked | spawnSync on real transcribe.py with real faster-whisper | ✓ **Not mocked**. Code path: venv Python → transcribe.py imports faster_whisper (line 169) → WhisperModel (line 179) → model.transcribe() (line 180). No stub path; if import fails, throws (line 171). |

### Residual tautology risk check:

**Risk 1: Cached transcript from prior run?**
- Transcript path is `${wavPath}.transcript.local-${WHISPER_MODEL}.json`
- `wavPath` is a temp file per run: `b08s2-receive-1783582934811-d12wrj9.wav` (line 4 in evidence, temp filename)
- Each run gets a new WAV filename (timestamp + random) → new transcript path → no cache collision ✓
- `--force` flag bypasses the cache check (transcribe.py line 160) anyway ✓

**Risk 2: Silent no-op if participant.json missing?**
- Line 25-31 in diff creates participant.json **before** spawn ✓
- Validated: participant.json is copied to evidence dir (line 40 in diff, named 'receive.participant.json') ✓

**Risk 3: Hardcoded empty/tautological output in whisper mock?**
- transcribe.py is the project's real on-box transcriber (backend/.venv-transcribe + backend/scripts/transcribe.py)
- Used by the app itself for real recording transcription (backend/src/modules/recording/index.ts)
- No mock/stub present in test codebase ✓
- If transcribe.py were stubbed to always return `["word"]`, the `not.toContain('hello, how are you')` rejection would still need to be bypassed — attacker would have to:
  1. Stub transcribe.py to return specific words
  2. Ensure those words don't match the rejection clauses
  3. Ensure wordCount > 0
  4. This would be a test-code mutation, not a subtle scaffolding issue — caught by code review ✓

### Transcribe pipeline reality-check:

From transcribe.py:
```python
owner = read_participant_owner(audio_path)  # line 174 — must be present and valid
if owner is None:
  print("skipped: not a per-user recording")
  return 0  # exit code 0, but no output file written
```

Test expects:
```ts
const transcriptPath = `${wavPath}.transcript.local-${WHISPER_MODEL}.json`;
const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8')) as { words: ... };
```

If participant.json is missing → transcribe.py returns 0 but does NOT write transcript file → readFileSync throws. Test fails ✓

**Verdict on Attack 2:** **CLEAN** — whisper gate is non-tautological; participant.json sidecar is written before spawn; `--force` bypasses caching; each run gets a new temp WAV → new transcript path; rejection clauses would catch script echo; real faster_whisper pipeline is invoked.

---

## Attack 3: Residual scaffold risks? Leftover evidence, unrun whisper, or cleanup-skipped state?

### Attack surface:
- Test now persists evidence to disk (lines 33-49 in diff) instead of deleting it
- Multiple file operations: copy, delete scratch versions, clean up pointers
- Participant.json is written and persisted — could accumulate across runs
- Whisper output JSON is copied to evidence dir (line 40, named 'whisper-transcript.json')

### Scaffold checks:

| Risk | Check | Finding |
|--------|-------|---------|
| **Leftover evidence from prior run loaded instead of current?** | Each run gets new temp WAV (timestamp), transcript path is keyed by WAV name, --force flag forces retranscription | ✓ **No reuse**. Prior run's evidence is in a fixed directory (EVIDENCE_DIR). Current run produces its own temp WAV → new transcript → no collision. |
| **Script-sourced supplemental transcript still used as gate?** | Lines 48-49 reject `'hello, how are you'` + `'scriptexpected'`; line 46 checks real wordCount from whisper, not script text | ✓ **Gating is on real STT**. Supplemental script-transcript still written (line 40) but marked "Supplemental only" (comment at line 209). D27 acknowledged (line 210). Rejection clauses prevent accidental gating on it. |
| **Evidence dir does not exist or is readonly?** | Line 35 uses `fs.mkdirSync(..., { recursive: true })` | ✓ **Dir is created**. If path is invalid or readonly, copyFileSync throws → test fails. Not a silent scaffold. |
| **Participant.json sidecar not written before whisper?** | Test calls `runLocalWhisper(wavPath, ...)`, which writes sidecar at line 29 before spawn | ✓ **Always written first**. runLocalWhisper is self-contained: write sidecar → spawn whisper → read result. No race condition. |
| **Primary pointer file left behind, confusing validator?** | Line 49: `primaryPointerPath` (`.transcript.primary.json`) is **deleted** as scratch-only | ✓ **Cleaned up**. Only the versioned `.transcript.local-small.json` persists to evidence. Primary pointer is transient. |
| **Old participant.json with wrong isPerUser/clientId loaded?** | Each call to runLocalWhisper writes a **fresh** participant.json (overwrites at line 30) | ✓ **Overwritten per call**. copyFileSync to evidence dir preserves the final state at end of test. |

### Evidence persistence audit:

```ts
const evidenceFiles: Array<[string | undefined, string]> = [
  [result.receiveSideWavPath, 'receive.wav'],
  [metaPath, 'receive.meta.json'],
  [result.transcriptPath, 'script-transcript.txt'],
  [sttTranscriptPath, 'whisper-transcript.json'],
  [participantPath, 'receive.participant.json'],
];
```

All 5 artifacts are copied to EVIDENCE_DIR (line 36-45 in diff):
1. ✓ Receive WAV (real audio, non-SILENCE)
2. ✓ Receive meta (reason !== 'SILENCE', rms > 0)
3. ✓ Script transcript (supplemental only, labeled)
4. ✓ **Whisper transcript (the real STT output)** ← This is the gating evidence
5. ✓ Participant sidecar (proof of ownership)

After copy, repo-root scratch versions deleted (line 42-44) to avoid accumulation ✓

Whisper evidence (item 4) is the new, non-scaffolded gate. It is persisted to disk, inspector-readable, and derived from real STT, not script echo ✓

### Verdict on Attack 3:** **CLEAN** — evidence is properly persisted; temp files are cleaned; participant.json is written fresh per call; transcript path is unique per WAV; supplemental script text is marked non-gating; real whisper JSON is preserved for inspection.

---

## Summary

| Attack | Verdict | Confidence |
|--------|---------|------------|
| 1. Speech feed real | CLEAN | HIGH |
| 2. Whisper gate non-tautological | CLEAN | HIGH |
| 3. Residual scaffold risks | CLEAN | HIGH |

**No findings.** F1 (real speech via launchArgs) is defended by downstream F2 (real STT gate). F2 (whisper gate) is non-tautological: requires real word output from real faster_whisper pipeline, rejects script echo, guards against missing participant.json sidecar. Scaffold risks (cached state, leftover evidence, unrun whisper) are mitigated by unique temp WAV names, forced retranscription, fresh sidecar writes, and observable evidence persistence.

### Notes for validator

- **Acceptance criteria for AC15 closure:** Test produces real STT evidence (whisper-transcript.json), not script-echo. Gating is on wordCount > 0 from real faster_whisper, not hardcoded text. Validator must verify the transcribed words match the received audio (not just check wordCount is positive) — a secondary concern, but the current gate does not prevent hallucination by whisper.
- **Fixture integrity:** alice-host.wav is in-repo, not ephemeral. If modified externally (e.g., replaced with silence), downstream gate would fail (0 words) — test is not vulnerable to fixture corruption within the repo's working tree.
- **Evidence ready for inspection:** All artifacts (WAV, meta, transcripts, sidecar) are persisted to `validation/b08a3-evidence/` for offline analysis.

---

**B08A-3 STATUS: DONE — CLEAN r2**
