# Live frontend/backend integration

## Inspection and activation

Before this change every active adapter exported by adapters/index.ts was a mock.
Auth used browser storage; management used module-memory fixtures; dashboard and
intelligence used independent fixed samples. The existing API clients were dormant
and transport was disabled unless explicitly approved.

The active barrel now constructs createLiveAdapters with the existing same-origin
API clients. No environment toggle, mock fallback or secrets are added. Standalone
mock modules remain solely for existing isolated tests; active screens no longer
import fixture modules. The default transport factory still stays disabled unless
explicitly enabled, preserving the safety of standalone callers.

## Connected features

- Better Auth sign-in followed by authoritative /api/auth/me, CUSTOMER registration,
  logout, reset requests/submissions, and role-based workspace redirects. Fake demo
  credentials and sample reset-token links have been removed.
- ADMIN dashboard: overview, trends, plan distribution, renewals and recent data.
  STAFF/CUSTOMER overview: counts derived from role-scoped management records.
- Catalog products/variants/plans, customers, quotations and subscription lifecycle:
  real reads/writes through existing contracts and role gates.
- Invoices: real balances/details/payments, PDF download, staff confirmation and
  unpaid cancellation. ADMIN can explicitly run due billing. Payments are manual
  receipt records, never gateway charges.
- Revenue Simulator, Health and Payment Recovery: real endpoints, real stage and
  delivery outcomes. Reminder confirmations warn that configured SMTP can send mail.
- Existing pending/error/retry components are retained; mutations propagate API
  validation/authorization failures. No failed request falls back to fixture data.

## Contract adaptations and fixes

Business DTOs stay separate from view models. Lists drain all pages; document
reads hydrate missing lines in groups of eight per family. Subscription history
is fetched separately from detail because history omits items; lifecycle gates
aggregate agreed permission snapshots, not current catalog flags. History pages
are read until exhausted. Invoice allocations supply payment tracking, with
allocated amounts (not repeated payment totals). No standalone payment listing
endpoint is invented. Unknown/private catalog fields are not sent back by writes.

Null draft invoice dates display an em dash instead of throwing RangeError.
API errors retain their server message. Invoice actions refetch management data.
A billing key persists through failed/replayed requests; payment forms retain their
existing per-receipt keys. No automatic mutation retries were introduced.

## Preserved boundaries and limitations

No backend business logic, Prisma schema/configuration, migrations, .env, existing
accounts or stash was changed by this task. Existing unrelated schema and setup
document edits remain outside this change.

Same-origin hosting and BETTER_AUTH_URL alignment remain required. Production HTTPS
or the documented loopback production-test override is necessary. SMTP is optional
for core login, but password reset requires it; recovery preview is not sent.
Existing form supports percentage subscription discounts only; fixed/product rules
are preserved by the backend but not exposed as selectable options by this UI.

Management uses full snapshots to preserve existing screen design; large portfolios
will require server-side per-screen pagination later. Dashboard currency remains
LKR as in the existing screen. Health/recovery and dashboard directory adapters
fetch all pages for the current client-side directory UI. There is no realtime sync:
refresh/revisit screens to see changes made in another session. Reports/settings
remain disabled as before. Auth layout authorization is client-side for navigation;
all data/mutation authorization remains enforced by the backend.

## Validation

Commands used: npm run typecheck, npm run lint, npm run build, npm run test:smoke,
plus Node tests for live-adapters, api-clients, frontend, intelligence and the
PostgreSQL backend-workflow test. The frontend/API adapter suite passed24 tests;
PostgreSQL workflow passed1 and rolled back its fixtures. Existing mock unit tests
still pass but are not evidence of live browser behavior. Initial stale mock-barrel
assertion and one test typing error were corrected.

No persistent live account or reminder was created to demonstrate integration.
Existing-account browser sign-in, reset email receipt and real SMTP acceptance
still need an operator check; this task does not claim they were exercised.
See task report for final build/lint/typecheck/smoke results.

## Manual verification

Run npm run dev, sign in with an existing real account, and verify role redirect.
Register a new CUSTOMER only when deliberately testing account creation. Use
STAFF/ADMIN to create a quotation, send/confirm/convert, activate, then ADMIN due
billing. Confirm invoice, record a receipt once, and download PDF. Reopen invoice
and verify balance; switch to the customer's own login and verify isolation.
Open simulator/health/recovery as staff. Preview first; sending with SMTP configured
sends an actual reminder. Do not use production accounts/invoices as disposable
fixtures. Sign out and verify protected navigation returns to sign-in.

Final results: typecheck PASS; lint PASS; production build PASS (webpack compiled
and all pages generated); HTTP smoke14 PASS including health200, protected401,
invalid signup400 and unconfigured reset503. Frontend/adapter24 PASS and rolled-back
PostgreSQL workflow1 PASS. No known check failure remains after the fixes above.
