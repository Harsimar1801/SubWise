# Phase 5 billing, invoices and payments

No migration is needed: the existing five migrations already provide invoice
period uniqueness, invoice/payment idempotency keys, allocations and billing runs.
`pdf-lib` is the only new dependency. Existing `.env` values are unchanged.

## Endpoints and permissions

All responses use `{data}`, errors `{error,issues?}`. POSTs require JSON and the
configured Origin with session cookies, except bearer-authenticated cron calls.
ADMIN runs billing/demo; ADMIN and STAFF confirm/cancel invoices and record
payments. CUSTOMER can read/download only its own non-DRAFT invoices. Customers
cannot write financial records. Drafts are internal. Unauthorized ownership is 404.

| Endpoint | Input |
| --- | --- |
| POST `/api/billing/run` | `{ "idempotencyKey": "run-2026-10-31-001" }` |
| POST `/api/billing/demo` | `{ "subscriptionId": "EXPLICIT_DEMO_SUBSCRIPTION" }` |
| GET `/api/invoices` | `?page=1&pageSize=20&status=OPEN&overdue=true` (max pageSize 100) |
| GET `/api/invoices/{id}` | Items, payment summary, paid/outstanding minor amounts, overdue flag |
| GET `/api/invoices/{id}/pdf` | Downloadable application/pdf attachment |
| POST `/api/invoices/{id}/confirm` | `{}` |
| POST `/api/invoices/{id}/cancel` | `{}` |
| POST `/api/invoices/{id}/payments` | See below |

```json
{"idempotencyKey":"receipt-bank-0001","amountMinor":10000,"method":"BANK_TRANSFER","paidAt":"2026-10-31T09:00:00Z","reference":"bank-reference-0001","notes":"Manual bank receipt"}
```

Methods: CASH, BANK_TRANSFER, CARD, OTHER. CARD records an externally received
manual receipt; it does not charge a card. All amounts are integer minor units.
Payment date cannot be in the future. Reference is required (use a unique receipt
number for cash); same customer/method/reference is rejected across invoices.
Retry the identical body with the same key to retrieve the original payment.
Reusing a key with different fields returns 409. No overpayments, credit balances,
refunds, allocation edits or payment deletion are supported.

## Statuses and financial behavior

UI Draft = DRAFT, Confirmed = OPEN (PARTIALLY_PAID after a partial payment), Paid =
PAID, Cancelled = VOID. Confirming a zero-value invoice makes it PAID. Confirmation
sets issuedAt and dueAt using the subscription's current paymentTermsDays.
Due dates shown on a draft are provisional. Cancellation is limited to unpaid
DRAFT/OPEN invoices; confirmed payment allocations block cancellation. Cancellation
does not rewind the subscription or create a replacement invoice, and does not
refund consumed discount uses. VOID outstanding balance is zero.

Balances sum COMPLETED payment allocations; no independent stored balance can
drift. Overdue means OPEN/PARTIALLY_PAID, dueAt before now, balance remaining.
PDFs itemize stored prices, taxes, discounts, totals and current paid/balance values.
They use currency codes and integer minor-unit notation. The lightweight PDF font
is ASCII: unsupported description characters display as `?`. PDFs use customer ID
instead of mutable billing-address fields; this is a hackathon invoice export,
not jurisdiction-specific statutory invoice formatting.

## Billing rules and safety

One run processes at most 20 due subscriptions, one period each, in a single
transaction. Use a new job key for each batch/catch-up run; retry an interrupted
request with the same key. Completed keys return the original run. Errors roll
back the run, invoices, discount usage, and schedule advancement together; no
partial batch is committed. A failed batch can be retried after fixing its input.
No persistent FAILED record is written because it rolls back with the batch.

Only ACTIVE, unpaused subscriptions with active customers and due nextBillingAt
qualify. Subscription endsAt <= execution time prevents new billing; expired
subscriptions with all autoCloseAtExpiry flags become EXPIRED when encountered.
Other expired subscriptions are skipped. Already invoiced historical periods are
not changed. Final periods are capped at expiry and charged the full agreed
period price (no proration in this phase). Billing uses UTC original-start anchors
to avoid February-to-March drift. The first invoice period starts at nextBillingAt.

Unit amounts, quantities, descriptions, tax rates and effective discount amounts
come from subscription snapshots, never current plan prices. Phase 3 integer
tax calculation is reused. Discount eligibility was established at quotation time;
recurring billing retains the agreed discount amount but rechecks active flag,
effective date at period start and remaining uses. One use is consumed per rule
per invoice, not per line. Exhausted/expired/inactive discounts are omitted rather
than blocking billing. It does not reprice a contract from edited catalog rules.

An advisory job lock, per-subscription row locks, serializable transactions and
existing uniqueness constraints protect concurrent billing. Payment writes use
an advisory lock plus invoice row lock, including cross-invoice reference checks.
Serialization/unique conflicts retry up to four transaction attempts. No live
payment gateway or external queue is used.

## Cron and demo setup (optional environment values)

- `BILLING_CRON_SECRET`: random value of at least 32 characters. A POST to
  `/api/billing/run` may use `Authorization: Bearer <secret>` instead of cookies.
  Never use a NEXT_PUBLIC variable. With no secret set, session ADMIN access still
  works; cron bearer access is disabled. Cron accepts no caller-supplied time.
- `BILLING_DEMO_ENABLED=true`: enables demo in development only. Production rejects
  demo even if this variable is set.
- `BILLING_DEMO_SUBSCRIPTION_IDS`: comma-separated IDs of dedicated demo records.
  ADMIN must explicitly select an allowlisted ID. Demo simulates time reaching that
  subscription's next billing date and processes only that subscription. It never
  rewrites startsAt/endsAt or unrelated records. Repeated clicks can generate the
  next distinct period, but cannot duplicate a previously invoiced period. Use
  disposable demo subscriptions; invoices are real database records and retained.

Example local demo setup (same terminal as `npm run dev`):

```powershell
$env:BILLING_DEMO_ENABLED = 'true'
$env:BILLING_DEMO_SUBSCRIPTION_IDS = 'your-dedicated-demo-subscription-id'
npm run dev
```

## Manual flow and validation

1. Use Phase 4 to confirm/activate a subscription due now.
2. Sign in as ADMIN and POST billing/run with a new key. List resulting DRAFT.
3. Confirm invoice; record a partial payment, inspect balance, then record the
   remaining amount with a different key/reference. Status becomes PAID.
4. Retry each payment with its original key/body: no additional payment appears.
5. Download PDF. Customer login sees only that customer's issued invoices.
6. Try canceling a paid invoice or paying beyond the balance: 409.

`npm run test:billing` uses rolled-back PostgreSQL fixtures. The concurrency suite
`npm run test:billing:concurrent` requires TEST_DATABASE_URL for a dedicated
disposable database containing the five migrations' schema. It commits fixtures
there to exercise separate connections; never point it at the live database.
Other checks: db:validate, typecheck, lint, test:catalog, test:management,
test:smoke and build. No migrations or existing rows are reset/deleted.
