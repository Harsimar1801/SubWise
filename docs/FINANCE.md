# Phase 7 finance and recovery

All endpoints require an ADMIN/STAFF Better Auth session. CUSTOMER receives 403
before database access, including its own recovery records. Existing customer
subscription/invoice APIs remain the customer-facing summary APIs. No new public
risk/collections endpoint exists. Errors use `{error,issues?}` and data uses
`{data}`, with no-store headers. No schema migrations, dependencies or new env vars.

## Recovery routes

- GET `/api/finance/recovery?page=1&pageSize=20`: overdue invoices with positive
  balances; returns data plus meta page/pageSize/total (max pageSize 100).
- GET `/api/finance/recovery/{invoiceId}`: computed state plus history.
- GET `/api/finance/recovery/{invoiceId}/preview`: subject, text and PREVIEW_ONLY.
  Read-only; no delivery or logged attempt.
- GET `/api/finance/recovery/{invoiceId}/history`: chronological RecoveryEvents.
- POST `/api/finance/recovery/{invoiceId}/send`: attempt eligible reminder delivery.
- POST `/api/finance/recovery/{invoiceId}/pause`: pause future reminders (also use
  for disputed invoices; no separate formal dispute model exists).
- POST `/api/finance/recovery/{invoiceId}/resume`: resume reminder eligibility.
- POST `/api/finance/recovery/{invoiceId}/escalate`: mark day-14 staff review.

POSTs accept only `{}`, require JSON and the configured Better Auth Origin.
Missing invoices return 404; ineligible/duplicate/completed actions return 409.
ADMIN/STAFF can operate all actions; policy is fixed in code, no staff/admin
configuration endpoint is introduced. Recovery never charges or changes invoices.

State includes invoiceId, customerId, outstandingMinor, daysOverdue, eligible,
completed, paused, stage, escalated, lastReminderAt, canSend, nextAction. Customer
is tracked through the invoice foreign key. History records actor ID in metadata.
Outstanding sums only COMPLETED allocations. Eligibility requires OPEN or
PARTIALLY_PAID, dueAt before now, and positive balance. Day counts compare UTC
calendar dates, not elapsed 24-hour blocks. Before day 3 wait; days 3–6 stage 3;
days 7–13 stage 7; day 14+ staff escalation (no more reminder emails). Missed earlier
stages are not backfilled. Paid/void invoices immediately end recovery on reads
and block new actions; no background completion event needs scheduling.

Existing RecoveryEvent fields are reused: REMINDER for delivery, RETRY for pause/
resume control events, ESCALATION for staff review. attemptNumber increases per
invoice/type. Invoice row locks serialize control changes, reservation and sending
with existing payment/cancellation code. A persisted PENDING reservation blocks
another send for the same stage; SUCCEEDED also blocks duplicates. SKIPPED with
metadata.delivery=PREVIEWED is not sent and does not consume the stage. FAILED
records a sanitized failure; it can be retried manually after checking provider
outcome. No SMTP exception details or message bodies are stored in history.

A second transaction rechecks balance/pause while holding the invoice row lock
through SMTP submission. Payment updates wait for that bounded transaction; no
email can be recalled after acceptance. Transactions performing delivery are
never retried automatically. A crash/timeout/commit failure can leave PENDING;
check mail-server logs before operator repair. Exactly-once external SMTP delivery
cannot be guaranteed on ambiguous provider failures. There is deliberately no
automated pending reset or automatic scheduler that could resend uncertain mail.

## SMTP / local demonstration

Reuses optional `SMTP_URL` and `SMTP_FROM`, already used by password-reset mail.
With either missing in development, Send logs SKIPPED/PREVIEWED; inspect the
preview endpoint for the content. In production, missing SMTP logs FAILED. SMTP
submission success means mail-server acceptance, not guaranteed inbox delivery.
SMTP values are server-only; keep credentials out of requests and version control.

1. `npm run dev`; sign in as ADMIN/STAFF.
2. Use a dedicated existing OPEN demo invoice at least 3 UTC days overdue (or create
   one through existing billing APIs). No automatic editing of live due dates.
3. GET listing and preview. POST send with `{}` without SMTP: inspect PREVIEWED.
4. Pause; Send returns 409. Resume; local preview is eligible again.
5. On day 14 use escalate. Record remaining balance through the Phase 5 payment
   endpoint; recovery now reports completed and rejects sends.

## Analytics routes and filters

GET `/api/finance/analytics/{overview|trends|plans|renewals|recent}`

Example: `/api/finance/analytics/overview?currency=LKR&from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z`

currency defaults LKR and must be three uppercase letters. No currency conversion
or mixed-currency sums. Dates are ISO timestamps with offsets; [from,to) is
exclusive at the end. Default is start of month 11 months ago through now.
Positive ranges up to 366 days accepted. page/pageSize apply to plans and renewals
(max100); other responses are bounded charts or ten recent transactions.

- overview: currency/from/to/asOf, activeSubscriptions, mrrMinor, invoicedMinor,
  paymentsReceivedMinor, outstandingMinor, overdueInvoiceCount,
  highRiskSubscriptions, upcomingRenewalCount.
- trends: month, invoicedMinor, collectionsMinor, subscriptionsStarted. Missing
  months zero-filled; boundary months reflect only the requested partial range.
- plans: planId/name/invoicedMinor/mrrMinor with meta pagination. Distribution is
  based on invoice item total including tax/discount, linked via subscriptionItem.
  Missing links are explicitly Unattributed. No invoice total counted per item.
- renewals: active subscriptions ending within next 30 days, sorted endsAt;
  id/customerId/endsAt plus meta pagination. This means expiry renewal, not every
  next billing occurrence.
- recent: invoices/payments arrays, up to ten each from the requested period.

Range affects invoiced totals by issuedAt, collections by paidAt and subscription
starts by startsAt. Invoices exclude DRAFT/VOID. Cash counts each COMPLETED Payment
once, not once per allocation. Balances are current lifetime balances, including
UNCOLLECTIBLE; overdue count uses OPEN/PARTIALLY_PAID only. Active/MRR, risk and
renewals are current snapshots independent of range. Growth is starts per month,
not net customer acquisition or historical active-population reconstruction.

MRR uses ACTIVE unpaused, started/nonexpired subscriptions with active customers;
quantity * agreed unit price less agreed snapshot discount, excluding tax. Phase 6
monthly normalization reused: year /12, day *365/12, week *365/84, divided by
intervalCount; rounded per subscription line. It does not forecast future discount
exhaustion, prorations or collection likelihood. All output money is minor units.

Queries are batched (no per-invoice/subscription reads), using currency/status/date
filters and existing relations/indexes. Full current financial history is loaded
for balances/health and computed in memory: suitable for thousands of records,
not a reporting warehouse. Requests are live reads, not a repeatable-read snapshot;
concurrent payments can change successive responses. Large deployments should
add SQL aggregation/caching before scaling further.

## Verification

```powershell
npx tsx --test tests/finance.test.ts tests/insights.test.ts
npx tsx --test tests/finance.integration.test.ts
npm run test:billing
npm run db:validate
npm run typecheck
npm run lint
npm run build
```

Integration fixtures run in a transaction and roll back. Tests inject delivery
functions and never send real emails. Unit tests exercise failure/preview status,
UTC stages, payments, permissions, metrics and date filtering. Integration verifies
persistence, pause, duplicate blocking and completion; it is not a multi-connection
SMTP concurrency/load test.
