# B08A-3 Independent Validation — Round 2 (re-gate after F1+F2 remediation)

**Validator:** L3 (opus), independent. Verifier ≠ fixer — no product, harness, or test code was modified.
**Commit under gate:** `3150f08` (= HEAD). Prior gate: `1733b61` → **FAIL** (`validation/b08a3-validation.md`).
**Spine:** `716d6d1` — endorsed in r1, **re-confirmed untouched and green** here.
**Impl:** sonnet. **Red-team r2:** CLEAN (I agree with its conclusion; I close its one open question below).

# Verdict: **PASS**

Both blocking gaps from r1 are closed with real evidence, not relabelling. The AC15 **live clause** is
**VERIFIED**. AC15 *as a whole* is not yet closable — its **injection clause** remains deferred (§Scope).

`3150f08` touches exactly one file (`e2e/harness/__tests__/b08a3-live-sender-liveness.browser.test.ts`,
+120/-18). No product code, no spine code. Confirmed by `git show --stat`.

---

## Q0 — AC15 live clause → covering assertions

AC15 (`og-requirements.md`), live clause, verbatim:

> **During speech that the far end verifiably transcribes**, assert that **both** advance:
> `totalAudioEnergy` + `totalSamplesDuration` (capture side) **and** `packetsSent` + `bytesSent` (sender side).

| # | AC15 conjunct | Covering assertion | r1 | r2 |
|---|---|---|---|---|
| 1 | four counters strictly advance | `toBeGreaterThan(values[0])` ×4 + real `classifySenderLiveness(window) === 'both-advancing'` (real B08A-1 reader, real B08A-2 classifier, real `sfuGetStats()`, no stubs) | COVERED | **COVERED** |
| 2 | …during **speech** | `launchArgs: ['--use-file-for-fake-audio-capture=<abs>/e2e/fixtures/audio/speech/alice-host.wav']` — real human speech, independently verified (§F1) | GAP | **COVERED** |
| 3 | …that the far end **verifiably transcribes** | `runLocalWhisper(result.receiveSideWavPath)` → `expect(stt.wordCount).toBeGreaterThan(0)` on real on-box faster-whisper output, plus echo-rejection clauses (§F2) | GAP | **COVERED** |

All three conjuncts covered, **and covered simultaneously on the same participant** — the decisive point
r1 was missing. See §Coupling.

---

## F1 — CLOSED. The call now carries real speech, and the sendback's own fixture pointer was wrong.

`b08a3-live-sender-liveness.browser.test.ts:159` now passes
`--use-file-for-fake-audio-capture=${REAL_SPEECH_SOURCE}` into `joinDualBrowserCall`, which
`call-driver.ts:230` merges into `DEFAULT_LAUNCH_ARGS` and `:253` hands to `chromium.launch()`. Page1
(`bot-140`) — the sampled sender — emits that file instead of Chrome's fake-device beep.

**The implementer deviated from my r1 remediation text, and was right to.** I wrote "pass
`bot-140/hello.wav`, exactly as B08A-2/B08S-2 do." That fixture is a **440 Hz sine tone**, not speech.
I verified this myself rather than take it on report:

```
$ transcribe.py e2e/fixtures/bot-speech/bot-140/hello.wav --model small --provider local --force
transcribed: lines=0 words=0
```

