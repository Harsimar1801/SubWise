# SubWise backend: Phase 1

## Requirements and setup (PowerShell)

- Node.js 22.12+ (Node 22 LTS recommended), npm, PostgreSQL 16+.
- Next.js 16 with TypeScript; Prisma 6.19 is pinned for its simple PostgreSQL setup.
- This checkout has no frontend design. Only `src/app/api/health/route.ts` is exposed;
  the frontend teammate can add pages/layouts without replacing backend modules.

```powershell
npm ci
Copy-Item .env.example .env
notepad .env
```

Set `DATABASE_URL` to an existing **dedicated development database** with valid
credentials. Prisma CLI reads `.env`; Next.js also reads `.env`. Avoid conflicting
`DATABASE_URL` values in `.env.local` or the shell. URL-encode special characters
in database credentials. Do not commit `.env`.

If PostgreSQL is installed locally, an administrator can provision it through
`psql -U postgres` using the following SQL (choose your own password):

```sql
CREATE ROLE subwise LOGIN PASSWORD 'replace-with-a-local-password';
CREATE DATABASE subwise OWNER subwise;
```

Alternatively, if Docker Desktop is running and port 5432 is free:

```powershell
$env:SUBWISE_DB_PASSWORD = Read-Host 'Local PostgreSQL password'
docker run --name subwise-postgres -e POSTGRES_USER=subwise -e "POSTGRES_PASSWORD=$env:SUBWISE_DB_PASSWORD" -e POSTGRES_DB=subwise -p 5432:5432 -v subwise_pgdata:/var/lib/postgresql/data -d postgres:16
Remove-Item Env:SUBWISE_DB_PASSWORD
```

Update `.env` with the chosen credentials. If another PostgreSQL server already
uses port 5432, use that server with a dedicated database or change Docker's host
port and the URL. No database/container is automatically provisioned by this repo.

Apply the checked-in migrations, verify them, then start the app:

```powershell
npm run db:validate
npm run db:deploy
npm run db:status
npm run db:seed
npm run dev
```

The seed verifies connectivity without inserting mock records or default users.
`db:deploy` applies the existing migrations without requiring a shadow database.
For **future schema changes**, use `npm run db:migrate -- --name descriptive_name`
against a development database; Prisma Migrate dev needs permission to create a
shadow database (or a separately configured shadow database). Do not use `db push`
as a replacement for tracked migrations.

## Validation and health

```powershell
npm run db:validate
npm run typecheck
npm run lint
npm run build
# After a successful build, npm start serves the production app.
curl.exe -i http://localhost:3000/api/health
```

`GET /api/health` executes `SELECT 1`, disables caching, and returns:

- HTTP 200: `{"status":"ok","service":"subwise","database":"up"}`
- HTTP 503 on missing/invalid config or unavailable database:
  `{"status":"degraded","service":"subwise","database":"unavailable"}`

This public endpoint checks connectivity, not migration completeness. Use
`db:status` to verify the schema deployment. It never includes database error
details or credentials in its response. No authentication is implemented yet;
there are no public CRUD or billing endpoints.

Prisma generation, TypeScript, lint, and the Next.js build do not require a live
database. Schema validation needs a syntactically valid `DATABASE_URL`; for an
offline validation session only, you may set a disposable shell value:

```powershell
$env:DATABASE_URL = 'postgresql://unused:unused@localhost:5432/subwise?schema=public&connect_timeout=5'
npm run db:validate
Remove-Item Env:DATABASE_URL
```

This placeholder does not establish or verify a database connection. Migration
deployment/status and seed require real credentials. There is no test runner yet;
the available Phase 1 checks are the commands above and HTTP smoke tests.

## Schema conventions and integration contract

- CUID string primary keys; UTC `timestamptz` timestamps; one role per user.
  A customer may exist before receiving a login; `Customer.userId` is optional
  and unique. Authentication credentials/providers are deferred to a later phase.
- Every `*Minor` amount is an integer in the currency's minor unit (e.g. LKR
  100.50 = 10050). PostgreSQL `Int` caps each field at 2,147,483,647 minor units.
  Future APIs must reject overflow and use safe intermediate arithmetic. Currency
  fields are uppercase three-letter codes; actual currency validity and exponent
  rules must be validated in future APIs. No floating-point money is stored.
- `*Bps` fields use basis points (10000 = 100%). Taxes are exclusive, one tax and
  one discount rule per item for hackathon simplicity. Fixed discounts have a
  currency; percentage discounts have basis points instead.
- Product -> variant -> plan. Quotation/subscription items reference a plan.
  Plans describe recurrence and price; quotation items snapshot recurrence and
  price. A subscription has one billing cadence, and its item plans must match
  that cadence. Issued invoices snapshot descriptions, quantities, unit prices,
  effective taxes, and discounts so catalog/rule edits do not rewrite history.
- Item `discountAmountMinor` is the total line discount, not a per-unit amount.
  Line totals = quantity * unit price - discount + tax. Document totals sum lines.
  Database checks enforce basic ranges and document/line arithmetic; no totals
  are automatically calculated in this phase.
- Unique document numbers and idempotency keys support later retry-safe billing
  and payment recording. Invoice period uniqueness adds a recurring-bill guard;
  nullable periods still require the idempotency key for one-off invoices.
- Payments can cover multiple invoices through allocations. Outstanding balances
  will be derived from eligible payments/allocations, not a second stored balance.
- Restrictive foreign keys protect financial history. Deactivate catalog/users
  instead of deleting referenced records. There is no cascading financial delete.
- SQL CHECK constraints live in the integrity migration because Prisma 6 cannot
  express them in its schema. Preserve them in later migrations.
- Future workflows must transactionally enforce matching customer/currency across
  quotation, subscription, invoice and payment; allocation sums and payment state;
  plan/cadence consistency; line-sum/document consistency; authorized state
  transitions; normalized email; date validity; and rule applicability. These
  cross-record business validations are intentionally not workflows in Phase 1.

## Scope

All requested entities, relations, enums, indexes, foundation/integrity migrations, reusable
server-only Prisma client, health endpoint, and empty seed foundation are present.
Authentication, authorization, CRUD, quotation conversion, recurring scheduling,
tax/discount calculation, payment workflows, analytics, simulator, health scores,
and recovery execution are deferred to their requested phases. Tailwind is not
installed because Phase 1 contains no UI; coordinate styling with the frontend.

`package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`,
`eslint.config.mjs`, `.gitignore`, and `src/app/` are shared integration surfaces.
Keep this backend's `src/app/api/`, `src/lib/`, `prisma/`, environment conventions,
and scripts when combining the frontend later. Existing README content is retained.

Reference: [Prisma Migrate documentation](https://docs.prisma.io/docs/orm/v6/prisma-migrate/getting-started).
