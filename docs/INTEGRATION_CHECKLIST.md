# Phase 4: frontend integration preparation

## Status and activation boundary

Phase 3 passed typecheck, lint, all 16 tests (including every existing Phase1/2 test), and the production build before Phase4 began. The inspected backend snapshot is **f65630fce88acc1f428573ccf4922cf31fa15092** (`origin/dev/backend`). It is the locally available remote-tracking ref, not a fresh GitHub fetch.

All active exports in `src/lib/frontend/adapters/index.ts` remain mocks. **No real API client is constructed or imported by a screen, provider, layout, or active adapter.** `api/clients.ts` exports a factory only; `api/transport.ts` defaults integrationApproved to false and refuses all requests while disabled. Imports and factory construction cause no network activity. No environment variable automatically activates integration. Tests inject fake transports/fetchers only and never contact a real backend.

Do not enable the transport or switch adapter exports without separate, explicit integration approval. In particular, an approved read-only integration does not authorize real recovery sends or payment recording. The backend's send action can deliver actual SMTP email when configured, even in development. No real recovery send was tested or invoked here.

## Prepared clients

`createApiClients(transport)` contains typed functions for authentication, catalog (products/variants/plans/taxes/discounts), customers/profile/subscriptions, quotation templates, quotations, subscriptions/history, invoices/payment recording/PDF, financial analytics, simulation, health and recovery. No endpoint was invented for payment history, card charges, ML scores or forecasts. Billing job execution is deliberately excluded from the UI clients.

The shared transport prepares relative `/api/...` requests with same-origin cookies, no-store caching and JSON request bodies. The browser supplies Origin; no authorization token or secret header is stored. It handles JSON and Better Auth/custom errors, validation issues, Retry-After, network failure, caller cancellation, timeouts, non-JSON responses, and PDF downloads. It never automatically retries a mutation. A timeout/cancellation does not prove a server mutation was rolled back: inspect authoritative state before retrying, retaining the payment idempotency key.

Wire DTOs are separate from the existing mock view models. They use ISO strings, nullable dates, integer currency minor units and basis points. TypeScript types are not runtime schema validation; verify real response fixtures during integration. Better Auth's proxied success envelope is deliberately treated as opaque; login follows successful sign-in with the known authoritative `/api/auth/me` envelope. Registration does not log in. `currentUser` treats only401 as unauthenticated; configuration or network errors propagate.

## Confirmed contract differences and required mapping

| Area | Backend wire contract / integration work |
| --- | --- |
| Authentication | Registration returns `{user}` with CUSTOMER role. `/me` returns `{user}` including customerId. Cookies are HttpOnly; do not reuse sessionStorage demo IDs. Same-origin JSON POSTs are required. Reset uses `{email,redirectTo}` then `{token,newPassword}`; reset requests require SMTP. |
| Customer profile | `/api/customers/:id/profile` returns `{customer}`, not `{data}`. Nullable companyName/phone/address must be rendered safely. |
| Catalog | Customer projections omit internal costs, publication/activation fields and plan codes. Product/plan availability, active/published status and variant parents govern visibility. The UI's strict populated mock types are not raw public projections. |
| Discounts | The current mock form exposes percentage subscription discounts only. Backend supports FIXED/PERCENTAGE, PRODUCT/SUBSCRIPTION, dates, thresholds and usage limits. Do not send view-only names or fabricated fields. |
| Collections | Backend lists paginate (usually max100) and often omit items/relations. Compose detail reads or implement explicit pagination before claiming complete search/history. Current mock screens search their local rows. |
| Quotations | Authoritative totals, tax/discount allocation and eligibility come from the backend. Collection responses have no `subscriptionId` view field; detail includes optional `subscription:{id,number}`. Draft editing cannot remove existing lines. Conversion creates a confirmed DRAFT subscription, not an invoice. |
| Subscriptions | Permission flags are stored per subscription item. The mock `permissions` aggregate must derive from those agreed snapshots, not current catalog settings. History returns `{data:{...subscription,activities:[...]}}`, with activities paged and no separate history meta envelope. The mock `history` name is a frontend projection. |
| Invoices | List includes paidMinor/outstandingMinor but no line items. Detail includes items, overdue and payment allocations. Draft/legacy dates and subscriptionId can be null. Confirm/cancel return raw invoice records without computed balances: reread detail afterward. Invoice items use subscriptionItemId, not a planId field. |
| Payments | There is **no `/api/payments` history endpoint**. Compose invoice-detail allocations with invoice/customer context; nested payment projections omit full notes/idempotency keys/currency. Do not claim missing fields are returned. POST `/api/invoices/:id/payments` returns a Payment record and currency/customer derive from the invoice. Read invoice details again for balances. CARD means recording an existing payment, not charging a card. |
| Analytics | Trends are invoiced/collections/subscriptionsStarted, not historical MRR. Plan distributions use invoiced or MRR amounts, not counts. Renewals mean active subscriptions expiring within30days. Recent analytics omit customer/plan names. Snapshots and ranged totals have different semantics. |
| Simulation | One plan unit per distinct active subscription, not unique customers or item quantities. Input uses minor units, discountBps and signed countChange. Values stay constant across chart months; annualized difference is12 monthly differences. |
| Health | Only financial signals: overdue invoices, late completed payments, repeated delays, expiry and cancellation. No usage, support tickets, card-expiry model, confidence percentage, editable scoring weights or ML. Health responses omit names/PII; join permitted customer reads for display names. Search/category query parameters are not supported by these handlers. |
| Recovery | GET queue/detail/preview/history; POST `{}` for send/pause/resume/escalate. Eligible send stages3/7; escalation14+. No charge/retry endpoint. Reminder preview text uses raw minor units. Non-delivery preview yields SKIPPED/PREVIEWED and does not block another preview. UI local histories are not server delivery confirmations. |

