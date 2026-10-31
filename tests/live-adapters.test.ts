import { test } from "node:test";
import assert from "node:assert/strict";
import { allPages, createLiveAdapters } from "../src/lib/frontend/adapters/live";
import { createApiClients } from "../src/lib/frontend/api/clients";
import type { ApiTransport, RequestOptions } from "../src/lib/frontend/api/transport";
const actor = { id: "u", role: "CUSTOMER" as const, customerId: "c", name: "Customer", email: "c@example.com" };
test("live snapshot drains pages, hydrates lines and allocations without forbidden customer config reads", async () => {
 const paths: string[] = [];
 const transport: ApiTransport = { async request<T>(path: string) {
  paths.push(path); const url = new URL(path, "http://localhost"), route = url.pathname;
  if (route.endsWith('/taxes') || route.endsWith('/discounts')) throw Error('Customer must not read rules');
  let data: unknown = [];
  if (route === '/api/invoices') data = [{ id: 'i' }];
  if (route === '/api/subscriptions') data = [{ id: 's' }];
  if (route === '/api/quotations') data = [{ id: 'q' }];
  if (route === '/api/invoices/i') return { data: { id: 'i', customerId: 'c', currency: 'LKR', items: [{ description: 'Agreed', quantity: 1, unitAmountMinor: 100 }], payments: [{ amountMinor: 50, payment: { id: 'p', status: 'COMPLETED', paidAt: '2026-10-31T00:00:00Z', method: 'CASH', reference: 'receipt' } }] } } as T;
  if (route === '/api/subscriptions/s') return { data: { id: 's', items: [{ description: 'Agreed', quantity: 1, unitAmountMinor: 100, allowPause: false }] } } as T;
  if (route === '/api/subscriptions/s/history') return { data: { id: 's', items: [{ description: 'Agreed', quantity: 1, unitAmountMinor: 100, allowPause: false }], activities: [{ action: 'activate', toStatus: 'ACTIVE', createdAt: '2026-10-31T00:00:00Z' }] } } as T;
  if (route === '/api/quotations/q') return { data: { id: 'q', items: [], subscription: { id: 's' } } } as T;
  return { data, meta: { page: 1, pageSize: 100, total: (data as unknown[]).length } } as T;
 }, async download() { return new Blob(); } };
 const adapter = createLiveAdapters(createApiClients(transport));
 const result = await adapter.managementAdapter.load(actor);
 assert.equal(result.payments[0].amountMinor, 50); assert.equal(result.invoices[0].items[0].description, 'Agreed');
 assert.equal(result.quotations[0].subscriptionId, 's'); assert.equal(result.subscriptions[0].permissions.allowPause, false);
 assert.equal(result.subscriptions[0].history[0].status, 'ACTIVE'); assert.ok(paths.includes('/api/invoices/i'));
 const pages: number[] = []; assert.deepEqual(await allPages(async page => { pages.push(page); return { data: [page], meta: { page, pageSize: 1, total: 2 } }; }), [1,2]);
 assert.deepEqual(pages, [1,2]);
});
test("live mutations send exact wire payloads and propagate server errors", async () => {
 const calls: unknown[] = [];
 const transport: ApiTransport = { async request<T>(path: string, options?: RequestOptions) { calls.push({ path, ...options }); if (path.includes('quotations')) throw Error('Forbidden'); return { data: {} } as T; }, async download() { return new Blob(); } };
 const adapter = createLiveAdapters(createApiClients(transport));
 const payment = { idempotencyKey: 'stable-key', amountMinor: 50, method: 'CASH' as const, paidAt: '2026-10-31T00:00:00Z', reference: 'receipt' };
 await adapter.managementAdapter.recordPayment(actor, 'i', payment);
 assert.deepEqual(calls[0], { path: '/api/invoices/i/payments', method: 'POST', body: payment, signal: undefined });
 await assert.rejects(adapter.managementAdapter.quotationAction(actor, 'q', 'confirm'), /Forbidden/);
});