`decisions/b07-findings.md` Finding 3 documents it independently ("the bot-speech fixtures are synthetic
tones, not real speech"). Had the impl followed my pointer literally, F2 would have been **unsatisfiable by
construction** — I would have re-failed the batch for a defect I introduced. The impl caught it, measured
it, substituted an in-repo real-speech fixture, and logged the deviation in the commit body and the test
header. That is exactly the behaviour the sendback protocol is supposed to produce. **Correcting the r1
record: the F1 remediation pointer was mine and it was defective.**

**`alice-host.wav` independently verified as real speech** (not taken from the impl's claim):

| Property | Measured |
|---|---|
| Format | RIFF/WAVE, mono, 48 000 Hz, 16-bit, 10.78 s |
| Ground-truth STT (`--model small --force`) | **26 words**, 1 line |
| Text | *"Hi everyone, this is Alice speaking from the host side. I am testing the meeting transcription with my actual voice so each speaker is named correctly."* |

Conjunct 2 is met: during the sampling window, the sampled sender's mic is playing real human speech.

## F2 — CLOSED. The gate is real STT over the far-end WAV, and it is content-coupled.

The tautological `toContain('scriptExpected')` closure is gone as a **gate**.
`b08a3-live-sender-liveness.browser.test.ts:226-231` now gates on:

```ts
const stt = runLocalWhisper(result.receiveSideWavPath!, 'bot-140', 'bot-140');
expect(stt.wordCount, 'whisper produced zero words — audio was not verifiably speech').toBeGreaterThan(0);
expect(stt.text).not.toContain('hello, how are you');   // reject script echo
expect(stt.text).not.toContain('scriptexpected');       // reject label echo
```

`runLocalWhisper` (`:88-110`) spawns the project's **own** on-box transcriber
(`backend/.venv-transcribe/bin/python backend/scripts/transcribe.py … --provider local --force`) — the
same stack `backend/src/modules/recording/index.ts` uses for real recordings. `--force` defeats the
`transcript_path.exists()` cache (`transcribe.py:160`). The `.participant.json` sidecar landmine
(`transcribe.py:174-177` — `read_participant_owner()` returns `None` → silent 0-word no-op, exit 0) is
handled by writing the sidecar before the spawn. Not mocked: `transcribe.py:185` calls real
`faster_whisper` with `vad_filter=True`.

**Non-tautology — proven by negative control, not by argument.** A gate is non-tautological iff it *can*
fail. I ran the tone fixture through the identical command:

| Input WAV | Real-STT word count | Gate `wordCount > 0` |
|---|---|---|
| `bot-140/hello.wav` (440 Hz tone) | **0** | **FAILS** ✅ |
| `alice-host.wav` (real speech) | 26 | passes |
| `b08a3-evidence/receive.wav` (far-end capture) | 4 | passes |

`vad_filter=True` discards non-speech, so a beep — exactly what r1's call carried — now hard-fails the
gate. Swap the audio back to a tone and this test goes red. That is the property r1 said was missing.

**Content coupling — the hallucination hole the red-team left open, now closed.** Red-team r2's one
reservation was: *"the current gate does not prevent hallucination by whisper"* (`b08a3-redteam-r2.md`,
Notes for validator). It deferred that to me. I resolved it empirically. The far-end transcript is not
merely non-empty — **it is a verbatim, contiguous, in-order fragment of the exact speech the sender fed**:

| Run | Far-end whisper output | Contiguous substring of `alice-host.wav` ground truth? |
|---|---|---|
| Impl's run (`3150f08` evidence, `receive.wav` 1.37 s) | `"Voice so each speaker"` | ✅ (*"…with my actual **voice so each speaker** is named correctly"*) |
| **My independent live run** (fresh call, fresh WAV) | `"My actual voice."` | ✅ (*"…with **my actual voice** so each speaker…"*) |

Two independent calls produced **two different fragments**, each a verbatim substring of the source. A
hallucinating STT, a hardcoded constant, or an echo of test input could not do that — the output tracks
the *phase of the audio actually received*. I also re-transcribed the committed `receive.wav` myself and
reproduced `"Voice so each speaker"` byte-identically, confirming the checked-in evidence is genuine and
deterministic, not fabricated.

Conjunct 3 is met, in the evidence class AC15 names (transcript). **D27 is satisfied**: an AC naming
transcript is closed by a real transcript. No carve-out was invoked; the brief's unauthorized binding #5
("scriptExpected labeled OK if STT not wired") is now moot — STT is wired.

## Coupling — the two conjuncts hold *simultaneously*, on the *same* participant

This is what makes it AC15 rather than two adjacent facts, and it is worth stating explicitly:

- **Same participant.** `onLive` samples `page1.evaluate(… sfuGetStats())` — page1 is `bot-140`, the
  sender. `receiverPageIndex: 1` records **page2**, whose only remote track is page1's. So the counters
  and the transcript describe *one* sender.
- **Same window.** `call-driver.ts:320` invokes `onLive` **while receive-side recording is still open**;
  `:332` calls `stopReceiveSideRecording` only afterwards. The captured audio *is* the audio in flight
  during the counter sampling. Corroborated numerically: `sampleCount = 65536` @ 48 kHz = **1.365 s**,
  against the `onLive` deadline of **1400 ms** (`:169`). The receive WAV is coextensive with the window.
- **Far-end, not local.** The tap is `pc.addEventListener('track', …)` → `createMediaStreamSource(event.streams[0])`
  (`receive-side-recorder.ts:277, 251`). `ontrack` fires **only for remote tracks**; locally-added tracks
  never raise it, and the hook connects no `getUserMedia` source. `meta.trackCount === 1`, `pcCount === 1`.
  So the transcribed audio provably traversed the real SFU from page1 to page2.

That last point needed checking because `launchArgs` go to `chromium.launch()`, so **both** browsers play
`alice-host.wav` — page2's own mic carries the same speech. Had the recorder tapped anything local, the
whisper gate would pass regardless and the evidence would be worthless. It does not: provenance is
established by **mechanism** (ontrack-only), not by content. Restated honestly, the test now proves:

> *During real human speech, on a real room join through the real app, all four counters strictly advance
> on the sender, and the far end verifiably transcribes that same speech from audio that crossed the SFU.*

Which is AC15's live clause.

---

## Gate checks

**1) Reproduce — green, independently, on the live app.** App up (`localhost:4700` → 200).

| Suite | Result |
|---|---|
| `b08a3-live-sender-liveness.browser.test.ts` (live, real dual-browser call) | ✅ 1/1 passed, 13.36 s |
| `b08s2-receive-capture-hook.browser.test.ts` (real Chromium) | ✅ 2/2 passed |
| `receive-side-recorder.test.ts` (unit) | ✅ 13/13 passed |

My live run burned exactly 1 call and regenerated `validation/b08a3-evidence/` from scratch — the evidence
now on disk is **mine**, not the impl's, and it independently satisfies the gate (`rms 0.172`,
`reason VALID`, 3 real words, substring-verified).

