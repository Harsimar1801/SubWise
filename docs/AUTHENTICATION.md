# Phase 2 authentication

SubWise uses self-hosted Better Auth 1.7 with the existing Prisma/PostgreSQL
database. This keeps the application User IDs, roles and customer relations.
Neon managed Auth remains disabled: custom registration, password policy and
Customer creation run in the application. No frontend files are needed or changed.

## Local configuration

Keep the existing database variables. Add these to ignored `.env`:

```dotenv
BETTER_AUTH_SECRET=<random-secret-at-least-32-characters>
BETTER_AUTH_URL=http://localhost:3000
AUTH_ALLOW_LOCAL_HTTP=false
SMTP_URL=smtp://user:password@your-smtp-server:587
SMTP_FROM=SubWise <accounts@your-domain.example>
```

Generate the secret without placing it in a command argument:

```powershell
$env:BETTER_AUTH_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"
$env:BETTER_AUTH_URL = 'http://localhost:3000'
npm run db:deploy
npm run dev
```

Save the same secret in your ignored environment file for stable sessions across
restarts. In deployed environments use HTTPS, a stable secret and the canonical
app origin as `BETTER_AUTH_URL`. Cookies use Secure with HTTPS, HttpOnly,
SameSite=Lax, and database-backed sessions expiring after one day (renewed during
use). For a local **production-build** smoke test only, set
`AUTH_ALLOW_LOCAL_HTTP=true`; it is restricted to localhost/loopback hosts.

SMTP is optional for registration/login but required for reset requests, which
return 503 when mail is unconfigured. Use an existing SMTP service or a local mail
catcher. No paid API is required. Do not log reset links/tokens. Reset email links
lead to Better Auth's validation redirect; the frontend must implement a
`/reset-password` page that accepts the token and submits the new password.
That UI is intentionally outside Phase 2.

## API contract

Use JSON and send `Origin` equal to `BETTER_AUTH_URL`'s origin on all POSTs.
Browser requests must include credentials; the frontend should be served from
the same origin. Cross-origin CORS is not enabled. Responses contain no hashes.

| Method/path | Body / behavior |
| --- | --- |
| POST `/api/auth/sign-up/email` | `{name,email,password}` -> 201 `{user:{id,name,email,role}}`; creates CUSTOMER and Customer atomically; does **not** log in automatically |
| POST `/api/auth/sign-in/email` | `{email,password}` -> Better Auth session/user response and signed session cookie |
| POST `/api/auth/sign-out` | `{}`; ends the current database session and clears cookie |
| GET `/api/auth/me` | Current active user, authoritative role, and customerId; 401 without eligible session |
| GET `/api/auth/get-session` | Better Auth session format; use `/me` for app authorization/status |
| POST `/api/auth/request-password-reset` | `{email,redirectTo:"<app origin>/reset-password"}`; generic success for known/unknown addresses when mail is configured |
| POST `/api/auth/reset-password` | `{token,newPassword}`; rejects expired/consumed tokens; revokes all user sessions |
| POST `/api/admin/staff` | ADMIN session plus `{name,email,password}` -> 201 STAFF user |
| GET `/api/customers/:id/profile` | Only own customer for CUSTOMER; ADMIN/STAFF may access any profile; returns only id/name/email |

Passwords are 9–128 characters with uppercase, lowercase and at least one
non-alphanumeric, non-whitespace character. Digits are optional. Email is trimmed,
lowercased and checked for uniqueness (409); names and input shape are validated.
Clients cannot submit role/isActive fields or use upstream account update/signup
paths. Authentication failure is 401, forbidden role/ownership/origin is 403,
validation is 400, unavailable configuration/mail/database is 503, and throttling
is 429. Input is capped at 8 KiB. Better Auth errors retain its response format;
custom routes return `{error}` or `{error,issues}`.

Better Auth uses scrypt password hashing. Reset identifiers are hashed at rest,
expire after 15 minutes, and are consumed transactionally once. Upstream signup,
account linking, and profile/role mutation routes are not exposed. Email
verification, MFA and OAuth are not part of this phase; registration does not
prove email ownership. Existing unlinked Customer emails are rejected rather
than automatically claiming financial records.

## Initial administrator (terminal only)

