# Diagnostics Issues Reference — extracted 2026-07-01

Reference summary of the issues captured in `meeting_session_diagnostics` before the raw data was pruned to
keep app storage lean. **The raw diagnostics rows were DELETED after this extraction** (see "Pruning" below).
This doc is the durable record; the payloads themselves are gone.

## Data span (pruned)
- 15,424 diagnostics rows · 2026-05-21 → 2026-07-01 · 60 rooms · 130 sessions.
- Kinds: sample 11,368 · state-change 3,980 · reconnect 62 · error 10 · call-end 4.

## Issues encountered (occurrence counts across payloads) → fix
| Issue signal in diagnostics | Count | Meaning | Fixed by |
|---|---|---|---|
| `lastGumError` carrying a `/api/sfu/tracks` failure | 12,706 | 406/subscribe errors MISLABELED as mic/getUserMedia errors — misleading observability | **R5** (diagnostics honesty: 406 → subscribe layer, not lastGumError) |
| `audioLevel: 0` on a subscribed track | 13,148 | subscribed but silent — broken inbound audio | **R3** (stalled remote-audio detection → recovery) |
| high `concealedSamples` | 10,134 | inbound audio concealment (packets dropped / stalled) | **R3** |
| `/api/sfu/tracks` **406** | 2,479 | Cloudflare SFU rejecting the track op (the root trigger of the failed calls) | **R1** (reproduce) + **R2** (escalation ladder survives it) |
| `advertised-not-subscribed` (persistent) | 321 | peer advertised audio but client never subscribed and GAVE UP | **R2** (never-give-up: retry→renegotiate→full SFU rejoin) |
| `hasPc: false` / publish not established | 319 | admitted client whose media never published (the "Glory" case) | **R4** (publish/PC-failure recovery) |
| ICE / transport recovery events | 16 | transport-level reconnects | handled by existing transport recovery + R4 |
| (`relay`/`reconnect` fields matched all rows — not distinct issues; excluded) | — | — | — |

## The two real failed calls that started this (from `error`-kind rows)
- **JROMRoom** (room `4c495f256f63`) — recurring `error` diagnostics incl. the 2026-07-01T12:07 "peer2" client
  entry (the failed call JROM reported). Also earlier JROMRoom errors 2026-05-28 → 2026-06-25.
- **HRIS_TOJ** (5-way, had to move to Google Meet) — the multi-participant SFU-graph failure.
- Others touched: "JROM Test" (`180cce4e7f73`), "Luminos" (`640edd52a969`).

## Resolution (WK_0701 run, all VERIFIED + merged to main)
Commits: B1 `6643a02` · B2a `e33a98d` · B2b `5f4a6bf` · B3 `fc05c58` · B4 `8b6825d` · B5 `f59a38f` ·
B6 `5ac223f` · R7 `0616c6f` · R8 `4ae581e` (merged to `main`, deployed to voice.silverjrom.app).
- Real-call confirmed BOTH directions 2026-07-01 (JROM ↔ Peer2's machine, agent-measured inbound RTP climbing).

## Also-surfaced (logged separately, not part of this issue set)
- Pre-existing e2e fixture rot (senderSnapshot dead hook, tilefix mirror, auth selector) — `plan/WK_0701/list/2026-07-01-preexisting-e2e-fixture-rot.md`.
- Pre-existing `missingPreflightPrereqs` test failure — `plan/WK_0701/list/2026-07-01-preflight-prereqs-mic-speaker.md`.
- `sessions/new fetch failed` transient — confirmed handled by R4 publish-recovery (no gap).

## Pruning (storage hygiene)
On 2026-07-01, after this extraction, all 15,424 `meeting_session_diagnostics` rows were DELETED and the DB
`VACUUM`ed to reclaim space. Diagnostics capture stays ON going forward (`diagnostics_globally_enabled=1`);
this only cleared the historical backlog. No user data (recordings, transcripts, rooms, users) touched.