**2) Evidence quality.** `classifySenderLiveness === 'both-advancing'` ✅ (real classifier). Four counters
strictly advance ✅. Receive WAV `VALID`, `rms > 0`, `trackCount 1`, `audioContextState running` ✅.
Real-STT transcript, word count > 0, content-coupled to the fed speech ✅ (§F2). Burn delta `=== 1` ✅.
Evidence **persisted** to `b08a3-evidence/` rather than deleted — r1's secondary finding, adopted. ✅

**3) Spine `716d6d1` — PASS, endorsement re-confirmed.** `3150f08` does not touch it (single-file diff).
`b08s2-receive-capture-hook.browser.test.ts` still proves both directions in real Chromium: pre-PC
`replaceState` → `pcCount 0`, no `INVALID_RELOAD`; post-PC `pushState` → `INVALID_RELOAD`.

**4) THREE GUARDS — hold.** `classifyCapture` decision logic byte-for-byte unchanged (no source file was
modified this round). No synthetic success WAV — the WAV is produced by real capture off a real `ontrack`
stream and now additionally must survive a real VAD-filtered STT. Guards strengthened, not relaxed.

**5) Ledger — burn delta correct; the r1 counter defects remain OPEN and now BREACH the budget.**

| File | Burns | Δ |
|---|---|---|
| `ledger-state.json` (repo root) | **50** | unchanged this round |
| `e2e/ledger-state.json` | **29** | 26 → 28 (impl's 2 runs) → 29 (my reproduce) |

The in-test assertion `burnAfter - burnBefore === 1` is a same-process delta and is **correct and
unaffected** — the AC15 claim stands. But the three r1 mechanism defects are untouched by `3150f08`
(which only edited a test) and are now material:

1. **Burn-before-browser** — `createRoom()` (`call-driver.ts:243`) precedes `chromium.launch()` (`:253`)
   inside the `try`, and the `catch` (`:358`) calls `incrementCallBurn()`. Auth/createRoom failures burn a
   "call" that never opened a browser. Root's 50-burns-against-1-room is near-conclusively catch-path
   pollution.
2. **Split ledger** — `call-ledger.ts:36` keys the file off cwd; two counters exist, neither authoritative.
3. **Inert cap** — `isCallBurnExceeded()` is called only from tests, never from `call-driver.ts`. Nothing
   fails closed. It did not stop the impl's runs and it did not stop mine.

**`e2e` is at 29 against a budget of 25.** I flag this for the coordinator as a live budget breach on an
untrustworthy counter. It does **not** invalidate AC15, and I did not invent a product fix for it.

**6) commit-landed-before-gate — PASS.** HEAD = `3150f08`. `git status --porcelain` over `*.ts`/`*.py`/
`frontend`/`backend`/`e2e/harness` shows **no unstaged source** — only run-dir docs, the two mutated
ledger JSONs, and the regenerated evidence dir.

