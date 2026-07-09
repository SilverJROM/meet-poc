# Red-team budget — B02 (READ-ONLY)

Review e2e/harness/recording-arbiter.ts + tests. Do not fix.

Hunt fail-open / arbiter wrongness:
- Verdict PASS without stimulus verification
- Stats alone deciding PASS
- A/ratio using "loudest remote" or single-sample self-ratio
- Silent frames counted as voiced
- INVALID not distinct from FAIL
- Path traversal on recording paths
- Division by zero on normal loudness ~0

Write validation/b02-redteam.md CLEAN|FINDINGS.
Emit: [projcore callback] redteam B02 STATUS: DONE — CLEAN|FINDINGS
