# Frontend API contract — Phase 7.5

This is a map of the actual REST handlers, not a promise of one universal envelope.
Detailed schemas/examples remain in AUTHENTICATION.md, CATALOG.md, MANAGEMENT.md,
BILLING.md, INSIGHTS.md and FINANCE.md in this directory.

## Transport, identity and errors

Use same-origin `/api/...`, cookie sessions, `credentials: "include"`, JSON bodies
and Content-Type application/json for mutations. Browser Origin must match the
origin of BETTER_AUTH_URL. Cross-origin CORS is not implemented. All date strings
are ISO timestamps; send offsets/Z. IDs are opaque strings. Money fields ending
Minor are integer currency minor units; Bps means 1/100 percent (1800 = 18%).
Never send role/customer identity claims to authorize a request.

Most business routes return `{data:record}` or `{data:records,meta:{page,pageSize,total}}`.
Most pages default page=1/pageSize=20, max100. PDF is binary, not JSON. No universal
success flag or universal error-code field exists. Common errors:
400 validation, 401 no eligible session, 403 role/origin, 404 absent/hidden ownership,
409 transition/duplicate conflict, 413 body too large, 415 media type, 429 auth
throttling, 503 configuration/database/provider unavailable. Custom errors use
`{error:string,issues?:[{path,message}]}`; Better Auth may use its own format.

Auth exceptions:
- POST `/api/auth/sign-up/email`: `{name,email,password}` -> 201 `{user}`; no auto-login.
- POST `/api/auth/sign-in/email`: `{email,password}` -> Better Auth body + cookie.
- POST `/api/auth/sign-out`: `{}` -> Better Auth body; cookie cleared.
- GET `/api/auth/me`: `{user:{id,name,email,role,customerId}}`; authoritative UI identity.
- GET `/api/auth/get-session`: Better Auth session format; not the app role authority.
- POST `/api/auth/request-password-reset`: `{email,redirectTo}`; SMTP required.
- POST `/api/auth/reset-password`: `{token,newPassword}`; revokes existing sessions.
- POST `/api/admin/staff`: ADMIN only, `{name,email,password}` -> 201 `{user}`.
- GET `/api/customers/{id}/profile`: `{customer:{id,name,email}}` (legacy auth wrapper).
- GET `/api/health`: public `{status,service,database}`; not a data API.
Passwords: 9–128 characters with uppercase, lowercase and a non-whitespace special
character. Registration always CUSTOMER. Email ownership verification is not provided.

## Catalog and management

| Routes | Permissions and shape |
| --- | --- |
| GET/POST `/api/catalog/{products,variants,plans,taxes,discounts}` | GET paginated; POST ADMIN only, 201 data |
| GET/PATCH `/api/catalog/{resource}/{id}` | PATCH ADMIN only; no DELETE |
| GET/POST `/api/customers`; GET/PATCH `/api/customers/{id}` | ADMIN/STAFF write; CUSTOMER reads own and may PATCH safe profile fields |
| GET `/api/customers/{id}/subscriptions` | Own customer or staff; paginated |
| GET/POST `/api/quotation-templates`; GET/PATCH `/{id}` | ADMIN/STAFF only |
| GET/POST `/api/quotations`; GET/PATCH `/{id}` | ADMIN/STAFF write; CUSTOMER own reads |
| POST `/api/quotations/{id}/{send,confirm,reject,expire}` | ADMIN/STAFF, `{}` |
| POST `/api/quotations/{id}/convert` | ADMIN/STAFF, `{startsAt,endsAt?}` -> 201 DRAFT subscription |
| GET `/api/subscriptions`; GET/PATCH `/{id}`; GET `/{id}/history` | CUSTOMER own reads; staff edits confirmed drafts |
| POST `/api/subscriptions/{id}/{activate,pause,resume,close,expire}` | ADMIN/STAFF, `{}` |
| POST `/api/subscriptions/{id}/renew` | ADMIN/STAFF, `{endsAt}` |

Catalog STAFF is read-only. CUSTOMER sees published active catalog projections and
cannot read taxes/discounts or internal costs/notes. Lists accept page/pageSize;
management adds search/customerId/status where meaningful. Catalog search and
productId/variantId filters depend on resource. Unknown query/body fields may be
rejected; do not send global dashboard filters to every route.

