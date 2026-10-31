import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createApiTransport, ApiClientError, apiId, queryString, type ApiTransport, type RequestOptions } from "../src/lib/frontend/api/transport";
import { createApiClients } from "../src/lib/frontend/api/clients";
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...extra } });
function fetcher(fn: (path: string, init: RequestInit) => Promise<Response>): typeof fetch { return (async (input, init) => fn(String(input), init ?? {})) as typeof fetch; }
test("API integration defaults to disabled and construction never makes requests", async () => {
 let calls = 0; const transport = createApiTransport({ fetcher: fetcher(async () => { calls++; return json({}); }) });
 const clients = createApiClients(transport); assert.equal(calls, 0);
 await assert.rejects(clients.analytics.overview({ currency: "LKR" }), (e: unknown) => e instanceof ApiClientError && e.code === "INTEGRATION_DISABLED");
 await assert.rejects(clients.invoices.pdf("example")); assert.equal(calls, 0);
 const active = readFileSync(new URL("../src/lib/frontend/adapters/index.ts", import.meta.url), "utf8");
 assert.ok(!active.includes("api/")); assert.match(active, /mockAuthAdapter/); assert.match(active, /mockManagementAdapter/); assert.match(active, /mockIntelligenceAdapter/);
});
test("transport sends same-origin credentialed JSON and encodes queries without exposing secrets", async () => {
 const seen: { path: string; init: RequestInit }[] = [];
 const api = createApiClients(createApiTransport({ integrationApproved: true, fetcher: fetcher(async (path, init) => { seen.push({ path, init }); return json({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }); }) }));
 await api.catalog.list("products", { search: "Acme & Co", pageSize: 20 });
 assert.equal(seen[0].path, "/api/catalog/products?search=Acme+%26+Co&pageSize=20"); assert.equal(seen[0].init.credentials, "same-origin"); assert.equal(seen[0].init.body, undefined); assert.equal(seen[0].init.cache, "no-store");
 await api.recovery.action("invoice/a", "pause"); assert.equal(seen[1].path, "/api/finance/recovery/invoice%2Fa/pause"); assert.equal(seen[1].init.method, "POST"); assert.equal(seen[1].init.body, "{}");
 assert.equal(new Headers(seen[1].init.headers).get("Content-Type"), "application/json"); assert.equal(new Headers(seen[1].init.headers).get("Authorization"), null); assert.equal(new Headers(seen[1].init.headers).get("Origin"), null);
 assert.equal(queryString({ status: undefined, page: 2 }), "?page=2"); assert.throws(() => apiId(".."));
});
test("transport normalizes custom and Better Auth errors and does not retry mutations", async () => {
 for (const status of [400, 401, 403, 409, 429, 503]) {
  let calls = 0; const transport = createApiTransport({ integrationApproved: true, fetcher: fetcher(async () => { calls++; return json({ error: "Rejected", issues: [{ path: ["name"], message: "Required" }] }, status, { "retry-after": "60" }); }) });
  await assert.rejects(transport.request("/api/example", { method: "POST", body: {} }), (e: unknown) => e instanceof ApiClientError && e.status === status && e.message === "Rejected" && e.issues.length === 1 && e.retryAfter === "60"); assert.equal(calls, 1);
 }
 const authError = createApiTransport({ integrationApproved: true, fetcher: fetcher(async () => json({ code: "INVALID", message: "Invalid credentials" }, 401)) });
 await assert.rejects(authError.request("/api/auth/sign-in/email"), /Invalid credentials/);
 const html = createApiTransport({ integrationApproved: true, fetcher: fetcher(async () => new Response("private debug output", { status: 503 })) });
 await assert.rejects(html.request("/api/example"), (e: unknown) => e instanceof ApiClientError && !e.message.includes("private debug"));
});
test("transport supports cancellation, timeouts, malformed responses and PDF downloads", async () => {
 const pending = fetcher(async (_path, init) => new Promise((_resolve, reject) => { init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); }));
 const timeout = createApiTransport({ integrationApproved: true, fetcher: pending, timeoutMs: 5 }); await assert.rejects(timeout.request("/api/example"), (e: unknown) => e instanceof ApiClientError && e.code === "TIMEOUT");
 const controller = new AbortController(); controller.abort(); await assert.rejects(timeout.request("/api/example", { signal: controller.signal }), (e: unknown) => e instanceof ApiClientError && e.code === "CANCELLED");
 const malformed = createApiTransport({ integrationApproved: true, fetcher: fetcher(async () => new Response("not json")) }); await assert.rejects(malformed.request("/api/example"), (e: unknown) => e instanceof ApiClientError && e.code === "PROTOCOL");
 const pdf = createApiTransport({ integrationApproved: true, fetcher: fetcher(async () => new Response("%PDF-test", { headers: { "content-type": "application/pdf" } })) }); assert.equal((await pdf.download("/api/invoices/id/pdf")).type, "application/pdf");
 await assert.rejects(pdf.request("https://example.com/api/data")); await assert.rejects(pdf.request("/api/../outside"));
});
test("auth normalizes sign-in through authoritative me, while signup never auto-signs-in", async () => {
 const paths: string[] = []; const user = { id: "id", name: "Name", email: "name@example.test", role: "CUSTOMER", customerId: "customer" };
 const api = createApiClients(createApiTransport({ integrationApproved: true, fetcher: fetcher(async path => { paths.push(path); return json(path.endsWith("/me") ? { user } : { success: true }); }) }));
 assert.deepEqual(await api.auth.login({ email: user.email, password: "Example!Demo" }), user); assert.deepEqual(paths, ["/api/auth/sign-in/email", "/api/auth/me"]);
 paths.length = 0; await api.auth.register({ name: "Name", email: user.email, password: "Example!Demo" }); assert.deepEqual(paths, ["/api/auth/sign-up/email"]);
 const unauthorized = createApiClients(createApiTransport({ integrationApproved: true, fetcher: fetcher(async () => json({ error: "Unauthorized" }, 401)) })); assert.equal(await unauthorized.auth.currentUser(), null);
});
test("client endpoint families use inspected paths and wire inputs only", async () => {
 const requests: { path: string; body: unknown; method: string }[] = [];
 const transport: ApiTransport = { async request<T>(path: string, options?: RequestOptions) { requests.push({ path, body: options?.body, method: options?.method ?? "GET" }); return { data: [] } as T; }, async download() { return new Blob(); } };
 const api = createApiClients(transport);
 await api.customers.profile("customer"); await api.customers.subscriptions("customer", { page: 2 });
 await api.quotations.convert("quote", { startsAt: "2026-10-31T00:00:00Z" }); await api.subscriptions.history("sub", { pageSize: 10 });
 await api.subscriptions.renew("sub", { endsAt: "2027-10-31T00:00:00Z" }); await api.invoices.recordPayment("invoice", { amountMinor: 1000, idempotencyKey: "test-key", method: "CASH", paidAt: "2026-10-31T00:00:00Z", reference: "REF" });
 await api.analytics.trends({ currency: "LKR" }); await api.simulation.run({ planId: "plan", proposedPriceMinor: 1000 }); await api.health.detail("sub"); await api.recovery.preview("invoice");
 assert.deepEqual(requests.map(r => r.path), ["/api/customers/customer/profile", "/api/customers/customer/subscriptions?page=2", "/api/quotations/quote/convert", "/api/subscriptions/sub/history?pageSize=10", "/api/subscriptions/sub/renew", "/api/invoices/invoice/payments", "/api/finance/analytics/trends?currency=LKR", "/api/insights/revenue-simulation", "/api/insights/subscription-health/sub", "/api/finance/recovery/invoice/preview"]);
 assert.deepEqual(requests[4].body, { endsAt: "2027-10-31T00:00:00Z" }); assert.ok(!("currency" in (requests[5].body as object)));
});
