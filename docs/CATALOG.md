# Phase 3 catalog API

No new environment variables. Use existing Better Auth cookies and app origin.
Run `npm run db:deploy`, `npm run dev`. All requests require an active session.
POST/PATCH require `Origin` equal to the configured app origin and JSON bodies.

## Routes

For each resource `products`, `variants`, `plans`, `taxes`, `discounts`:

- `GET /api/catalog/{resource}` lists records, supporting `page=1&pageSize=20&search=name`.
  pageSize is capped at 100; search is case-insensitive. Variants/discounts accept
  `productId`; plans accept `variantId`.
- `GET /api/catalog/{resource}/{id}` retrieves one record.
- `POST /api/catalog/{resource}` creates a record (201).
- `PATCH /api/catalog/{resource}/{id}` partially edits it (200).
- Deactivate/reactivate using PATCH `{ "isActive": false }` / `true`.
  Products/plans publish using PATCH `{ "isPublished": true }`.
- No hard-delete endpoints are provided.

Responses: `{data: record}`, or `{data: records, meta:{page,pageSize,total}}`.
Errors: `{error, issues?}`; 400 invalid input, 401 unauthenticated, 403 forbidden,
404 missing/hidden record, 409 duplicate/conflicting update, 413 oversized input,
415 non-JSON, 503 unavailable database. Unknown input fields are rejected.

ADMIN can read/write everything. STAFF can read all configuration but cannot
write. CUSTOMER can read only active, published products/plans and active variants
whose parent product is active/published. Plans must also have an active variant
and be within their availability dates. Hidden IDs return 404. Customers cannot
read tax/discount configuration, internal product costs, or internal notes.

## Create examples (required fields)

```json
{"name":"ERP service","type":"SERVICE","sellingPriceMinor":100000,"costPriceMinor":50000,"currency":"INR"}
```

Product optional: description, internalNotes, isActive, isPublished. Type is
SERVICE or GOODS. Existing/migrated products and plans default to unpublished.

```json
{"productId":"PRODUCT_ID","sku":"ERP-ODOO","name":"Odoo","additionalPriceMinor":56000}
```

Variant optional: isActive, attributes (object of string values). Effective
catalog unit price is product sellingPriceMinor + variant additionalPriceMinor:
100000 + 56000 = 156000 minor units (₹1,560). Product currency and variant parent
cannot be changed after creation; create a replacement when needed.

```json
{"variantId":"VARIANT_ID","code":"ERP-MONTHLY","name":"Monthly ERP","currency":"INR","unitAmountMinor":156000,"interval":"MONTH","intervalCount":1,"trialDays":0,"minimumQuantity":1}
```

Plan optional: description, availableFrom, availableUntil (ISO timestamps with
timezone or null), isActive, isPublished, autoCloseAtExpiry, allowPause,
allowResume, allowRenew, allowEarlyClosure. Interval: DAY/WEEK/MONTH/YEAR;
intervalCount and minimumQuantity must be positive. End cannot precede start.
Currency must match the product. Variant parent is immutable. Plan price is an
explicit recurring price, independent of subsequent catalog price edits. Expiry
closure and permissions are settings for Phase 4; no subscription is closed here.

```json
{"code":"VAT18","name":"VAT","rateBps":1800}
```

Tax optional: isActive. 10000 basis points = 100%. Exclusive tax is calculated
after discount; `taxAmount(netMinor, rateBps)` rounds half up using BigInt.

```json
{"code":"SAVE10","name":"Ten percent","type":"PERCENTAGE","percentageBps":1000,"minimumPurchaseMinor":10000,"minimumQuantity":1,"scope":"SUBSCRIPTION","maximumUses":100}
```

For FIXED, use amountMinor and currency, with percentageBps null/absent. For
PERCENTAGE, use percentageBps with amountMinor/currency null/absent. PRODUCT scope
requires productId; SUBSCRIPTION requires productId null/absent. Optional startsAt,
endsAt, isActive, maximumUses (null means unlimited). On type/scope changes clear
irrelevant fields explicitly. Usage count is server-managed and cannot be patched.

`discountAmount(rule,input,now)` verifies dates (inclusive), active status,
currency, amount/quantity thresholds, scope/product and available uses. Ineligible
discounts return zero; eligible discounts are capped at the subtotal. Product
discounts receive the eligible product subtotal/quantity; subscription discounts
receive the whole subscription subtotal/quantity. Preview never increments usage.
Future billing must call `redeemDiscount(tx,...)` inside the invoice transaction;
it atomically increments usage with optimistic concurrency and rejects exhausted
or concurrently modified rules. There is no redemption API in Phase 3.

All money is nonnegative integer minor units, maximum 2147483647 per field; no
floating-point currency storage. Helpers reject arithmetic overflow. No stacking,
proration, quotation, subscription, recurring invoice, or payment workflow is added.

## Manual verification

1. Sign in as ADMIN with POST `/api/auth/sign-in/email` in Postman (retain cookie).
2. Create a product using the example above; copy its ID into a variant request.
3. Create the plan using the returned variant ID, then tax/discount rules.
4. List/search and retrieve records; PATCH names, publication and active flags.
5. Sign in as STAFF: GET succeeds; POST/PATCH returns 403.
6. Sign in as CUSTOMER: unpublished product/plan IDs return 404. Publish them as
   ADMIN; CUSTOMER GET now succeeds without costPriceMinor or internalNotes.
   Deactivating the parent product hides its variants/plans as well.

## Tests and migration

`npm run test:catalog` runs focused domain/permissions tests and real PostgreSQL
API integration tests. The integration test uses a single transaction and rolls
back all product/variant/plan/discount fixtures, including usage increments. It
does not create users or touch existing catalog records.

`npm run typecheck`, `npm run lint`, `npm run db:validate`, `npm run build` are
the other checks. The existing full auth test suite requires a separate test DB;
its environment/setup is documented in AUTHENTICATION.md.

Migration `20261031000400_catalog` adds fields/defaults, a discount-to-product
foreign key/index and range/date/scope CHECK constraints. It preserves the first
three migrations and existing rows. Existing legacy discount rules default to
subscription scope, unlimited uses, and zero recorded usage. Migration generation
must use the actual Phase 2 schema, since Git HEAD may still contain Phase 1.
