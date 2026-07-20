# B08A-3 Independent Validation — AC15 live clause

**Validator:** L3 (opus), independent. Verifier ≠ fixer — no product or test code was modified.
**Commits under gate:** `716d6d1` (B08S-2 navCount pcCount gate) + `1733b61` (B08A-3 live test). HEAD = `1733b61`.
**Impl:** sonnet. **Red-team:** CLEAN.

# Verdict: **FAIL**

AC15 **may NOT be marked VERIFIED.** The batch proves a real, valuable invariant — but not the one AC15
states. Two blocking gaps, both on AC15's central predicate, both cheaply remediable.

The spine fix (`716d6d1`) is **independently sound and I endorse it** (see §Gate 3/4). The FAIL is scoped
to the AC15 live-clause evidence in `1733b61`.

---

## Q0 — AC15 live clause → covering assertions

AC15 (og-requirements.md:135-140), live clause, verbatim:

> **During speech that the far end verifiably transcribes**, assert that **both** advance:
> `totalAudioEnergy` + `totalSamplesDuration` (capture side) **and** `packetsSent` + `bytesSent` (sender side).

Three conjuncts. Mapping to the assertions in `b08a3-live-sender-liveness.browser.test.ts`:

| # | AC15 conjunct | Covering assertion | Status |
|---|---|---|---|
| 1 | four counters strictly advance | `expect(values[last]).toBeGreaterThan(values[0])` for each of the 4; plus real `classifySenderLiveness(window) === 'both-advancing'` | **COVERED** — real B08A-1 reader, real B08A-2 classifier, real `sfuGetStats()`, no stubs |
| 2 | …during **speech** | *none* | **GAP** |
| 3 | …that the far end **verifiably transcribes** | `expect(transcriptOnDisk).toContain('scriptExpected')`; `expect(transcriptContent.length).toBeGreaterThan(0)` | **GAP** — both assertions are tautologies (§F2) |

Per the Q0 rule (`GAP ⇒ FAIL`) and D27, this is a FAIL. Detail follows.

---

## F1 (BLOCKING) — There was no speech. The call carried Chrome's fake-device *tone*.

`call-driver.ts:44-51` `DEFAULT_LAUNCH_ARGS` sets `--use-fake-device-for-media-stream` and **never**
`--use-file-for-fake-audio-capture`. Chrome's fake device emits a periodic beep, not speech.

This is not an unavoidable stack limitation — the harness has a **first-class affordance for exactly this**,
and every sibling test uses it:

- `call-driver.ts:17` — `launchArgs?: string[]; // Chrome flags (e.g., for fake audio)`
- `call-driver.ts:230` — `const launchArgs = [...DEFAULT_LAUNCH_ARGS, ...(config.launchArgs || [])]`
- `b08a2-sender-liveness.browser.test.ts:36` and `b08s2-receive-capture-hook.browser.test.ts:21` both pass
  `--use-file-for-fake-audio-capture=e2e/fixtures/bot-speech/bot-140/hello.wav` (48 044 bytes, present on disk).

The B08A-3 live test is the **only** browser test in the harness that needs speech and does not feed it —
while its own `script.utterances[0].audioPath` *names* `bot-140/hello.wav`. That `audioPath` is never read by
`call-driver.ts`; `conversation-scheduler.ts` only passes it through. The test comment concedes this:

> *"Speech itself is Chrome's continuous fake-device audio … not this script's playback, **which the harness does not wire**"*

So the four counters advanced during a **beep**, not during speech. Conjunct 2 is unmet by construction.

**Why it matters beyond pedantry:** AC15 exists (per D28/D29) to be the T1 discriminator during *real speech*.
A continuous tone is the easiest possible signal for `totalAudioEnergy`/`packetsSent` to climb on — it has no
pauses, no dynamic range, no VAD/DTX interaction. Speech is exactly where `packetsSent` can stall while energy
climbs (the sender-dead mode AC15 is built to catch). Proving `both-advancing` on a tone does not exercise
the regime the invariant was designed for.

## F2 (BLOCKING) — The "transcript" is an echo of the test's own input. It cannot fail.

`receive-side-recorder.ts:424-434`:

```ts
export function generateScriptTranscript(script, receiverSpeakerId) {
  const utterances = script.utterances.filter((u) => u.speaker === receiverSpeakerId);
  return utterances.map((u) => `[${(u.timeMs/1000).toFixed(2)}s] ${u.text}`).join('\n');
}
```

