# Frontend development

This branch is a root-level Next.js 16.4.3 / React 19.2 / TypeScript 5.9 application. It uses npm, Tailwind 4, bundled Inter fonts and Lucide SVG icons. No backend services, API routes, database configuration or Prisma hooks are included.

## Run locally

Use Node 22.12+ and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. No environment variables are required. Login is a mock development adapter; the build remains a demonstration and is not suitable for real accounts. Never enter real credentials.

Demo accounts share password `SubWise!Demo`:

| Workspace | Email | Route |
| --- | --- | --- |
| Admin | admin@subwise.demo | /admin |
| Staff | staff@subwise.demo | /staff |
| Customer | customer@subwise.demo | /customer |

Authentication screens: /login, /register, /forgot-password, /reset-password.
Registration creates only a mock CUSTOMER and requires a separate login. Credentials and newly registered users live in module memory and disappear on reload; only the selected mock account ID is kept in sessionStorage. Role routing is a UI demonstration, not a security boundary.

Forgot password sends no email. Its sample link resets only the built-in customer account. The demo token is single-use until reload. Reset clears the current tab's session. No real reset-token issuance, cross-tab session revocation, backend authentication or API requests occur.

## Manual verification

1. Sign in with the Admin demo account. Check KPI cards, chart, plan breakdown, watchlist, expiry renewals and recent transactions.
2. Search INV-840; filter Paid/Open/Partial; clear the search and filter. View an invoice, close using Escape, and confirm focus returns to the trigger.
3. Export sample CSV; inspect currency and integer amount_minor values.
4. Resize to 375px, 768px and desktop widths. Open/close navigation, scroll tables, and use the profile sign-out action.
5. Try invalid credentials; register a sample customer; verify registration does not sign in. Sign in without reloading the page.
6. Request a sample reset, follow its link, test mismatched/weak passwords, reset successfully, and sign in with the changed customer password without reloading.
7. Open a reset page without a token and with an invalid token; verify errors. Sign in as Staff and Customer; verify their shell-only pages.
8. Visit /admin while signed out and as a Customer; verify redirects. These checks demonstrate navigation only.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

## Backend integration handoff

Contracts were inspected at origin/dev/backend commit f65630f. Keep the same root src/ structure, @/* alias and framework versions. Preserve backend src/app/api/, src/lib/{auth,billing,catalog,finance,insights,management}, Prisma, migrations and environment conventions at final integration. Backend-owned schema/code mismatch must be resolved by its owner before integrated checks.

Frontend code lives in components/, features/ and lib/frontend/. The single adapter selection point is src/lib/frontend/adapters/index.ts. No client should import backend server-only modules. AuthAdapter normalizes differing Better Auth/custom envelopes; AnalyticsAdapter mirrors /api/finance/analytics/{overview,trends,plans,renewals,recent}.

Real auth integration must use same-origin credentialed requests and the authoritative /api/auth/me response; never trust the mock session ID or UI role. Public registration has no role field and does not auto-login. Password reset uses redirectTo, token and newPassword. Backend password policy is 9–128 characters with uppercase, lowercase and a special character.

Financial DTOs use integer minor units, explicit ISO currency and UTC timestamps. The fixed LKR demo snapshot is 31 October 2026, with May–October reporting history. Mock adapters reject unsupported currencies/date ranges rather than fabricating results. Plan shares reflect MRR; chart bars show collections; renewal rows reflect expiry within 30 days. The detailed recent invoice list is a subset of aggregate reporting history. No historical MRR, AI predictions, payment gateway, card retries or fabricated business actions are exposed.

Final integration must reconcile package.json/package-lock.json, tsconfig.json, next.config.ts, eslint.config.mjs, .gitignore, README and styling config. Preserve backend dependencies and Prisma generation hooks at that point; this frontend branch intentionally has none. Do not overwrite the backend manifest with the frontend manifest. Keep backend authentication and financial tests alongside tests/frontend.test.ts.

The Stitch export remains unchanged. Phase 2 adds the core management pages and functional role-aware navigation; see [Phase 2 verification and API mapping](PHASE_2.md). Intelligence, recovery, reports and settings destinations remain disabled for later phases. The Admin analytics dashboard remains a separate fixed mock snapshot; local management changes do not recompute it.
