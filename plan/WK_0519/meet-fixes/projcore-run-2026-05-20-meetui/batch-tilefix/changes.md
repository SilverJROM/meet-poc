# DR-30/DR-32 Tilefix Changes

- Local self-view camera videos now receive a CSS-only `scaleX(-1)` transform on the tile `<video>` element.
- Remote camera tiles are not mirrored, so text and third-person views remain true orientation.
- Presented screen-share surfaces are not mirrored because the mirror class is excluded when the tile is rendering an explicit display stream or the `share-main` presenter surface.
- Published media streams are unchanged; the transform is visual only.
- Gallery ordering now follows the stable peer list order instead of active-speaker promotion.
- Share-strip ordering now follows the same stable peer list order.
- Active-speaker detection still drives the existing `.is-speaking` tile outline in gallery and share-strip layouts.
- Removed the speaker-promotion timer, candidate state, debug field, and settle constant because DR-32 no longer promotes tiles by speaker.
- Updated existing orientation/share-reflow specs to assert highlight-only behavior instead of speaker-driven ordering.