It is a pure function of the **input script**. It never touches the WAV, never touches audio, never invokes STT.
The transcript is the string `'Hello, how are you?'` that the test itself typed in, reformatted.

Both transcript assertions are therefore tautological:
- `toContain('scriptExpected')` asserts a **hardcoded header literal** (`receive-side-recorder.ts:442`).
- `transcriptContent.length > 0` is nonzero because the test authored the text.

Both would still pass with the app fully broken, with the SFU down, with zero audio delivered. They carry
**zero bits** about far-end behaviour.

**D27 governs and forbids this closure** (`prompts/VALIDATOR-EVIDENCE-CLASS-RULE.md`, "effective now, every brief"):

> An AC that names an evidence class (live recording, **transcript**, live call) **CANNOT** be closed by any
> other evidence class. A self-declared **scaffold** is an **automatic FAIL**, not an "honest PASS."
> **Candour is not evidence.**

The impl brief's binding #5 ("scriptExpected labeled OK if STT not wired") is an **unauthorized carve-out from
D27**, which binds *every brief*. The batch complied with its brief; the brief was wrong. D27 anticipates
precisely this fact pattern and pre-refuses it: labelling the scaffold is what makes it a self-declared
scaffold, not what rescues it. The red-team deferred this call to me ("Validator must accept this evidence
class") — **I do not accept it.**

Note also that real STT **is** on-box (`backend/src/modules/recording/index.ts` — faster-whisper, `WHISPER_MODEL`),
so "STT is not wired on this stack" is a statement about the harness, not the stack.

## What the batch *did* legitimately prove (credit where due)

The far-end WAV assertions are **real, non-tautological evidence** and I want them preserved:
`receiverPageIndex: 1` records page2 while page1 is the sampled sender, so `meta.reason !== 'SILENCE'` and
`meta.rms > 0` genuinely prove **page1's audio traversed the real SFU and landed at page2 as non-silent audio**.
That ties sender-side counters to far-end arrival through the real app. It is a strong result.

It is simply not the AC15 clause. Restated honestly, the test proves:

> *During a fake-device tone that the far end verifiably receives as non-silent audio, all four counters advance.*

versus what AC15 requires:

> *During speech that the far end verifiably transcribes, all four counters advance.*

---

## Gate checks

**1) Reproduce — all green, targeted runs.**

| Suite | Result |
|---|---|
| `receive-side-recorder.test.ts` (unit) | ✅ 13/13 passed |
| `b08s2-receive-capture-hook.browser.test.ts` | ✅ 2/2 passed (real Chromium) |
| `b08a3-live-sender-liveness.browser.test.ts` (live, `localhost:4700`) | ✅ 1/1 passed, 10.75 s |

App confirmed up (HTTP 200). No full-suite run needed. The batch's green claim **reproduces** — the FAIL is not
a flake, it is what the passing test *asserts*.

**2) Evidence.** `classifySenderLiveness === 'both-advancing'` ✅ (real classifier). Four counters strictly
advance ✅. Receive WAV `VALID`, `rms > 0` ✅ (real). Burn delta `=== 1` ✅ (sound; §Gate 5). Transcript
non-empty ✅ *but vacuous* — **§F2**. Counters advanced during a tone, not speech — **§F1**.

**3) Spine fix — PASS, endorsed.** `installCaptureHook` now increments `navCount` only when `state.pcCount >= 1`.
`b08s2-receive-capture-hook.browser.test.ts:167-198` proves **both** directions in real Chromium with a real
`RTCPeerConnection`:
- pre-PC `history.replaceState` → `pcCount === 0`, `navCount === 1`, `classifyCapture(...).kind !== 'INVALID_RELOAD'` ✅
- post-PC `history.pushState` → `pcCount >= 1`, `navCount > 1`, `classifyCapture(...).kind === 'INVALID_RELOAD'` ✅

Bootstrap `replaceState` no longer false-trips; genuine mid-call SPA navigation still trips. Mechanism-level and
correct.

**4) THREE GUARDS — hold.** `classifyCapture` decision logic is **byte-for-byte unchanged**
(`receive-side-recorder.ts:53/56/59`: `INVALID_HOOK_MISSING` → `INVALID_RELOAD` → `INVALID_NO_PC`), plus
`INVALID_HOOK_BLIND`/`PRODUCT_NO_MEDIA`/`INVALID_AUDIO_GRAPH` and the `rms < 0.01` SILENCE floor. Only the
hook's *input* was narrowed. Guard order is unaffected (the `navCount` check precedes the `pcCount` check, and
gating the input cannot make an INVALID row read VALID). **No synthetic success WAV** — the WAV is produced by
real capture off a real `ontrack` stream. ✅

