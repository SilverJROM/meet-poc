# v2-B3 Scenarios Implemented

## S3.1 App Route Entry

Implemented. Authenticated users landing on `/` are routed into `/app/rooms`, where the app shell and Rooms page render.

Evidence:
- `e2e/tests/v2-b3-shell/redirect.spec.ts`

## S3.2 Dashboard Redirect and Sidebar Navigation

Implemented. `/dashboard` redirects to `/app/rooms`. The app shell exposes six sidebar tabs with active route state, and each tab routes to its child page.

Evidence:
- `e2e/tests/v2-b3-shell/redirect.spec.ts`
- `e2e/tests/v2-b3-shell/sidebar.spec.ts`
- `screenshots/app-rooms-sidebar-collapsed.png`
- `screenshots/app-rooms-sidebar-open.png`

## S3.3 Stub Pages

Implemented. Transcripts and Settings routes render explicit Run 2 placeholders. Ongoing and Past routes render B4 placeholders.

Evidence:
- `e2e/tests/v2-b3-shell/stubs.spec.ts`
- `screenshots/app-transcripts-stub.png`
- `screenshots/app-settings-stub.png`

## S3.4 Parent Auth Guard

Implemented. `/app/rooms` and `/app/ongoing` both redirect unauthenticated visitors to `/login` through the parent `/app` guard.

Evidence:
- `e2e/tests/v2-b3-shell/auth-guard.spec.ts`
