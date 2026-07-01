# Decision: batch-SS discovered pre-existing e2e rot — fix boundary

**Context:** Batch-SS (R7, screen-share infinite-mirror fix) is the first workload in this
projcore run to exercise real browser e2e specs (B1–B6 were unit-level: `sfu-recovery-
coordinator.spec.ts`, `sfu-client.spec.ts`). Running the 4 specs flagged for assertion swaps
surfaced 5 distinct, pre-existing defects unrelated to R7, none caused by this batch's diff
(each independently confirmed via code inspection and, for the first one, `git stash`
comparison against baseline).

**Fixed (mechanical, test-only, in scope to unblock evidence-gathering):**
1. `e2e/fixtures/auth.ts` — login button locator ambiguous since a Telegram login button was
   added in commit `1fbc273` (prior week, unrelated feature).
2. `e2e/fixtures/rooms.ts` — `createRoomFromDashboard` clicked a since-removed inline "Open"
   button; the room-open toggle moved into an overflow menu at some point.
3. 4 specs' admit helpers — knock-toast overlaps the "Show participants" corner button;
   switched to admitting directly from the toast's own inline Admit button.
4. `tilefix.spec.ts` — pre-join camera checkbox locator text was stale + needed `{force:true}`
   (visually covered by its own label, same as an existing sibling test already handles).

**NOT fixed (explicitly out of scope per the R7 brief's own boundaries):**
1. `share-camera-cut.spec.ts` (DR-53) references `window.__meetDebug.senderSnapshot`, a debug
   hook that no longer exists anywhere in the codebase — would require new SFU-client
   instrumentation (brief: "Do NOT change...the SFU publish path").
2. `tilefix.spec.ts` (DR-30) expects the local camera self-view to be CSS-mirrored; it isn't,
   due to `effectiveLocalStream()` always returning a non-null stream for the grid tile,
   which makes `isMirroredSelfView` always false. This is inside camera/self-PIP tile logic
   (brief: "Do NOT change...the camera/self-PIP tiles").
3. `share-reflow.spec.ts` FIXC3.2 (8 rapid-fire socket-based knock admissions) has its own,
   separate timing race against the toast — not one of the assertions I was asked to swap.

**Why:** Root-causing and fixing #1/#2 above would each be a non-trivial, separate task
(new debug hooks vs. investigating a camera-mirror regression), well outside an atomic
screen-share-only UI fix, and the brief's own scope fence explicitly excludes both areas.

**Recommendation:** File #1 and #2 as separate follow-up tickets (weekly issue list) rather
than leaving them as silent, undocumented breakage. My assertion swaps in both files are
present and correct (verified via the working pattern in the other 2 specs + the new
dedicated R7 spec) — they are simply unreachable until those pre-existing, unrelated issues
are fixed separately.

**Decided by:** implementer (Claude), surfaced to coordinator via STATUS: NEEDS-INFO rather
than silently claiming full green across all 4 files.