**5) Ledger — diagnostic pollution AND a real breach, on an untrustworthy counter. Does NOT invalidate the AC15 claim.**

The counter is **split across two files by cwd** (`call-ledger.ts:36`, `path.join(basePath || cwd, 'ledger-state.json')`):

| File | Burns | Rooms registered | Δ this batch |
|---|---|---|---|
| `ledger-state.json` (repo root) | **50** (49 pre-run) | 1 (only mine) | 47 → 49 |
| `e2e/ledger-state.json` | 26 | 6 | 12 → 26 |

My live run incremented **root 49 → 50**; `e2e/` stayed at 26. So the "26 vs budget 25" the coordinator saw is a
*stale, parallel* counter — the live path writes root, which reads **50/25**, double the cap.

Mechanism, three compounding defects:
1. **Burn-before-browser.** `createRoom()` (`call-driver.ts:243`) sits inside the `try` **before**
   `chromium.launch()` (`:253`), and the `catch` at `:358` calls `incrementCallBurn()`. Every auth/createRoom
   failure burned a "call" that **never opened a browser and never joined a room**. Per D27 ("only browser-open
   + room-join burns a call") those are **over-counts**. Root ledger held **49 burns against 0 registered rooms**
   before my run — near-conclusive that the bulk of root's count is catch-path pollution from the auth-debug arc.
2. **Split ledger.** No single authoritative counter exists; the budget is unenforceable as designed.
3. **Inert cap.** `incrementCallBurn()` returns a boolean nobody reads, and `isCallBurnExceeded()` is called
   **only from tests**, never from `call-driver.ts`. Nothing fails closed. The escalation's "fail closed near 25"
   was never implemented in code — it stopped nothing, including my own run.

**Impact on the AC15 claim: none.** The test asserts a *delta* (`burnAfter - burnBefore === 1`) within one
process, which is correct and immune to the cross-run mess. I did **not** invent a product fix for any of this.

**6) commit-landed-before-gate — PASS.** `git log` confirms `716d6d1` then `1733b61`, HEAD = `1733b61`. Working
tree carries only run-dir docs + the two mutated ledger JSONs (no unstaged source).

---

## Secondary findings (non-blocking)

- **The test destroys its own evidence.** `b08a3-live-sender-liveness.browser.test.ts` `unlink`s the WAV, meta,
  and transcript on the success path. For an AC whose closure rests on far-end *recording* evidence, no durable
  artifact survives the gate — a validator cannot inspect what the run actually captured without re-burning a
  call. Recommend persisting under the run-dir instead of deleting.
- **AC15's injection clause is not live.** og-requirements.md:137-140 also requires injecting capture-dead and
  sender-dead-with-capture-alive and proving the harness tells them apart. Discrimination was closed offline in
  B08A-2 (loopback); sender-dead injection is explicitly deferred to B13W. Correct per the brief's scoping, but
  AC15 **as written** remains open on that clause too, independent of F1/F2.
- **Room cleanup owed.** 6 rooms in `e2e/ledger-state.json` + `70caf2dfa5d7` created by my reproduce run. No
  sanctioned deleter exists in the harness (`canDelete()` is a guard, with no corresponding delete path), so I
  did **not** improvise a DB deletion. Flagging for B21 rather than silently dropping it.
  `testroom01001` was **not** touched by this batch or by me — verified untouched.

---

## Remediation (for the coordinator — I do not implement)

Both blocking gaps are cheap:

1. **F1** — pass the affordance the harness already has, exactly as B08A-2/B08S-2 do:
   `launchArgs: ['--use-file-for-fake-audio-capture=<abs>/e2e/fixtures/bot-speech/bot-140/hello.wav']`
   in the `joinDualBrowserCall` config. One line. Then the counters advance during **real speech**.
2. **F2** — either (a) run the on-box whisper over the captured receive WAV and assert the far-end transcript
   contains the spoken words, which closes conjunct 3 as written; or (b) escalate to **north** to amend AC15's
   evidence class. It is **not** the implementer's or the validator's call to relax a D27-protected clause.

Note (1) makes (2a) tractable: once real speech is fed, the captured WAV contains words to transcribe. Today it
contains a beep, so no STT could close AC15 even if wired.

**AC15 remains NOT VERIFIED.** The spine fix `716d6d1` stands on its own evidence and needs no rework.
