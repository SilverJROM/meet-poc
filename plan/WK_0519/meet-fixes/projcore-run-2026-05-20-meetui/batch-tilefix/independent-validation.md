# DR-30/DR-32 Independent Validation

Validated against the locked batch scope after JROM's DR-30 correction.

- Local self-view camera video is mirrored with `scaleX(-1)`.
- Remote camera tile video is not mirrored.
- Local self-view camera remains mirrored when shown in the share-strip during an owner screen share.
- Presented screen-share content is not mirrored.
- Gallery order remains stable when active speaker changes.
- Share-strip order remains stable when active speaker changes.
- Active speaker still receives the existing `.is-speaking` outline.
- DR-31 reconnect tests remain green in the targeted gate.

Result: PASS.
