# Frontend integration guide

## Start and connect

Use the existing checkout and dependencies. Keep DATABASE_URL, Prisma configuration
and ignored credentials intact. The app needs BETTER_AUTH_SECRET (32+ chars) and
BETTER_AUTH_URL. PostgreSQL must be reachable with the five existing migrations.
Do not reset or regenerate migrations to integrate UI. `npm run dev` serves Next.js.
For production-build testing use `npm run build` then `npm start`; localhost HTTP
requires AUTH_ALLOW_LOCAL_HTTP=true in that terminal only. Deployed auth uses HTTPS.

Serve the finalized frontend on the same origin as the backend or use a correctly
configured same-origin deployment proxy. Pointing a separate frontend origin at
the API with credentials alone does not enable CORS. Never expose database URLs,
SMTP credentials, cron secret or auth secret through NEXT_PUBLIC variables.

```typescript
async function api(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? 'Request failed');
  return payload; // Business data lives in .data; auth may use .user or native body.
}
```

Call `/api/auth/me` after login and app reload. Handle 401 by showing sign-in;
403 as insufficient permissions; 409 by refreshing the affected resource; 429 with
backoff. Do not retry financial writes with a new idempotency key after a timeout.
Registration does not sign in. Keep reset token handling on the reset page and
never log the token. Reset SMTP and delivery must be validated separately.

## Demonstrate the complete workflow

1. ADMIN creates active product, variant and same-currency plan through catalog;
   publish product/plan for customer visibility. STAFF cannot edit catalog.
2. Register a CUSTOMER and then log in; use its existing linked customer record.
   ADMIN/STAFF may instead create an unlinked business customer for quotations.
3. As STAFF/ADMIN create quotation with plan/quantity and optional tax/discount,
   send, confirm, then convert with a reached startsAt. Capture returned IDs.
4. Activate the DRAFT subscription. Future starts/expired records cannot activate.
5. ADMIN runs billing with a stable job idempotencyKey. One run handles at most20
   subscriptions, one period each; returned data is a BillingRun, not invoices.
6. List invoices, select resulting DRAFT by subscriptionId, inspect and confirm.
7. Record partial/full manual payment; save one stable receipt key/reference per
   payment. Re-fetch invoice. Final full payment makes PAID; balance is zero.
8. As CUSTOMER, own invoices/subscriptions are visible; another customer's IDs
   are hidden/forbidden. Internal insights/finance endpoints remain forbidden.
9. Download PDF as a Blob using response.blob(), not the JSON helper.

The audit's backend-workflow test verifies steps3–7 using persisted transactional
fixtures and rolls everything back. It injects an authorized actor; it does not
replace the blocked real-session auth integration test.

## Screens and limitations

Use FRONTEND_API_CONTRACT.md plus the phase docs for field schemas. Do not assume
all success bodies have data, all statuses match UI labels, or all errors share
one machine code. Disable role-forbidden controls but retain server enforcement.
Hide internal notes/health/recovery screens from customer navigation.

Recovery preview works without SMTP; manual send logs PREVIEWED in development.
No automatic reminder scheduler exists. Demo billing requires ADMIN, a development
flag and dedicated allowlisted IDs; never rewrite live subscription dates for demos.
PDF export is ASCII and minor-unit based. No live gateway, refunds/credits,
proration, email verification, or historical net-growth reconstruction exists.
Analytics aggregates in memory and has no load-test SLA. Confirmed invoices use
current subscription payment terms at confirmation. Expired subscriptions do not
backfill historical invoices. Billing batch failures roll back the entire batch.

## Verification commands

Run Node tests sequentially to reduce contention. `npm test` alone covers auth only.

```powershell
npx tsx --test --test-concurrency=1 tests/auth.test.ts tests/bootstrap.test.ts tests/catalog.test.ts tests/catalog.integration.test.ts tests/management.test.ts tests/management.integration.test.ts tests/billing.test.ts tests/billing.concurrent.test.ts tests/insights.test.ts tests/finance.test.ts tests/finance.integration.test.ts tests/backend-workflow.test.ts
npm run test:smoke
```

Auth and billing concurrency require an operator-confirmed disposable migrated
TEST_DATABASE_URL. Auth clears test auth throttles and cleans test accounts;
concurrency leaves committed fixtures. Never set it to the application DB or a
shared/live alias. No isolated URL was available during this audit. Other DB tests
use rollback fixtures against configured PostgreSQL. Smoke starts built Next on
3107 and may update auth throttle rows; it sends no email and creates no accounts.
