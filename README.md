# SubWise

SubWise is a full-stack subscription management platform that brings customer operations, recurring billing, payment tracking, and explainable financial insights into one workspace.

## Features

- **Subscription and plan management** — products, variants, recurring plans, and subscription lifecycle controls.
- **Customer management** — customer records and access to each customer's own subscriptions and invoices.
- **Quotations** — prepare proposals, apply taxes and discounts, and convert accepted quotations into subscriptions.
- **Recurring billing and invoicing** — transaction-safe billing runs, itemized invoices, payment terms, and PDF downloads.
- **Payment tracking** — record manual payments, support partial settlements, and track outstanding balances.
- **What-If Revenue Simulator** — compare pricing, discount, and subscription-count scenarios without changing live records.
- **Subscription Health Scoring** — explainable scores based on payment history, overdue balances, expiry, and cancellation signals.
- **Smart Payment Recovery** — overdue tracking, reminder previews, manual SMTP reminders, pause/resume controls, and staff escalation.
- **Admin, Staff, and Customer portals** — role-based access backed by server-side authorization.

## Tech stack

Next.js · React · TypeScript · Tailwind CSS · Prisma · Neon PostgreSQL · Better Auth

## Run locally

Requires **Node.js 22.12+**, npm, and a PostgreSQL database.

1. Install dependencies:

   ```powershell
   npm ci
   ```

2. For a new checkout, copy `.env.example` to `.env` only if an environment file does not already exist. Configure `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` for your development environment. Keep credentials out of version control.

3. Apply the existing migrations to your development database and start the application:

   ```powershell
   npm run db:deploy
   npm run dev
   ```

Open [localhost:3000](http://localhost:3000). Register a Customer account or sign in with an existing account. Initial administrator creation uses `npm run auth:bootstrap`; see the [authentication setup](docs/AUTHENTICATION.md) for the required bootstrap variables. There are no default credentials.

SMTP is optional for core account access and required for password-reset email delivery. Recovery supports local previews without SMTP. Payments are recorded manually; no live payment gateway is integrated.

## Documentation and checks

- [Database and local setup](docs/LOCAL_SETUP.md)
- [Authentication and administrator setup](docs/AUTHENTICATION.md)
- [API contract](docs/FRONTEND_API_CONTRACT.md)
- [Live frontend/backend integration](docs/LIVE_INTEGRATION.md)
- [Billing and payments](docs/BILLING.md)
- [Revenue simulation and health scoring](docs/INSIGHTS.md)
- [Financial analytics and payment recovery](docs/FINANCE.md)

```powershell
npm run typecheck
npm run lint
npm run test:frontend
npm run build
```

Database integration tests have separate prerequisites; authentication and concurrent billing tests require an isolated `TEST_DATABASE_URL`. See the linked documentation before running them.