Quotation example: `{customerId,items:[{planId,quantity,taxRuleId?,discountRuleId?,unitAmountMinor?}],paymentTermsDays:14}`.
Use templateId instead of items for a saved template. Statuses: quotation DRAFT,
SENT, ACCEPTED, REJECTED, EXPIRED; subscription DRAFT, TRIALING, ACTIVE, PAUSED,
PAST_DUE, CANCELED, EXPIRED. Conversion does not activate or invoice. Only DRAFT
quotations editable. Lifecycle actions depend on snapshotted permissions.

## Billing and invoices

| Route | Contract |
| --- | --- |
| POST `/api/billing/run` | ADMIN or configured cron bearer; `{idempotencyKey}` -> data BillingRun |
| POST `/api/billing/demo` | ADMIN, nonproduction, flag+allowlist; `{subscriptionId}` |
| GET `/api/invoices` | Paginated, optional status/overdue=true; amounts include paidMinor/outstandingMinor |
| GET `/api/invoices/{id}` | data invoice, items, payments, paidMinor/outstandingMinor/overdue |
| GET `/api/invoices/{id}/pdf` | application/pdf attachment |
| POST `/api/invoices/{id}/{confirm,cancel}` | ADMIN/STAFF, `{}` |
| POST `/api/invoices/{id}/payments` | ADMIN/STAFF, payment payload below |

Payment payload: `{idempotencyKey,amountMinor,method,paidAt,reference,notes?}`.
Methods CASH/BANK_TRANSFER/CARD/OTHER. Reference required. Positive amount must not
exceed outstanding. Date cannot be future. Reuse the identical key/body on retries;
changing fields with the same key is 409. Same customer/method/reference is blocked
across invoices. There is no standalone customer payment-history API: own invoice
details include safe payment summaries. CUSTOMER sees only own non-DRAFT invoices.

UI Draft=DRAFT; Confirmed=OPEN/PARTIALLY_PAID; Paid=PAID; Cancelled=VOID.
UNCOLLECTIBLE is also stored/readable. Do not submit UI labels as enum values.
Payment/confirm/cancel responses return the stored record in data, not automatically
refreshed balances. Fetch invoice detail after a successful mutation. First/replayed
payment responses can differ in allocation inclusion; depend on stable payment ID
and financial fields. Only unpaid DRAFT/OPEN invoices can be cancelled.

## Insights and finance (ADMIN/STAFF only)

- POST `/api/insights/revenue-simulation`: `{planId,proposedPriceMinor,currentPriceMinor?,subscriptionCount?,discountBps?,countChange?,periodMonths?}`.
  data includes baselineMrrMinor, simulatedMrrMinor, monthlyDifferenceMinor,
  annualizedDifferenceMinor, percentageRevenueChange (nullable), chart and assumptions.
- GET `/api/insights/subscription-health`: paginated, optional customerId.
- GET `/api/insights/subscription-health/summary`: data total/categories/averageScore/asOf.
- GET `/api/insights/subscription-health/{id}`: data score/category/deductions/actions.
  Categories Healthy/Attention/High Risk; no customer access, even to own score.
- GET `/api/finance/recovery`: paginated overdue state list.
- GET `/api/finance/recovery/{invoiceId}`: state/history.
- GET `/api/finance/recovery/{invoiceId}/{preview,history}`: message preview or events.
- POST `/api/finance/recovery/{invoiceId}/{send,pause,resume,escalate}`: `{}`, data event.
  Event SUCCEEDED means SMTP accepted; SKIPPED + PREVIEWED is not sent; FAILED is
  failure; PENDING is uncertain/in progress. Re-fetch state after actions.
- GET `/api/finance/analytics/{overview,trends,plans,renewals,recent}`:
  currency (default LKR), from/to ISO timestamps, max366-day positive range [from,to).
  plans/renewals support page/pageSize. Other shapes are metric object, chart array,
  and recent `{invoices,payments}` object. See FINANCE.md for exact metric fields.

Invoiced revenue is not cash. Range filters affect issuedAt/paidAt/startsAt;
MRR/balances/risk/renewals are current snapshots. Currency never silently combined.
Simulator MRR is a catalog-price scenario; financial MRR uses subscription snapshots.
Daily/weekly normalize through a 365-day year /12; annual divides by12.
