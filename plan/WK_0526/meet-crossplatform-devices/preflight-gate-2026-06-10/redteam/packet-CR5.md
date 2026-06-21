# RED-TEAM CR5 — lens L5: adversarial multi-participant / reconnect / gate-bypass (DISTINCT from CR1-4). 2nd-consecutive-clean target.
# Role = your model. Try HARD to break it from angles prior rounds did NOT cover.
## Read: og-requirements.md (R1-R10), redteam/IMPL-prod-diff.patch, real files.
## Lens L5 attack questions (file:line; CRITICAL vs NON-CRITICAL):
1. MULTI-GUEST: 3+ participants, several admitted, one never-publishes, one muted, one healthy — does the host badge correctly show ONLY the broken one? Any cross-peer state bleed (prevInboundBytes/peerFirstSeen keyed wrong, id collision)?
2. RECONNECT / REJOIN: a guest drops + rejoins; host's WS reconnect; a guest who leaves during their 7s grace then rejoins. Does the gate/badge/publish re-run correctly? Stale peerFirstSeen? Does the rejoiner re-pass the green-room gate or skip it wrongly?
3. ADVERSARIAL GATE-BYPASS: can a user reach 'in-call' / be heard WITHOUT passing mic+speaker verify (race on join click, double-click, refresh mid-gate, programmatic state, speaker 'Yes' without tone, mic verified then unplugged before join)?
4. HOST-IS-ALSO-A-USER: the host themselves must pass the gate (R1 'everyone incl host'). Does the host's own green-room work? Does the host see their OWN failures (host is both guest+host)?
5. R10 IN PRACTICE: pick 2 failure modes and trace them end-to-end through the REAL code (not just the pure-fn test) — does the runtime actually reach the handled state?
6. Anything CR1-4 + the coordinator missed.
## Output redteam/<role>-CR5.md:
```
## Multi-guest / reconnect / bypass findings (file:line) or none
## Any remaining CRITICAL?
## Findings [CRITICAL]/[NON-CRITICAL] or none
STATUS: CRITICAL-CLEAN or CRITICAL-BUG — <worst>
```
Ruthless. New angles only. CLEAN only if you truly found nothing.
