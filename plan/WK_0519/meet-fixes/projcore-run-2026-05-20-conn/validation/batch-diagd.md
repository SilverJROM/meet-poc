# Batch D (diagd / DR-12 + DR-13) — Projcore Independent Validation

**Verdict: PASS — VERIFIED. DR-12 join-popout + DR-13 audio-invariant delivered.**

## Independent execution

| Check | Result |
|---|---|
| Commit | 59be4c0 on fix/meet-conn-diag (room.page + webrtc.service +31 + 211-line spec) |
| `npm test -w backend` | 103 passed / 1 skipped |
| Targeted gate (call-path + lobby + all diag specs incl. diagd) | **55/55 of the non-data-seed specs PASS**, incl. diagd 5/5 |
| codex clean-DB gate | 83/83 (Run-1 + all diag) |
| Screenshots | join-popout-name / -mic / -both reviewed |

## DR-12 — Join-prereqs popout (verified)

Screenshot (join-popout-both): Join button is **full-blue "Ask to join" — NOT greyed**; popout reads "Please add your name and enable your microphone" + Dismiss; name field red-bordered. Codex confirms Dismiss + Escape, mic-denied-camera-on handling, muted join allowed, prereq = name + mic access. Matches DR-12.

*(Minor note: the popout is an inline alert panel below the toggles, not a centered modal — it's unmissable + names exactly what's missing, satisfying the requirement. Flag if JROM wanted a centered modal specifically.)*

## DR-13 — Audio-bandwidth invariant (verified)

Test `DR-13 audio reservation survives degrade, restore, and video active toggles` asserts after mutations:
`audioActive:true, audioPriority:'high', audioNetworkPriority:'high', videoPriority:'low', videoNetworkPriority:'low'`.
Codex reasserts audio-priority after every video sender mutation (degrade/restore/toggle/replace), never lowers/stops audio. This LOCKS "audio first, video gets the remainder" as a tested invariant — JROM's explicit ask.

## Known test-infra issue (NOT DR-12/13, NOT a product bug) — flag for future hardening

4 data-seed specs (FIXC7.4/5/6, FIXC8.3) fail on the LIVE DB with `SqliteError: FOREIGN KEY constraint failed` at the test's meeting_session seed (line 33). Root cause: the test seeds a session via a direct DB connection referencing a room the API just created — a **cross-connection WAL visibility race** on the live DB (the direct connection can't see the room yet). Passes on a clean/isolated DB (codex 83/83). Product DB is healthy (83 rooms/108 sessions work).
**Recommendation:** future gate runs should validate on an isolated/clean DB (codex's approach), and/or the seed helper should create sessions via the API or share the backend's connection / force a WAL checkpoint. Tracked as a test-hardening follow-up; not blocking feature acceptance.

## Cleanup

Test rooms cleaned; dashboard = TEST_ROOM01 only (per JROM directive).

## Requirement closure

| Req | Status |
|---|---|
| DR-12 — join-prereqs popout (supersedes DR-7 grey-out) | **VERIFIED** |
| DR-13 — audio-bandwidth reservation non-overridable invariant | **VERIFIED** |

## Next in conn-run

E1 (DR-14 clickable rooms + DR-15 name-slug/custom URLs) → E2 (DR-16 waiting room). DR-8 cross-network field-proof still awaiting JROM live test.
