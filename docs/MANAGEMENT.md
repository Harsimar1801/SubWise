# Phase 4 API: customers, quotations, subscriptions

No new environment variables or dependencies. Existing Better Auth cookies,
DATABASE_URL, direct migration URL and BETTER_AUTH_URL remain in use. Never
overwrite `.env` to install this phase. Run `npm run db:deploy`, then `npm run dev`.

Every endpoint validates a session using Phase 2 helpers. POST/PATCH require
`Content-Type: application/json` and `Origin` matching the configured app origin.
Bodies are capped at 64 KiB. Responses use `{data}` and lists add
`meta:{page,pageSize,total}`. Collections support page/pageSize (max 100), search;
quotation/subscription collections also support customerId/status. Unknown query
and body fields are rejected. Errors use `{error,issues?}`: 400 validation,
401 unauthenticated, 403 forbidden, 404 missing/hidden, 409 conflict or concurrent
change (reload/retry), 405 unsupported operation, 413 size, 415 content type,
503 configuration/database unavailable. No internal error/credential details.

## Customers

- GET/POST `/api/customers`
- GET/PATCH `/api/customers/{id}`
- GET `/api/customers/{id}/subscriptions`
- Existing GET `/api/customers/{id}/profile` remains unchanged.

ADMIN and STAFF manage all customers. CUSTOMER list/read is restricted to its
own linked record, and PATCH permits only name, phone, companyName, billingAddress.
Other customer IDs return 404. Customers cannot create customer records or edit
identity, currency, tax ID, linkage or activation flags.

```json
{"name":"Acme","email":"billing@acme.example","phone":"123","companyName":"Acme Ltd","billingAddress":{"street":"Main Street","city":"Colombo"},"currency":"LKR"}
```

Optional staff fields: taxId, userId, isActive. PATCH `{isActive:false}` deactivates;
there is no hard delete. Email is normalized and checked case-insensitively.
An explicit userId must refer to an active CUSTOMER user with the same email and
no other linked customer. Linked identity cannot be reassigned/unlinked or its
email changed through these APIs. Currency is locked once quotations/subscriptions
exist. Registration already creates a Customer; reuse that record instead of
creating another. This prevents claiming someone else's financial records.

## Templates

ADMIN/STAFF only: GET/POST `/api/quotation-templates`, GET/PATCH
`/api/quotation-templates/{id}`. Content is structured, validated configuration:

```json
{"name":"Standard monthly","content":{"validityDays":30,"items":[{"planId":"PLAN_ID","quantity":2,"taxRuleId":"TAX_ID","discountRuleId":"DISCOUNT_ID"}]}}
```

Optional description/isActive. Products and variants are derived from planId.
Content includes 1–100 lines, each optionally specifying unitAmountMinor (agreed
override), taxRuleId and discountRuleId. Current plans and prices are validated
when saving/using templates. A template doesn't create live subscriptions.

## Quotations

ADMIN/STAFF write; CUSTOMER can only read its own documents:

- GET/POST `/api/quotations`, GET/PATCH `/api/quotations/{id}`
- POST `/api/quotations/{id}/send` with `{}`: DRAFT -> SENT
- POST `/api/quotations/{id}/confirm` with `{}`: SENT -> ACCEPTED
- POST `/api/quotations/{id}/reject` with `{}`: SENT -> REJECTED
- POST `/api/quotations/{id}/expire` with `{}`: unconverted DRAFT/SENT/ACCEPTED
  whose validity has elapsed -> EXPIRED
- POST `/api/quotations/{id}/convert`: approved quotation -> confirmed subscription

```json
{"customerId":"CUSTOMER_ID","items":[{"planId":"PLAN_ID","quantity":2,"taxRuleId":"TAX_ID"}],"validUntil":"2027-01-31T00:00:00Z","paymentTermsDays":14,"notes":"Customer-facing terms"}
```

Or supply customerId/templateId and optionally override items/validUntil. Default
validity is template validity or 30 days. Creation timestamp/number are generated
server-side. Staff confirmation is the approval flow; it is not a customer-signature
or online acceptance feature. Only DRAFT can be edited. Existing line identities
are retained; lines can be edited/appended but cannot be removed. Reject and create
a replacement if reducing line count is needed. No hard document deletion.

