# Phase 6 insights API

No migrations, environment changes, new dependencies or writes to business records.
All endpoints require a Better Auth session with ADMIN or STAFF role. CUSTOMER is
rejected before any database read, including requests for its own subscription.
Responses use `{data}` and errors `{error,issues?}`; responses are not cached.

## Revenue simulation

POST `/api/insights/revenue-simulation`, JSON and configured Origin required:

```json
{"planId":"PLAN_ID","proposedPriceMinor":15000,"currentPriceMinor":12000,"subscriptionCount":10,"discountBps":1000,"countChange":2,"periodMonths":12}
```

Only planId and proposedPriceMinor are required. Current price defaults to the
stored plan price; count defaults to distinct ACTIVE, unpaused subscriptions for
that plan, with active customers, started and not expired. Explicit zero is valid.
Count is a subscription count, not distinct people or item quantities. No currency
conversion: output uses the selected plan currency. Proposed price uses that
plan's billing interval. Overrides do not modify the plan or subscriptions.

Discount uses integer basis points (1000 = 10%), range 0–10000. Prices are integer
minor units 0–2147483647; counts 0–1000000; signed countChange must leave a valid
count; periodMonths 1–60. Unknown fields and fractional inputs are rejected.

Example data fields: baselineMrrMinor=120000, simulatedMrrMinor=162000,
monthlyDifferenceMinor=42000, annualizedDifferenceMinor=504000,
percentageRevenueChange=35. `chart` contains month-indexed baselineMinor and
simulatedMinor series. `assumptions` explains all calculations. Percentage change
is null for a zero baseline. Annualization always means 12 monthly differences,
independent of chart length. Aggregate money uses BigInt rational arithmetic,
rounded half up to integer minor units; unsafe result sizes are rejected.

Monthly intervalCount divides monthly revenue; annual divides by 12*intervalCount;
daily and weekly use a 365-day year / 12 months (weekly additionally divides by 7).
No taxes, baseline discounts, quantity mix, attrition curve, contractual snapshots
or seasonality are modeled. This is a catalog-price scenario, not booked revenue
or a forecast. Prices/counts remain constant through all chart months.

## Health

GET `/api/insights/subscription-health?page=1&pageSize=20&customerId=CUSTOMER_ID`
returns `{data:[health],meta:{page,pageSize,total}}`. Optional customerId filters
subscriptions for a customer; pageSize is capped at 100. All lifecycle statuses
are included. No customer PII or raw payment details are returned.

GET `/api/insights/subscription-health/{id}` returns `{data:health}` or 404.
GET `/api/insights/subscription-health/summary?customerId=CUSTOMER_ID` returns
`{data:{total,categories:{Healthy,Attention,"High Risk"},averageScore,asOf}}`.
Empty population yields null average. Summary scans in batches of 100 and may be
expensive at scale; it is intended for hackathon-sized data. Concurrent writes can
change results between batches or between list and count queries.

Health shape: subscriptionId, customerId, status, score, category, deductions
(array of code/points/reason/action), recommendedActions, overdueCount,
lateInvoiceCount, daysToExpiry, asOf, historyNote. Staff can inspect any customer's
health, consistent with existing management permissions. No public customer API
includes these results.

Deterministic rules, starting at 100 and clamping to zero:

- 20 per overdue invoice, capped at 40. Outstanding equals total less completed
  allocations paid by the evaluation time. Draft/void invoices are excluded.
- 5 per invoice with at least one completed payment after due date, capped at 20.
  Multiple late allocations count once. Future and non-completed payments ignored.
- 15 extra for at least three invoices with late payments.
- 10 for expiry within 30 days; 25 instead if end date is reached/passed.
- 40 once for cancelAtPeriodEnd, canceledAt or CANCELED status.

Healthy=80–100; Attention=50–79; High Risk=0–49. No invoice history means no payment
deduction. All issued history is considered, with no artificial activity metrics.
An overdue invoice with a late partial payment can contribute both deductions.
This is an explainable review aid, not a machine-learning prediction. Actions are
suggestions only; no notifications, recovery events or lifecycle changes occur.

## Run and validate

```powershell
npm run dev
npx tsx --test tests/insights.test.ts
npm run db:validate
npm run typecheck
npm run lint
npm run build
```

Send authenticated cookie requests from the configured Better Auth Origin. The
unit/API adapter tests use explicit fixtures without contacting or resetting Neon;
the simulation adapter deliberately exposes read operations only.
