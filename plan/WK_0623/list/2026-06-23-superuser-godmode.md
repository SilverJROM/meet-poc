---
date: 2026-06-23
type: feature
status: planned (implementation gated behind JROM post-call go)
agent: projcore
qa_verification: pending
---

# Concealed superuser (god mode) + complete admin powers

## JROM verbatim
> "add a superuser w/c is me silverjrom and i want to be able to edit the role, email, username of the
> users (basically god mode on the app). admin can just add/delete users or make other users admin as well,
> god mode has all powers. and from the perspective of the admin or superuser is just admin, only superuser
> knows he is super user. i can reset passwords as well as superuser"
> (answers) "1. yes only me for now  2. ok  3. im greyed out no one should be able to touch me, i appear
> admin but is greyed out  4. yes  5. i can change it but has confirmation, also changing for others needs
> confirmation as well"

## Disposition
Designed in `projcore-run-2026-06-23/` (north-star Issue #2, decision `2026-06-23-superuser-godmode.md`,
req-matrix R2.1–R2.9, plan `B2-superuser.md`). Superuser = singular seeded `silverjrom@gmail.com`, shown as
greyed "Admin", untouchable (backend hard-block), god-mode mutations require confirm. Also completes the
missing admin powers (delete user, toggle admin) that don't exist today. No implementation until go.
