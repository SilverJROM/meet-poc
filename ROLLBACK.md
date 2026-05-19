# Rollback (historical)

The legacy single-file `meet-poc` PoC was deleted at the B6 cutover per JROM directive. The new TypeScript + Angular app at `voice.silverjrom.app` replaced it on 2026-05-19.

To recover the legacy source code, check out the commit immediately before `feat/meet-rebuild-b6-cutover` or read it directly from git history, for example:

```bash
git show 9dc8754:legacy-poc/server.js
```

`recordings/` was not touched at cutover. Existing `.webm` files prior to and during the rebuild remain on disk.

This rebuild was a non-incremental replacement. No supported rollback path exists post-deletion; restore from git history if ever needed.
