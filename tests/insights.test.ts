import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { health, healthInclude, simulate, simulationSchema } from "../src/lib/insights/domain";
import { insightsApi } from "../src/lib/insights/api";
import { Prisma } from "@prisma/client";
const plan = { unitAmountMinor: 12000, interval: "MONTH" as const, intervalCount: 1, currency: "LKR" };
const input = (overrides = {}) => simulationSchema.parse({ planId: "p", proposedPriceMinor: 15000, ...overrides });
test("baseline, discount, annual and daily normalization and zero counts", () => {
  const result = simulate(input({ discountBps: 1000, countChange: 2 }), plan, 10);
  assert.equal(result.baselineMrrMinor, 120000); assert.equal(result.simulatedMrrMinor, 162000); assert.equal(result.annualizedDifferenceMinor, 504000); assert.equal(result.percentageRevenueChange, 35); assert.equal(result.chart.length, 12);
  assert.equal(simulate(input(), { ...plan, interval: "YEAR" }, 10).baselineMrrMinor, 10000);
  assert.equal(simulate(input(), { ...plan, interval: "DAY", unitAmountMinor: 12 }, 1).baselineMrrMinor, 365);
  assert.equal(simulate(input(), { ...plan, interval: "WEEK", unitAmountMinor: 84 }, 1).baselineMrrMinor, 365);
  assert.equal(simulate(input({ subscriptionCount: 0 }), plan, 10).percentageRevenueChange, null);
  assert.equal(simulate(input({ currentPriceMinor: 1000 }), { ...plan, intervalCount: 2 }, 1).baselineMrrMinor, 500);
});
test("invalid scenarios rejected", () => {
  for (const overrides of [{ proposedPriceMinor: -1 }, { discountBps: 10001 }, { periodMonths: 0 }, { subscriptionCount: 1.2 }, { proposedPriceMinor: 1.1 }, { unexpected: true }]) assert.throws(() => input(overrides));
  assert.throws(() => simulate(input({ countChange: -2 }), plan, 1));
});
const now = new Date("2026-10-31T00:00:00Z");
const sub = () => ({ id: "s", customerId: "c", status: "ACTIVE", endsAt: null, canceledAt: null, cancelAtPeriodEnd: false, invoices: [] } as unknown as Prisma.SubscriptionGetPayload<{ include: typeof healthInclude }>);
test("health thresholds, no history, overdue, late history and expiry", () => {
  const s = sub(); assert.equal(health(s, now).score, 100);
  s.invoices = Array.from({ length: 3 }, (_, i) => ({ id: String(i), status: "OPEN", totalMinor: 100, dueAt: new Date("2026-10-01Z"), allocations: [{ amountMinor: 10, payment: { status: "COMPLETED", paidAt: new Date("2026-10-02Z") } }] }));
  const result = health(s, now); assert.equal(result.score, 30); assert.equal(result.category, "High Risk"); assert.equal(result.overdueCount, 3); assert.equal(result.lateInvoiceCount, 3);
  s.invoices = []; s.endsAt = new Date("2026-11-10Z"); assert.equal(health(s, now).score, 90);
  s.endsAt = now; assert.equal(health(s, now).score, 75); assert.equal(health(s, now).category, "Attention");
  s.endsAt = null; s.cancelAtPeriodEnd = true; assert.equal(health(s, now).score, 60);
  s.invoices = [{ id: "x", status: "OPEN", totalMinor: 1, dueAt: new Date("2026-10-01Z"), allocations: [] }]; assert.equal(health(s, now).score, 40);
  s.cancelAtPeriodEnd = false; assert.equal(health(s, now).score, 80); assert.equal(health(s, now).category, "Healthy");
});
test("ADMIN/STAFF read-only simulation and CUSTOMER isolation on every endpoint", async () => {
  let reads = 0;
  const db = { subscriptionPlan: { findUnique: async () => { reads++; return plan; } }, subscription: { count: async () => 10 } } as unknown as PrismaClient;
  for (const role of ["ADMIN", "STAFF"]) {
    const api = insightsApi(db, async () => ({ role }), "http://localhost");
    const response = await api(new Request("http://localhost/api/insights/revenue-simulation", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(input()) }));
    assert.equal(response.status, 200); assert.equal((await response.json()).data.baselineMrrMinor, 120000);
  }
  assert.equal(reads, 2); // The adapter exposes no create/update/delete methods.
  const api = insightsApi({} as PrismaClient, async () => ({ role: "CUSTOMER" }), "http://localhost");
  for (const path of ["revenue-simulation", "subscription-health", "subscription-health/summary", "subscription-health/other-customer"]) assert.equal((await api(new Request(`http://localhost/api/insights/${path}`))).status, 403);
});
test("staff health listing, summary, details and missing records", async () => {
  const fixture = sub();
  const db = { subscription: { findMany: async () => [fixture], count: async () => 1, findUnique: async ({ where }: { where: { id: string } }) => where.id === "s" ? fixture : null } } as unknown as PrismaClient;
  const api = insightsApi(db, async () => ({ role: "STAFF" }), "http://localhost");
  const call = async (path: string) => api(new Request(`http://localhost/api/insights/${path}`));
  const listing = await (await call("subscription-health?pageSize=1&customerId=c")).json();
  assert.equal(listing.data[0].score, 100); assert.equal(listing.meta.total, 1);
  const summary = await (await call("subscription-health/summary")).json();
  assert.equal(summary.data.categories.Healthy, 1); assert.equal(summary.data.averageScore, 100);
  assert.equal((await call("subscription-health/s")).status, 200);
  assert.equal((await call("subscription-health/missing")).status, 404);
  assert.equal((await call("subscription-health?pageSize=101")).status, 400);
});