---

## Scope — what PASS does and does not close

**AC15 live clause: VERIFIED.** **AC15 in full: still open**, on a clause independent of F1/F2. AC15 also
requires:

> Then inject each failure independently — (i) capture-dead, (ii) sender-dead-with-capture-alive — and
> prove the harness **tells them apart**.

Discrimination was closed offline in B08A-2 (loopback, 0 burns); **sender-dead injection is explicitly
deferred to B13W**. This was r1's secondary finding and I am not silently dropping it now that the batch
passes. Correct per this batch's brief (composition-only), but the coordinator must not mark AC15
**VERIFIED** off this gate alone — B08A-3 closes the live clause, B13W owes the injection clause. The D29
diagnostics binding (per-track counters in the app's payload) is B08A-1's, not re-checked here.

---

## Secondary findings (non-blocking)

- **Harden the gate to what it already empirically satisfies.** The test asserts `wordCount > 0`; I
  verified far more (verbatim substring of ground truth, twice). The stronger property is stable across
  runs even though the *fragment* varies, so it is assertable without flake: normalize `stt.text` and
  assert it is a contiguous substring of `alice-host.wav`'s known transcript (or ≥2-word overlap with its
  word set). Today a future regression to noisy-but-non-speech audio could in principle hallucinate words
  past `wordCount > 0`; `vad_filter` makes that unlikely, not impossible. Recommend to B13W.
- **Provenance is mechanism-only, not content.** Both browsers are fed the same fixture, so the far-end
  transcript's *content* cannot distinguish page1 from page2. Feeding `bob-local.wav` (already in-repo) to
  the receiver would make the transcript itself prove provenance. Cheap, strictly additive.
- **`clientId: 'bot-140'` in `whisper-transcript.json` is test-supplied**, written into the sidecar by
  `runLocalWhisper`, not derived from the audio. It must not be read as speaker-attribution evidence.
- **Dead tautologies still in the file.** `toContain('scriptExpected')` and `transcriptContent.length > 0`
  (`:212-214`) survive as "supplemental". They are correctly labelled and non-gating, but they assert
  nothing. Recommend deletion so no future reader mistakes them for evidence.
- **Sibling tests feed a tone.** `b08a2`, `b08s2`, `b07`, `gum-shim` all pass
  `--use-file-for-fake-audio-capture=<bot-speech tone>`. Harmless where only counters/RMS are asserted
  (their case), but any future AC that names transcript evidence must not reuse those fixtures. Finding 3
  of `b07-findings.md` should be treated as a standing fixture-selection rule.
- **Room cleanup owed — 9 rooms in `e2e/ledger-state.json`**, of which `67601a0a9404` is my reproduce run.
  The harness still exposes **no sanctioned deleter** (`call-ledger.ts:75` `canDelete()` is a guard with no
  corresponding delete path), so I did **not** improvise a DB deletion. Flagging for B21.
  `testroom01001` (TEST_ROOM01) is registered in the ledger but was **not** created, joined, or mutated by
  this batch or by me — the test creates a fresh room via `createRoom()`. Verified untouched.

---

**AC15 live clause: VERIFIED. B08A-3: PASS.** The spine `716d6d1` stands. F1 and F2 are closed with real
speech and real STT, and the closure is content-coupled and reproducible — I reproduced it on my own live
call and confirmed the gate fails on the tone it used to pass on. AC15's injection clause remains with B13W.