Pricing reuses Phase 3 integer/basis-point functions. Active products/variants,
eligible active plans, common cadence/currency and minimum quantities are checked.
Descriptions, unit prices, cadence, tax rate, effective discount and totals are
snapshotted. Overrides are staff-controlled, nonnegative minor units. Subscription
discounts must be selected on all lines and apply once to the subtotal; product
discount groups must match the product. Amount/quantity thresholds apply to the
group. Allocation is proportional with integer remainder handling, then exclusive
tax is calculated on each discounted line. No preview/conversion consumes usage.

Expiry is enforced against current time even before status is explicitly marked
EXPIRED. Rejected/expired documents cannot be confirmed or converted. Conversion
requires an active customer and currently eligible products/plans, preserves the
agreed pricing snapshots, and rejects cadence changes. QuotationId uniqueness and
serializable transactions prevent duplicate/partial conversion.

```json
{"startsAt":"2026-10-31T00:00:00Z","endsAt":"2027-10-31T00:00:00Z"}
```

Conversion returns 201, unique SUB-number, quotation link and DRAFT status with
confirmedAt set and planned nextBillingAt equal to startsAt. Only ACTIVE records
are eligible for future billing. paymentTermsDays is copied (0–365 days). It creates no invoices.

## Subscription lifecycle

- GET `/api/subscriptions`, GET `/api/subscriptions/{id}`
- GET `/api/subscriptions/{id}/history` (activities paged with page/pageSize)
- PATCH `/api/subscriptions/{id}`: confirmed DRAFT only; startsAt, endsAt
  (nullable), paymentTermsDays. Item editing belongs to draft quotation revision.
- POST `/api/subscriptions/{id}/{action}`: ADMIN/STAFF only.

| Action | Body | Rules |
| --- | --- | --- |
| activate | `{}` | confirmed DRAFT, active customer, start reached, not expired -> ACTIVE |
| pause | `{}` | ACTIVE and every line allows pause -> PAUSED; billing date cleared |
| resume | `{}` | PAUSED, active customer, before expiry, every line allows resume -> ACTIVE |
| renew | `{endsAt:"ISO timestamp"}` | ACTIVE/PAUSED/EXPIRED, every line allows renewal; must extend expiry beyond now |
| close | `{}` | DRAFT, or ACTIVE/PAUSED after expiry or with all lines allowing early closure -> CANCELED |
| expire | `{}` | ACTIVE/PAUSED, expiry reached, every line autoCloseAtExpiry -> EXPIRED |

Lifecycle permissions are snapshotted from plans at confirmation, so later catalog
changes do not silently remove agreed capabilities. CANCELED never reactivates.
EXPIRED can reopen only through documented renew: start/period/nextBillingAt reset
to renewal time. Active renewal extends expiry; paused renewal preserves pause.
No proration/credits are calculated. Renewed expired subscriptions do not backfill
the closed interval. Concurrent actions return 409 rather than applying twice.

Initial activation sets nextBillingAt to startsAt (the first unbilled occurrence),
and period end to the next cadence boundary, capped at expiry. Resume skips paused
occurrences and selects the next future boundary anchored at the original start.
Calendar operations use UTC and clamp month-end/leap days (Jan 31 -> Feb 28/29;
anchor-based March boundary returns March 31). No fixed 30-day month assumption.
Permissions and date eligibility are enforced on every action.

The expire action implements automatic-closure **eligibility and execution**;
there is no scheduler in this phase. A future authorized job may invoke the same
service for eligible subscriptions. Each successful edit/transition appends an
immutable SubscriptionActivity with actor, action and prior/new status. CUSTOMER
reads/history are scoped to its own customer ID; it cannot mutate lifecycle state.

## Migration and validation

`20261031000500_management` adds payment terms, confirmedAt, per-item lifecycle
permission snapshots and SubscriptionActivity with foreign key/index. Existing
statuses and records are preserved. Existing legacy drafts without confirmedAt
cannot activate through these APIs; use the quotation-confirmation workflow.

`npm run test:management` runs domain tests and real PostgreSQL API/service tests
inside a rolled-back transaction. No fixtures are retained, existing data is not
deleted, and no invoices/payments are written. Other checks: db:validate,
typecheck, lint, test:catalog, test:smoke and build. Full auth integration tests
still require a separate test database (see AUTHENTICATION.md).

Manual check: sign in as STAFF, create/reuse a customer, create a quotation with
an active plan, send, confirm, convert (copy the returned subscription ID), then
activate/pause/resume/renew/close as allowed. GET history after each action. Sign
in as CUSTOMER and verify only its customer/quotations/subscriptions are visible
and writes to another customer's account return 404/403.
