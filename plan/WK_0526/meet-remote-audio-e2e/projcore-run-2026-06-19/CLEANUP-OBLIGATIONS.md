# Teardown cleanup obligations (Phase 3) — JROM-requested

## Peer2's machine (relay sessions) — "cleanup only what you use"
- DELETE session **872d483d-d986-4a3d-9486-eb59a600a55d** ("jrom-codex", codex) — the ONLY session WE created on creepy-mini. It is the live relay channel for ALL cross-machine batches (B1-B5), so delete ONLY at run completion.
  `mutation { deleteAiSession(id:"872d483d-d986-4a3d-9486-eb59a600a55d") }`
- DO NOT touch: 4d25e49a (shell, pre-existing 20:59 — Peer2's, grok merely reused it) or any other pre-existing session.
- If grok/we create ANY additional AiSession on creepy-mini during B2-B5, add it here and delete it too. (Re-list `listAiSessions` at teardown and delete only those created >= 2026-06-19 22:32 by us.)

## Our DEV (throwaway rooms) — separate from Peer2 cleanup
- Delete throwaway rooms created this run (RA-E2E-* / ra-b1-*): 3073e6a60221, 8ab26a672a82, 9e6608e07738, 8536b3a2d480, 0e5c7055ff3d, + any later. NEVER touch TEST_ROOM01/testroom01001.
