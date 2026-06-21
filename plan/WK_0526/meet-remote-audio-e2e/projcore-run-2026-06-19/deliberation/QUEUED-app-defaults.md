# QUEUED DELIBERATION (JROM-requested) — app-defaults + thin user-faithful agent

JROM: "please deliberate this when you have a chance to fix the issues you have right now"

Topic for the 6-panel (3-family) front-load deliberation, to design the proper fix:
1. APP DEFAULTS: every call setting (SFU mode, audio, codec) must be a correct APP DEFAULT — plain room URL with NO params gives a full working call. Remove/neutralize any required user/URL config (the ?sfu=0 anti-pattern). Where does the app read sfu/config today, and how to make 'on' the default with no user input?
2. THIN USER-FAITHFUL AGENT: the agent must load the call EXACTLY as a real user (plain URL, real join UI, real defaults) with only a thin measurement layer (click join + getStats). This ALSO solves the deployment-drift pain: a small inline snippet sent each run via relay, no fat 864-line file to deploy/drift on creepy-mini.
3. DEPLOYMENT: if any agent code must live on creepy-mini, a reliable deploy mechanism (the base64-heredoc-via-relay is fragile). OR avoid it entirely via #2 (thin inline snippet).
Goal: real-user-fidelity test + no self-inflicted script quirks + no deployment hell.
