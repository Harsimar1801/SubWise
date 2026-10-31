# Phase 3: intelligence frontend

Admin and Staff navigation now includes Revenue Simulator, Subscription Health and Payment Recovery. Customer navigation excludes them and their adapters reject CUSTOMER before data reads. All existing core management screens and authentication flows are preserved.

## Simulator

The controls map to POST `/api/insights/revenue-simulation`: planId, proposedPriceMinor, subscriptionCount, countChange, discountBps, periodMonths. The plan supplies baseline price/currency/cadence; currentPriceMinor is supported by the adapter as an optional override. UI labels use subscriptions rather than unique customers because the backend counts distinct active subscriptions and models one plan unit per subscription.

The typed mock uses the inspected backend's BigInt rational arithmetic, integer minor units, half-up monthly rounding, and exact monthly/annual/weekly/daily normalization. Prices/counts stay constant in each chart month. Annualized difference is always 12 × monthly difference. A zero baseline yields null percentage change. No taxes, quantity mix, attrition, future growth, or ML predictions are introduced. The chart has an exact-values table and an accessible description.

## Health

The fixed intelligence portfolio (31 October 2026 at 12:00 UTC) has three subscriptions showing Healthy, Attention and High Risk. The mock computes scores from financial evidence; scores are not arbitrary stored ratings. Summary counts, average and distribution derive from the same rows.

Rules mirror the backend: overdue invoices (20 each, cap40), invoices receiving late completed payments (5 each, cap20), repeated delays (15 at three), expiry soon (10) or reached (25), and cancellation (40). Clamp at zero. Categories are Healthy80–100, Attention50–79, HighRisk0–49. Draft/void invoices and future/non-completed payments are excluded. No invoice history means no payment deductions. Details show evidence, points and suggested staff reviews without taking action.

## Recovery

The overdue queue includes day3, day7 and day14+ examples. UTC calendar dates determine overdue days. Only OPEN/PARTIALLY_PAID invoices with outstanding balances are eligible. Preview text and DTO fields follow the backend reminder template, including its raw minor-unit wording.

Send is available at stages3/7 when unpaused and without pending/succeeded reminders at that stage. Day14+ permits one escalation for staff review. Pause/resume controls reflect completion status. There is no retry-card-charge action.

**No email is ever sent.** The simulate-send action records SKIPPED with metadata.delivery=PREVIEWED, mirroring the inspected backend's nonproduction preview path. As on that path, a skipped preview does not count as a sent reminder or prevent another preview. Pause/resume/escalation append local events only. State resets on reload.

Intelligence fixtures are a dedicated sample portfolio, separate from Phase2's operational mock store and Phase1's fixed analytics snapshot. Editing core subscriptions or recording core payments does not change this snapshot. This separation is explicitly labeled and avoids changing established Phase2 behavior; integrated clients will use backend reads.

## Verification

1. Sign in as Admin or Staff. Open Revenue Simulator, select monthly/annual plans, enter prices/counts/discount, and run. Compare exact table values to totals; each month must be constant. Test zero baseline/count, a decrease, and 100% discount. Change inputs and verify the stale-result notice. Reset and rerun.
2. Open Health. Search a customer/subscription, filter all categories, inspect each record, and check deductions against the score. Healthy=100, Attention=70 and HighRisk=20 for the fixed evidence.
3. Open Recovery. Preview day3/day7 reminders, simulate send and inspect the non-delivery history. Pause, confirm sending is disabled, resume, then preview again. Day14+ disables send and allows escalation once.
4. Sign in as Customer; intelligence destinations must be absent and their adapters reject access. Core document views remain available.
5. Check mobile table scrolling, stacked panels, keyboard focus, Escape/Cancel, and chart exact-values disclosure.

Automated checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Phase3 adds calculation, evidence, recovery and permission tests while retaining all Phase1/2 tests. No browser visual verification is claimed unless separately recorded.
