# Decision — B5 Filesystem-Only Recording Index

## Status

Accepted

## Decision

Do not add a SQLite recordings table in B5. Store recordings on disk and derive list/download authorization from the filename's embedded room id.

## Rationale

The legacy PoC used local disk only, R6 asks for basic filename/size/download surfacing, and the B5 brief recommends filesystem-only unless insufficient. Embedding `roomId` in the filename gives the backend enough information to enforce owner-filtered listings without a new persistence layer.

## Consequences

- Filename format is `<timestamp>_<roomId>_<roomTitleSlug>_<rand6>.webm`.
- The dashboard can list recordings by scanning `recordings/`.
- If future metadata needs grow, a table can be added in a later batch without changing the uploaded file body format.
