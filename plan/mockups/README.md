# meet-poc UI redesign mockups

Two minimalist/compact directions for the consensus UI recommendations (4-voice review:
projcore + Sonnet + Codex55 + Grok). Pick **#1** or **#2** (or mix — they share the same recs).

- **Images:** `images/` — rendered PNGs (1440×900 @2x). Open these to compare.
- **Code:** `code/` — self-contained HTML/CSS (no backend, fake data). Open in a browser to click around.

| | Option 1 — "Calm Light" | Option 2 — "Compact Pro" |
|---|---|---|
| Built by | Sonnet 4.6 | Codex gpt-5.5 |
| Nav | Slim **left sidebar** (4 items) | Horizontal **top bar** (4 items, full-width content) |
| Dashboard | Airy room rows | Dense **table** rows |
| Accent | Indigo `#4f46e5` | Teal `#0d9488` |
| Feel | Soft, breathable, friendly | Tight, efficient, tool-like |
| In-call | Dark stage, More-menu popover | Dark stage, **floating pill** control bar |

### Files
```
images/option-1-dashboard.png   code/option-1-dashboard.html
images/option-1-incall.png      code/option-1-incall.html
images/option-2-dashboard.png   code/option-2-dashboard.html
images/option-2-incall.png      code/option-2-incall.html
```

### Consensus recommendations both options apply
1. Compact room rows — Join + Copy + status + one `⋯` overflow (password/access/lobby-timeout behind it).
2. Settings: one active inline helper instead of always-rendered detail spans (shown in spirit).
3. Slim nav to 4 core items (Rooms / Meetings / Library / Settings).
4. In-call control bar: mic / camera / screen / **More** / leave — record, reactions, speaker, device pickers under More.
5. Compact join (not shown here — trivial).
6. No duplicate brand text; user shown as an initials avatar.

These are mockups only — no app code was changed.
