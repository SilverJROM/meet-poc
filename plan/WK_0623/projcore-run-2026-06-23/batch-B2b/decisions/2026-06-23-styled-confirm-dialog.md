---
date: 2026-06-23
slug: styled-confirm-dialog
source: implementer
batch: batch-B2b
---

# Decision — In-page confirm modal for admin god-mode

## Context

APPROVED-PLAN allowed `window.confirm`. UI-PROOF requires a rendered-DOM screenshot of a confirm dialog on a god-mode action; native browser confirms are not capturable in Playwright page screenshots.

## Decision

Use a lightweight in-page confirm modal on the admin page (backdrop + **Confirm action** / Cancel), matching the leave-dialog visual pattern. Keep `window.prompt` for collecting username/email/password input values.

## Scope

Admin page only. Delete and all god-mode mutations await `askConfirm()` before firing API calls.