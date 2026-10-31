# SubWise
SubWise is an intelligent subscription management platform that simplifies recurring billing, automates invoicing, tracks payments, and provides smart revenue insights with subscription health scoring, revenue simulation, and automated payment recovery.

## Frontend development (Phase 1)

The root application uses Next.js 16.4.3, React 19.2, TypeScript and Tailwind CSS. Node.js 22.12+ is required.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. All authentication and financial information is explicitly mocked; no backend calls or environment variables are required. Use `admin@subwise.demo`, `staff@subwise.demo`, or `customer@subwise.demo` with password `SubWise!Demo`.

See [frontend setup, verification and integration notes](docs/FRONTEND.md). Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` before handoff.
