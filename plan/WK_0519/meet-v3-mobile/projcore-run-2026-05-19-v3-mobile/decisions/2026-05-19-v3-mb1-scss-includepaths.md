# Decision: M-B1 SCSS Include Paths

## Decision

Use Angular `stylePreprocessorOptions.includePaths: ["src/styles"]` and component-level `@use 'breakpoints' as bp;`.

## Reason

M-B1 requires a shared breakpoint partial across app-level and component SCSS. Include paths keep imports stable as components move and avoid brittle relative paths such as `../../../styles/breakpoints`.

## Implementation

- Added `frontend/src/styles/_breakpoints.scss`.
- Added `stylePreprocessorOptions.includePaths` in `frontend/angular.json`.
- Converted app-local raw `@media` queries to `bp.max(...)` / `bp.between(...)`.

## Consequence

Future mobile batches can reuse `bp.mobile`, `bp.desktop`, `bp.max(...)`, and `bp.between(...)` without relative path churn.