There is no public bootstrap endpoint or default credential. A trusted database
operator runs the command below. It serializes concurrent bootstrap attempts and
refuses when **any** ADMIN record already exists, including an inactive admin.
Database access and control of the environment are the bootstrap trust boundary.
The command is `npm run auth:bootstrap`, not `npm run auth`. All three
`BOOTSTRAP_ADMIN_*` values below are required. `.env.example` is a template, not
an automatically loaded environment file. Set the variables in the **same
PowerShell terminal** that runs the command; other terminals and Codex do not
inherit changes made to an already running sibling process. Existing process
environment values take precedence over `.env` / `.env.local`.
The script loads those files through `@next/env`; Prisma CLI configuration is
not run by this direct `tsx` command. It only needs `DATABASE_URL` plus the three
bootstrap values, not SMTP settings or `BETTER_AUTH_SECRET`.

Use the secure prompt below for passwords containing `$`. If storing a password
in a dotenv file instead, escape `$` as `\$` to avoid dotenv variable expansion.
Do not run the shell with transcript/debug logging that could capture secrets.

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL = Read-Host 'Admin email'
$env:BOOTSTRAP_ADMIN_NAME = Read-Host 'Admin name'
$adminPassword = Read-Host 'Admin password' -AsSecureString
$env:BOOTSTRAP_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminPassword).Password
npm run auth:bootstrap
Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL,Env:BOOTSTRAP_ADMIN_NAME,Env:BOOTSTRAP_ADMIN_PASSWORD
Remove-Variable adminPassword
```

No production admin is automatically created by install/migration/seed.

## Authorization for later modules

Import `requireUser(headers, roles)` or `requireCustomerAccess(headers, id)` from
`src/lib/auth/authorization.ts` in future handlers. These read the current session
and authoritative database role/active flags on every request. CUSTOMER queries
must use the returned `customerId`, or validate a requested ID with the ownership
helper **before** reading data. Never accept a role or ownership claim from JSON,
query strings or UI state. Existing health remains public. No financial CRUD
endpoints are added in this phase.

Auth requests use persisted rate limits. Additional shared, per-path limits cap
registration at 10/minute and other POSTs at 30/minute regardless of forwarded IP
headers; Better Auth caps sign-in at 15/minute, reset requests at 5/minute, reset
submissions at 10/minute per resolved client IP (or shared bucket if unavailable).
Shared limits are intentionally conservative for a hackathon and may throttle
unrelated users. Configure only trusted proxy IP headers when deploying; never
trust arbitrary forwarded headers. Large-scale abuse protection is outside scope.

## Validation and tests

```powershell
npm run db:validate
npm run typecheck
npm run lint
npm run build
npm run test:smoke
```

`npm test` runs policy and HTTP-handler integration tests using a **separate**
migrated PostgreSQL database. It refuses to implicitly use production. Provision
an empty disposable database and apply all migrations to it before testing:

```powershell
# Set these securely; do not paste credentials into Git or chat.
$env:TEST_DATABASE_URL = '<isolated test database pooled URL>'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
$env:DATABASE_URL_UNPOOLED = '<isolated test database direct URL>'
npm run db:deploy
Remove-Item Env:DATABASE_URL,Env:DATABASE_URL_UNPOOLED
npm test
Remove-Item Env:TEST_DATABASE_URL
```

For schema-only Neon branches, schema objects already exist but migration rows
are not copied. Baseline the two Phase 1 migrations with `prisma migrate resolve
--applied <migration-name>` on that test branch, then apply the auth migration.
Never baseline or reset the production database to run tests.

Tests exercise actual Prisma, hashing, Better Auth handlers, sessions, RBAC,
customer isolation, duplicate/invalid input, blocked role escalation, inactive
accounts, reset callback delivery, expiry, concurrent reuse, logout, session
revocation and rate limits. Mail delivery is captured at the callback boundary;
external SMTP delivery requires a configured server and manual inbox check.
`test:smoke` starts the built Next.js app on port 3107, verifies public health and
rejected unauthenticated/invalid auth requests over HTTP, then stops it. It uses
the configured app database, creates no accounts, and may update rate-limit rows.
Tests clean their own users/customer fixtures, clear auth rate limits, and expire
reset records on the test database; never point this suite at a shared database.

References: [Better Auth password authentication](https://better-auth.com/docs/authentication/email-password),
[Prisma adapter](https://better-auth.com/docs/adapters/prisma),
[hooks](https://better-auth.com/docs/concepts/hooks).
