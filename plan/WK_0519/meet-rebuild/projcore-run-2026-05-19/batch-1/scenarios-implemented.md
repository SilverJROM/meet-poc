# Scenarios Implemented — B1

| Scenario | Status | Test file | Evidence |
|---|---:|---|---|
| S1.1 valid login sets cookie | PASS | `backend/tests/auth-login.test.ts` | Supertest POST `/api/login` returns 200, `{email}`, and session cookie with HttpOnly/Path/SameSite/Secure under HTTPS. |
| S1.2 wrong password rejected + logged | PASS | `backend/tests/auth-login.test.ts` | Supertest returns 401 with no Set-Cookie; console capture verifies `[login] FAIL` wrong-password log. |
| S1.3 `/api/me` null/user states | PASS | `backend/tests/auth-me-logout.test.ts` | GET without cookie returns `{user:null}`; GET with login cookie returns `{user:{email}}`. |
| S1.4 logout invalidates session | PASS | `backend/tests/auth-me-logout.test.ts` | POST `/api/logout` returns `{ok:true}` and the old cookie no longer authenticates. |
| S1.5 password hashed in SQLite | PASS | `backend/tests/passwords.test.ts` | Direct DB query verifies hash is not plaintext and matches legacy `<saltHex>:<hashHex>` format. |
| S1.6 expired session rejected/deleted | PASS | `backend/tests/sessions-ttl.test.ts` | Expired session row returns `{user:null}` and is removed from SQLite on read. |
| S1.7 legacy JSON migration works | PASS | `backend/tests/migrate-from-json.test.ts` | `legacy-poc/data.json` user imports into SQLite and login succeeds with original credentials. |
