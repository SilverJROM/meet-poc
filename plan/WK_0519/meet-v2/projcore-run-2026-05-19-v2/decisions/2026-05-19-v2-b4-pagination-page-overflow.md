# Decision: v2-B4 Pagination Page Overflow

## Decision

Do not clamp requested pages above the last page on the server. Return the requested `page`, requested/capped `pageSize`, `total`, and an empty list when `OFFSET` is beyond the result set.

## Rationale

This keeps the API deterministic and avoids hidden redirects or server-side state correction. The frontend can decide later whether to navigate back to the last valid page after deletes or filter changes.

## Consequences

- `GET /api/rooms?page=999&pageSize=20` returns `{rooms: [], page: 999, pageSize: 20, total}`.
- The shared pagination component disables Next based on current `total`, but it does not currently auto-repair manually entered overflow URLs.
