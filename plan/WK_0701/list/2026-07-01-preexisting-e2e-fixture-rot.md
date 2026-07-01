---
date: 2026-07-01
type: tech-debt (pre-existing e2e rot, out-of-scope)
status: surfaced-not-fixed
agent: projcore
qa_verification: 2/4 legacy share specs unrunnable
---
# Pre-existing e2e fixture rot (surfaced during R7 screen-share fix)
Discovered running the v3 share e2e suite (first time in a while). All PREDATE this run (stash-verified):
- share-camera-cut.spec.ts (DR-53): references window.__meetDebug.senderSnapshot — a debug hook REMOVED
  after the SFU cutover (confirmed absent from production code). Test fails before reaching any share assertion.
- tilefix.spec.ts (DR-30): expectMirrored(localVideo) — camera self-view mirror CSS no longer applied
  (inside effectiveLocalStream/isMirroredSelfView). Unrelated to R7.
- e2e/fixtures/auth.ts: getByRole('button',{name:'Sign in'}) needs {exact:true} (selector drift).
Out of scope for R7 (brief forbade touching SFU publish path + camera/self-PIP tiles). R7's assertion swaps
are present + correct; 2 specs just fail earlier on this rot. R7 acceptance proven by the new
presenting-placeholder.spec.ts (passing). Cleanup candidate for a future e2e-hygiene pass.
