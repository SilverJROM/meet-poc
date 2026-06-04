# B01 ARCH-0 — projcore independent validation: PASS
- media-acquisition.ts: fallback ladder (audio exact→ideal→default→throw; video →none graceful) + single-flight FIFO queue (META1). Pure, framework-free.
- media-acquisition.spec.ts: I RAN it (npx tsx) → all assertions passed (exact→ideal, ideal→default, video-default→none, queue serializes).
- media.service preflight: mic-first (acquireAudio must-succeed) + camera best-effort (acquireVideo().catch → skip, never blocks audio); commitAcquiredLocalStream = acquire-before-destroy (stop old after new committed) + preserves mic-level/cameraOn. Improves ERR3 (preflight no longer throws on camera failure).
- ng build green. No regression.
