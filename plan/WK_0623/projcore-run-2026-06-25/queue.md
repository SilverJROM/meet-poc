# Queue — Recording reliability v2 + drop diagnosis (2026-06-25)

Overmind-parseable (`- <id> [status] — <friendly label>`). 3-agent: impl A=codex55, impl B=grok, validator=sonnet.

- B1 [done] — Make long-call recordings actually save when the host ends the call (deploy the fix + prove it)
- B2 [done] — Keep saving the recording in the background and confirm it even if you close the tab
- B3 [done] — Stop losing recordings silently — log + tell the host when a save fails
- B4 [done] — Find out why the caller dropped for several minutes (her internet vs our app)
- B5 [done] — Real long call with Peer2's machine: record, end the call, and confirm it saved
- B2D [done] — Deploy the background-save (reconcile) frontend so R2 is actually live

## Batch detail (engineering)
| ID | Scope | Owner | Req | Bucket |
|----|-------|-------|-----|--------|
| B1 | Build + deploy FE (ships B5 flush upload-before-close); validator reproduces broken-on-old then saved-on-new | grok (deploy) + sonnet (repro) | R1 | SHORT |
| B2 | Backend grace-window (accept upload for session ended <5min) + client persist/confirm-on-reload of pending marker | codex55 | R1,R2 | SHORT |
| B3 | Log 403/409/write rejections server-side + host notice; keep owner-gate (403) intact | codex55 | R3 | SHORT |
| B4 | Read-only diagnosis of the 03:12→03:23 drop from meeting_session_diagnostics + logs; client-internet vs app | codex55 | R4 | SHORT |
| B5 | Capstone: real long call via Peer2 relay, end via close-room, confirm [rec] saved + library | sonnet (validate) | R1,R2,R5 | TEST-HEAVY |

## Standing
- Grace window = 5 min (north-star D1). Owner-gate stays (security).
- Acceptance = real long call (Peer2), per real-call rule.
- B6 [done] — Capture call diagnostics for the whole call, not just the first few minutes
