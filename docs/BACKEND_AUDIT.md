# Backend readiness audit — Phase 7.5

Audit date: 2026-10-31. Checkout: dev/backend. Verdict: CONDITIONAL readiness for
same-origin frontend integration. Core workflow and functional tests pass; full
release verification is incomplete because isolated auth/concurrency tests are
blocked, the current production-build attempt hit an environment lock, and the
built-app smoke test failed. Do not describe this audit as an all-green release.

## Scope and changes

Reviewed existing phase documentation, Prisma schema/migrations, Better Auth
configuration/router/account creation, catalog and management scopes, billing
transactions/idempotency, insights permissions, recovery and analytics contracts.
No confirmed critical code bug found within this review; no business-module change,
refactor, migration, dependency installation or environment edit made. This is a
focused integration/security review, not a penetration test or compliance audit.

Created FRONTEND_API_CONTRACT.md and FRONTEND_INTEGRATION_GUIDE.md alongside this
audit, plus tests/backend-workflow.test.ts to bridge existing management and billing
infrastructure. This test injects a staff actor and uses real PostgreSQL in a
rolled-back transaction. It is not a browser/auth-session end-to-end test.

Unrelated pre-existing dirty work preserved: .gitignore, docs/LOCAL_SETUP.md,
prisma/schema.prisma, .agents/, neon.ts, prisma.config.ts, scripts/verify-database.ts,
skills-lock.json and tests/bootstrap.test.ts. No Git writes executed.

## Existing test inventory

| npm script | Existing target |
| --- | --- |
| test | auth.test.ts (not a complete suite) |
| test:catalog | catalog.test.ts, catalog.integration.test.ts |
| test:management | management.test.ts, management.integration.test.ts |
| test:billing | billing.test.ts |
| test:billing:concurrent | billing.concurrent.test.ts |
| test:smoke | http-smoke.ts, built Next server on port3107 |

Additional existing tests lack package scripts: bootstrap.test.ts,
insights.test.ts, finance.test.ts, finance.integration.test.ts. All were included
explicitly in the sequential Node test runner for this audit. Validation scripts:
db:validate, db:generate, db:status, db:verify, typecheck, lint, build. Migration,
seed and bootstrap scripts exist but are not test-suite commands and were not run.

## Actual results

The complete pre-existing Node test suite was invoked once with
`npx tsx --test --test-concurrency=1` and all eleven existing *.test.ts paths.
Runner output: tests30, pass28, fail2, skipped0; exit1.

| Area | Passed | Blocked |
| --- | ---: | ---: |
| Auth policy/integration | 1 | 1 |
| Bootstrap invalid/missing configuration | 2 | 0 |
| Catalog unit/PostgreSQL integration | 7 | 0 |
| Management/subscription lifecycle | 3 | 0 |
| Billing | 3 | 0 |
| Billing concurrent workers/payments | 0 | 1 |
| Revenue simulator/health | 5 | 0 |
| Recovery/financial analytics + PostgreSQL recovery | 7 | 0 |

The two blocked tests appear as assertion failures, not skipped tests: missing
TEST_DATABASE_URL. The audit checked presence/equality only and did not expose
connection strings. No isolated test URL was configured. Neither suite was pointed
at the application database. Auth integration would clear test auth throttles and
clean accounts; concurrency commits fixtures, so neither is safe for live/shared DB.
Previous-phase success reports are not counted as current audit passes.

New workflow test run separately once: tests1, pass1, fail0. It verified:
customer -> quotation (23600 minor units including18% tax on20000) -> send ->
confirm -> convert -> activate -> invoice -> confirm -> full manual payment ->
replayed identical payment returns same ID -> PAID with zero balance. Billing again
at the same time created no extra invoice. All fixtures rolled back.

Total Node test assertions: 29 passed, 2 blocked at prerequisites; no observed
functional assertion failure once prerequisites were met. Concurrency behavior
was reviewed in code but cannot be claimed revalidated by the blocked suite.

Database checks:
- `npm run db:status`: five migrations found; schema up to date.
- `npm run db:verify`: all18 expected application tables exist, Prisma
  create/read/rollback works without retained fixture, invalid tax rate rejected.
