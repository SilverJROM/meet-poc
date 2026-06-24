[projcore callback] red-team batch-B3a STATUS: REPRO-CLEARED-ON-LOCAL — no Telegram passwordless auth bypass found; replay/consumed/denied/expired complete paths reject without session, rate caps and per-challenge send reservation hold, webhook secret rejects missing/wrong/length-mismatched tokens, foreign from.id and wrong-tap probes cannot approve/revive; targeted 44/44 plus backend suite 229 passed/1 skipped; tsc clean 2026-06-23T10:15:05Z
[projcore callback] implementer batch-B5 STATUS: PROPOSED — mechanism-level diagnosis in progress — reading source files
[projcore ACK] implementer batch-B5 RECEIVED PROPOSED 2026-06-23T06:25:14Z
[projcore callback] implementer batch-B5 STATUS: WORKING — implementing T1-T7; think hard mode
[projcore callback] validator batch-B5 STATUS: WORKING — reading repo contract and confirming forensic reproduction
[projcore WAKEUP-MISSING] batch-B5 — wakeup-required marker still present after 60s grace; projcore did not call ScheduleWakeup + ack-wakeup. Failsafe NOT armed.
[projcore callback] implementer batch-B5 STATUS: DONE — T1-T7 implemented; build green; artifacts written; awaiting REPRO-CONFIRMED
[projcore callback] validator batch-B5 STATUS: REPRO-CONFIRMED — forensics confirmed; baseline HEAD e2e fails with no recording file after delayed upload
[projcore callback] validator batch-B5 STATUS: REPRO-CLEARED-ON-LOCAL — active worktree e2e passes; delayed host-end upload saves and appears in Library
[projcore ACK] implementer batch-B5 RECEIVED DONE 2026-06-23T06:41:52Z
[projcore ACK] validator batch-B5 RECEIVED REPRO-CLEARED-ON-LOCAL 2026-06-23T06:41:52Z
[projcore callback] implementer batch-B5 STATUS: WORKING — gap fix: extracting flushRecordingForExit helper, wiring into justLeave
[projcore callback] implementer batch-B5 STATUS: DONE — justLeave+endForAll both call flushRecordingForExit; build green; changes.md updated
[projcore ACK] implementer batch-B5 RECEIVED DONE 2026-06-23T06:57:23Z (iter1 Leave-path)
[projcore ACK] validator batch-B5 RECEIVED REPRO-CLEARED-ON-LOCAL 2026-06-23T07:07:42Z (iter1 Leave-path, pane-confirmed)
[projcore callback] implementer batch-B1a STATUS: PROPOSED — Owner-only per-person transcribe + skip mixed enqueue; named-transcript canonical
[projcore ACK] implementer batch-B1a RECEIVED PROPOSED 2026-06-23T07:10:24Z
[projcore callback] implementer batch-B1a STATUS: WORKING — Implementing owner-only transcribe + per-user enqueue filter
[projcore callback] implementer batch-B1a STATUS: DONE — Owner-only per-person transcribe; mixed skip; alice re-transcribe zero-?; 27 BE tests + 2 PY tests green
[projcore ACK] implementer batch-B1a RECEIVED DONE 2026-06-23T07:23:27Z
[projcore callback] implementer batch-B1b STATUS: PROPOSED — OpenRouter provider + versioned transcript paths + mocked tests
[projcore ACK] implementer batch-B1b RECEIVED PROPOSED 2026-06-23T08:06:10Z
[projcore callback] implementer batch-B1b STATUS: WORKING — OpenRouter + versioned transcripts
[projcore callback] implementer batch-B1b STATUS: DONE — tsc green, 175 tests pass, B1b mocked OpenRouter+versioning
[projcore ACK] implementer batch-B1b RECEIVED DONE 2026-06-23T08:19:20Z
[projcore callback] implementer batch-B1c STATUS: PROPOSED — versions panel + service methods + add/delete/set-primary on transcripts page
[projcore ACK] implementer batch-B1c RECEIVED PROPOSED 2026-06-23T08:26:19Z
[projcore callback] implementer batch-B1c STATUS: WORKING — versions panel + service wiring on transcripts page
[projcore callback] implementer batch-B1c STATUS: DONE — versions panel wired; frontend build green; Playwright UI proof captured
[projcore ACK] implementer batch-B1c RECEIVED DONE 2026-06-23T08:39:24Z
[projcore callback] implementer batch-B2a STATUS: WORKING — reading backend auth/admin files for PROPOSED
[projcore callback] implementer batch-B2a STATUS: PROPOSED — migration+requireSuperuser+admin delete/toggle+god-mode endpoints+assertTargetNotSuperuser guards · complexity: medium · why: RBAC boundary with concealment needs shared guard + FK-safe delete
[projcore callback] implementer batch-B2a STATUS: WORKING — implementing migration+guards+admin endpoints+tests
[projcore callback] implementer batch-B2a STATUS: DONE — migration+requireSuperuser+admin delete/toggle+god-mode endpoints+guards; tsc green; 182 BE tests pass (7 new B2a)
[projcore ACK] implementer batch-B2a RECEIVED DONE 2026-06-23T08:45:25Z
[projcore callback] red-team batch-B2a STATUS: WORKING — adversarial backend RBAC probes started 2026-06-23T08:47:07Z
[projcore callback] red-team batch-B2a STATUS: REPRO-CLEARED-ON-LOCAL — no auth bypass found; mixed-case/trimmed target guard, create payload superuser escalation, self email cascade, guard coverage, and exposure probes passed; backend build green; 185 tests passed/1 skipped 2026-06-23T08:49:16Z
[projcore ACK] red-team batch-B2a RECEIVED REPRO-CLEARED-ON-LOCAL 2026-06-23T08:56:46Z (no auth bypass; 10/10 + 185 suite)
[projcore callback] implementer batch-B2b STATUS: PROPOSED — protected flag on list + admin UI god-mode/confirm · medium · concealment-safe grey row; B2a endpoints wired; window.confirm
[projcore ACK] implementer batch-B2b RECEIVED PROPOSED 2026-06-23T09:02:24Z
[projcore callback] implementer batch-B2b STATUS: WORKING — implementing protected flag + admin UI god-mode/confirm dialogs
[projcore callback] implementer batch-B2b STATUS: DONE — frontend build green; protected row + god-mode UI; Playwright UI proof captured
[projcore ACK] implementer batch-B2b RECEIVED DONE 2026-06-23T09:15:20Z
[projcore callback] implementer batch-B4 STATUS: PROPOSED — Tile cam-off bg+initials + signaling broadcast · medium · scope-B locked
[projcore ACK] implementer batch-B4 RECEIVED PROPOSED 2026-06-23T09:21:25Z
[projcore callback] implementer batch-B4 STATUS: WORKING — Implementing tile cam-off bg + signaling broadcast
[projcore callback] implementer batch-B4 STATUS: DONE — Build green + UI proof screenshot captured
[projcore ACK] implementer batch-B4 RECEIVED DONE 2026-06-23T09:34:21Z
[projcore callback] implementer batch-B3a STATUS: PROPOSED — passwordless TG auth backend — schema+crypto+eligibility+start/status/complete+webhook tap+rate caps; Turnstile verify to add (not in backend yet); ~45min cohesive
[projcore ACK] implementer batch-B3a RECEIVED PROPOSED 2026-06-23T09:43:43Z
[projcore ACK] implementer batch-B3a RECEIVED DONE 2026-06-23T10:09:45Z (pane-confirmed; DONE callback suppressed by broad ACK stop-rule on PROPOSED-ACK — brief-template nuance)
[projcore ACK] red-team batch-B3a RECEIVED REPRO-CLEARED-ON-LOCAL 2026-06-23T10:20:32Z (no auth bypass; 44/44 + 229 suite)
[projcore callback] implementer batch-B3b STATUS: PROPOSED — TG passwordless UI: login icon+number-match flow, settings activation toggle, passwordless service — frontend-only on B3a APIs
[projcore ACK] implementer batch-B3b RECEIVED PROPOSED 2026-06-23T10:26:24Z
[projcore callback] implementer batch-B3b STATUS: WORKING — checking tg-passwordless.ts activation endpoints; implementing login TG icon + settings toggle + service
[projcore callback] implementer batch-B3b STATUS: DONE — TG login UI+settings activation; 4 BE activation routes; FE+BE green; 48 BE tests; Playwright UI proof 4 screenshots
[projcore ACK] implementer batch-B3b RECEIVED DONE 2026-06-23T10:39:34Z