## Backend-owned blockers (left untouched)

1. The inspected Prisma schema lacks AuthSession, AuthAccount, AuthVerification, AuthRateLimit and User.accounts although auth code/migrations use them. It also lacks catalog fields such as isPublished, sellingPriceMinor and minimumQuantity that handlers and migration004 reference. The backend owner must reconcile schema, migrations and generated client before integrated build/testing. This frontend task did not run Prisma or change those files.
2. No real backend, credentials, SMTP, PostgreSQL or session integration was exercised. Backend tests and live request/response checks remain necessary in an approved development environment.
3. Package manifests/configuration are shared surfaces. Preserve backend dependencies, scripts and Prisma generation hooks when the owner performs final integration. Do not replace the backend manifest with this frontend-only manifest. No dependency upgrades were performed here.
4. This checkout's framework reports a parent package-lock outside the repository. Builds pass; the warning is environmental. Root Next.js configuration was not changed to address it.
5. The fixed analytics and intelligence samples are independent from Phase2's mutable management mock store. Their labels disclose this. Real integration must use authoritative, consistently scoped backend reads instead of merging sample data.

## Final integration checklist — future approval required

- [ ] Review frontend changes and commit/push manually on dev/frontend. Keep main unchanged until agreed final integration.
- [ ] Have the backend owner resolve the schema/code mismatch and validate the generated client.
- [ ] Agree on the integration branch/baseline and reconcile package manifests, lockfile, TypeScript/Next/ESLint/styling configuration; preserve both test suites.
- [ ] Supply ignored server-only environment settings through the backend's normal setup. Never expose DB, SMTP, bootstrap or auth secrets through NEXT_PUBLIC variables.
- [ ] Serve frontend and API on the configured Better Auth origin; verify cookies, RBAC and customer ownership server-side. Do not rely on demo role routing.
- [ ] Obtain explicit approval before enabling the real transport or replacing any active mock adapter.
- [ ] Implement view-model mappings listed above, full pagination/empty handling, null dates and authoritative errors. Do not directly cast wire DTOs to ManagementSnapshot.
- [ ] Start with approved auth/read-only integration. Confirm real envelopes using representative fixtures, including nullable and role-projected records.
- [ ] Separately authorize mutation testing on isolated demo records. Use idempotency keys for payment recording. Keep real email sends/payment gateways disabled unless specifically approved.
- [ ] Run frontend and backend checks; test 401/403/404/409/429/503, customer isolation, stale updates, expired tokens, lifecycle eligibility and partial balances.
- [ ] Perform actual browser verification on mobile/tablet/desktop, keyboard navigation, dialog focus, chart overflow, reduced motion and screen-reader labels. No visual browser verification was available during these phases.

## Phase 4 polish

Added intelligence loading feedback and role workspace error boundaries, a helpful not-found page, explicit Customer intelligence permission-denied views, unique dialog title IDs, busy form semantics, keyboard-focusable scrollable table regions, empty-state announcements, readable long-period chart scrolling and chart exact-value alternatives. Existing auth flows, management methods, fixtures and business action behavior remain unchanged.

## HTTP smoke verification limit

The final production app returned HTTP200 for34 implemented page URLs, and `/` redirected to `/login`. An unknown top-level URL returned404. Invalid nested sections (`/admin/unknown-screen`, `/customer/products`) emitted Next's `NEXT_HTTP_ERROR_FALLBACK;404` marker but streamed HTTP200. Removing the newly proposed role loading boundaries did not change that result, so those boundaries were not retained. The existing section routing strategy remains intact; strict nested-route HTTP404 semantics should be reviewed at integration if required. This is recorded as a routing limitation, not a successful404 assertion. HTTP checks verify page responses, not hydrated interactions or visual layout.
