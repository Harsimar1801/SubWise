# Phase 2: core management frontend

Run `npm run dev`, open http://localhost:3000, and sign in using the existing demo accounts from [FRONTEND.md](FRONTEND.md). No new packages or environment variables are required.

## Screens and permissions

Admin and Staff have `/admin/{section}` and `/staff/{section}` for products, plans, customers, quotations, subscriptions, invoices, and payments. Admin can create/edit catalog configuration; Staff can read it. Both can create customers and quotations, convert accepted quotations, update eligible subscription lifecycles, and record demo payments.

Customer routes support `/customer/{quotations,subscriptions,invoices,payments}` and contain only documents linked to the current mock customer. They are read-only. Other sections return not found. These are demonstration permissions, not production security; backend authorization remains authoritative at integration.

The same monochromatic card/table layouts, responsive shell, scrollable tables, native modal dialogs, status badges, search, and filters are shared across screens. Prices are entered in currency major units and converted exactly to integers at the adapter boundary. Variant effective prices are product price plus additional price. Plan prices are independent recurring prices.

## Local state and boundaries

`src/lib/frontend/fixtures/management.ts` seeds one disposable module store. `src/lib/frontend/adapters/management.mock.ts` implements the browser-safe `ManagementAdapter` interface. Its exported factory provides isolated stores for tests. All UI writes go through the adapter selection point in `adapters/index.ts`; no APIs, databases, network calls or storage persistence are added.

Changes survive client-side navigation in the same tab, including payment balances and lifecycle history. A browser reload restores fixtures. Logging out does not reset the shared demo dataset, allowing role demonstrations against the same local edits. Newly registered customer users have no seeded financial documents. The Phase 1 Admin analytics dashboard is a separate fixed sample and is not recomputed from management edits.

Quotation inputs capture plan IDs, quantities, agreed unit prices, common tax/discount rule selections, validity, payment terms and notes. The demo validates currency, common cadence, active catalog records, and minimum quantities. It shows agreed subtotal before tax/discount. It deliberately does not reproduce authoritative pricing, discount eligibility/redemption, tax rounding, invoicing or recurring scheduling. Seeded invoice totals are illustrative fixture values.

Accepted, valid quotations convert once to confirmed DRAFT subscriptions. Activation is separate. Lifecycle permissions are snapshotted from selected plans. Actions update statuses and local activity only: no billing schedule, invoice generation, email, proration, refund, card charge or automatic expiry job executes.

Payment recording accepts partial settlement up to the remaining balance and updates local paid/outstanding/status fields. Duplicate references, future payment dates and overpayment are rejected. Same-key retries are idempotent. This is a UI demo of recording completed funds, not a live payment gateway.

## Backend mapping

Contracts follow the inspected origin/dev/backend snapshot; backend-owned files remain untouched.

| UI adapter operation | Future backend operation |
| --- | --- |
| saveProduct / saveVariant / savePlan | POST/PATCH `/api/catalog/{products,variants,plans}[/{id}]` |
| saveCustomer | POST `/api/customers` |
| createQuotation | POST `/api/quotations` |
| quotationAction | POST `/api/quotations/{id}/{send,confirm,reject}` |
| convertQuotation | POST `/api/quotations/{id}/convert` |
| subscriptionAction | POST `/api/subscriptions/{id}/{activate,pause,resume,renew,close}` |
| recordPayment | POST `/api/invoices/{id}/payments` |
| load | Compose authorized catalog/customer/document reads and invoice allocation details |

The snapshot is a frontend facade, not a new backend endpoint. `Subscription.permissions` represents combined per-item permission snapshots; `history` maps subscription activities. Payment `invoiceId` is a view projection from allocations. No standalone payment-history API was assumed. Future adapters should compose paginated collections without silently dropping rows and normalize envelopes/dates. Backend input validation and monetary totals replace mock behavior at integration.

## Manual verification

1. Sign in as Admin. Create a product, add/edit variants, and check effective prices. Edit the product's base price; confirm variant prices reflect the change. Currency is locked on existing products.
2. Create/edit a plan. Check billing unit/count, minimum quantity, recurring price, publication and lifecycle permission flags. Parent variant stays fixed after creation.
3. Open a customer, inspect contact information and related subscriptions, then follow the related-subscriptions link. Create a sample customer if desired.
4. Create a quotation with two lines. Select product/variant/plan, quantity, tax, discount and prices. Try an invalid minimum quantity or mixed billing cadence and confirm validation rejects it.
5. Open the new quotation, mark it sent (no email), confirm it, then convert it. Follow the subscription link; verify DRAFT status. Activate, pause, resume, renew with a later expiry, then close. Check disabled-action explanations and activity rows. Verify no invoice appears from these actions.
6. Open INV-1001. It starts partially paid: total LKR 3,540.00, paid LKR 1,000.00, outstanding LKR 2,540.00. Record LKR 500.00 with a new reference. Verify paid LKR 1,500.00 and outstanding LKR 2,040.00. Settle the remainder and check PAID status.
7. Check the Payments page and invoice payment rows. Try overpayment, duplicate references, zero amount or a future payment date; confirm rejection without an extra payment.
8. Sign out and sign in as Staff in the same tab: catalog is read-only while operational actions remain available. Sign in as Customer: only Acme's documents appear and mutation controls are absent.
9. Test search/status filters, empty search results, mobile navigation, active sidebar state, breadcrumbs, Escape/cancel, and table scrolling at narrow widths. Reload and verify fixtures are restored.

Validation commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
