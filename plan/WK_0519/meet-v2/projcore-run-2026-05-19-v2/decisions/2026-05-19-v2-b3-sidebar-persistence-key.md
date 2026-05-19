# Decision: v2-B3 Sidebar Persistence Key

## Decision

Persist the app-shell sidebar collapse preference under:

`meet-poc.sidebar-collapsed`

## Rationale

The key is scoped to this app and to the sidebar state specifically. It also matches the B3 prompt wording exactly, which keeps future tests and user support simple.

## Consequences

- First load defaults to collapsed when the key is absent.
- Subsequent `/app/*` visits honor the stored user preference.
- Clearing browser site data resets the sidebar to the locked default collapsed state.