- `npm run db:validate`: schema valid.
No migration applied/reset/edited; no production record deleted. Rollback fixtures
use the configured application connection. SMTP calls in tests use injected fakes.

Final checks (each requested script invoked once after audit test addition):
- `npm run typecheck`: PASS, including Prisma Client generation and Next typegen.
- `npm run lint`: PASS, zero warnings.
- `npm run build`: FAIL before Next compilation, Prisma EPERM rename of
  query_engine-windows.dll.node. Inspection identified existing node PID12152 as
  holding that DLL; its command line was classified as Next, not a test process.
  The server predates the audit final checks and was left running. Do not attribute
  this result to a TypeScript compilation error or claim a current passing build.
- `npm run test:smoke`: FAIL, generic built-app smoke error; the helper suppresses
  startup/request diagnostics. Root cause is not established. No smoke HTTP cases
  can be counted as passed in this audit. Earlier successful builds are historical.
- `git diff --check`: PASS (line-ending notices on pre-existing files only).
No expensive check repeated to work around these failures.

## Security findings

- Better Auth uses scrypt, database sessions, HttpOnly/SameSite cookies and secure
  HTTPS cookies. Role/active/customer state is reloaded server-side by resolveUser;
  UI role claims cannot grant access. Cookie cache disabled.
- Customer signup cannot set role; staff creation requires ADMIN. Terminal-only
  administrator bootstrap serializes and refuses a second ADMIN. Password reset
  has15-minute hashed tokens and session revocation configured. Live reset/session
  integration is blocked here, so code review is not a substitute for that test.
- Customer reads are scoped to customerId; catalog projections hide internal cost/
  notes; invoice drafts are excluded. Internal insights/recovery/analytics deny
  CUSTOMER before data reads. Financial writes require ADMIN/STAFF, except billing
  execution requires ADMIN or its configured cron bearer. Origin/JSON checks bound
  mutation inputs; auth has persistent throttling. Cross-origin CORS is absent.
- Invoice row locks, period uniqueness, serializable billing transactions, job keys
  and payment idempotency/reference checks protect finance invariants. Payments
  exceeding balance and cancellation of paid/part-paid invoices are rejected.
- Server-only environment access is used for credentials. `git ls-files '.env*'`
  showed only .env.example. Ignore rules exclude .env files except the template.
  Credentials, password hashes and reset links were not printed in this audit.
  This is not a historical Git secret scan or a dependency-vulnerability audit.

## Integration risks and limitations

1. Same-origin deployment/proxy is required for cookies and Origin validation.
   Browser login across teammate development origins is not automatically supported.
2. Auth uses user/customer/native envelopes; business APIs use data/meta; PDF is
   binary. Status enums differ from UI labels. See FRONTEND_API_CONTRACT.md.
3. Isolated real auth/reset/logout and concurrent billing/payment tests remain
   blocked. Operator must supply an actually disposable, migrated TEST_DATABASE_URL
   (not another URL for the same application DB) before relying on those results.
4. Current production build and built-app HTTP smoke remain unverified. When ready,
   stop the existing server holding Prisma's DLL, then rerun build and smoke manually;
   if smoke still fails, capture its child-server startup output for diagnosis.
5. Recovery is manual, with documented3/7/14-day stages. Preview is never sent.
   SMTP acceptance is not inbox delivery; ambiguous failures/pending reservations
   need operator review. No real SMTP delivery, concurrency/load test performed.
6. No email verification, live payment gateway, refunds/credits or proration.
   PDF font is ASCII; minor-unit presentation is a hackathon export.
7. Billing batches at most20 due subscriptions/one period each; expiry prevents
   backfill. MRR is normalized estimated recurring value, not cash; currency totals
   remain separate. Analytics/health scan history in memory/batches, without a
   repeatable snapshot or production-scale latency guarantee. Invoice listing uses
   per-invoice balance queries; optimization was outside this audit's scope.

## Next verification steps (operator)

Use a disposable migrated test database for the blocked suites. Never reset or
clean the application DB to enable tests. Once the existing Next process can be
stopped safely, run build then test:smoke. Integrate the frontend against current
contracts in development while treating deployment signoff as pending those checks.
