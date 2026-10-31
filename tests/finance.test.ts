import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { recoveryState, RecoveryInvoice, reminder } from "../src/lib/finance/recovery-domain";
import { financeApi } from "../src/lib/finance/api";
import { analytics } from "../src/lib/finance/analytics";
import { recoveryAction } from "../src/lib/finance/recovery";
const now = new Date("2026-10-31T01:00:00Z");
function fixture(days = 3) { return { id: "i", number: "INV-test", customerId: "c", customer: { name: "Customer", email: "fixture@example.com" }, subscriptionId: null, status: "OPEN", currency: "LKR", totalMinor: 10000, dueAt: new Date(now.getTime() - days * 86400000), allocations: [], recoveryEvents: [] } as unknown as RecoveryInvoice; }
test("UTC days, stages, partial/full payments, cancellation and pause", () => {
  for (const days of [2, 3, 7, 14]) { const s = recoveryState(fixture(days), now); assert.equal(s.stage, days === 2 ? 0 : days); assert.equal(s.canSend, days === 3 || days === 7); }
  const i = fixture(); i.dueAt = new Date("2026-10-28T23:59:59Z"); assert.equal(recoveryState(i, now).daysOverdue, 3);
  i.allocations = [{ amountMinor: 4000, payment: { status: "COMPLETED" } }] as RecoveryInvoice["allocations"];
  assert.equal(recoveryState(i, now).outstandingMinor, 6000); assert.match(reminder(i, now).text, /6000/);
  i.allocations[0].amountMinor = 10000; assert.equal(recoveryState(i, now).completed, true); assert.equal(recoveryState(i, now).canSend, false);
  i.status = "VOID"; assert.equal(recoveryState(i, now).eligible, false);
  i.status = "OPEN"; i.allocations = []; i.recoveryEvents = [{ type: "RETRY", status: "SUCCEEDED", metadata: { action: "pause" } }] as unknown as RecoveryInvoice["recoveryEvents"];
  assert.equal(recoveryState(i, now).canSend, false);
});
test("successful or pending stage reminders block duplicates", () => {
  for (const status of ["SUCCEEDED", "PENDING"]) { const i = fixture(); i.recoveryEvents = [{ type: "REMINDER", status, metadata: { stage: 3 } }] as unknown as RecoveryInvoice["recoveryEvents"]; assert.equal(recoveryState(i, now).canSend, false); }
});
test("customers denied all internal routes before data access", async () => {
  const api = financeApi({} as PrismaClient, async () => ({ id: "c", role: "CUSTOMER" }), "http://localhost");
  for (const path of ["analytics/overview", "recovery", "recovery/other/history", "recovery/other/send"]) assert.equal((await api(new Request(`http://localhost/api/finance/${path}`, { method: path.endsWith("send") ? "POST" : "GET" }))).status, 403);
});
test("financial totals, cash separation, range, MRR and plan attribution", async () => {
  const invoice = { ...fixture(), issuedAt: new Date("2026-10-10Z"), allocations: [{ amountMinor: 4000, payment: { status: "COMPLETED" } }], items: [{ totalMinor: 10000, subscriptionItem: { planId: "p", plan: { name: "Plan" } } }] };
  const subscription = { id: "s", status: "ACTIVE", startsAt: new Date("2026-10-01Z"), endsAt: null, customer: { isActive: true }, items: [{ planId: "p", plan: { name: "Plan" }, quantity: 2, unitAmountMinor: 60000, discountAmountMinor: 0 }], interval: "YEAR", intervalCount: 1, invoices: [] };
  const db = { invoice: { findMany: async () => [invoice] }, payment: { findMany: async ({ where }: { where: { paidAt: { gte: Date; lt: Date } } }) => { assert.equal(where.paidAt.gte.toISOString(), "2026-10-01T00:00:00.000Z"); assert.equal(where.paidAt.lt.toISOString(), "2026-11-01T00:00:00.000Z"); return [{ amountMinor: 4000, paidAt: new Date("2026-10-20Z") }]; } }, subscription: { findMany: async () => [subscription] } } as unknown as PrismaClient;
  const result = await analytics(db, "LKR", new Date("2026-10-01Z"), new Date("2026-11-01Z"), now);
  assert.equal(result.overview.invoicedMinor, 10000); assert.equal(result.overview.paymentsReceivedMinor, 4000); assert.equal(result.overview.outstandingMinor, 6000); assert.equal(result.overview.mrrMinor, 10000); assert.equal(result.plans[0].invoicedMinor, 10000); assert.equal(result.trends[0].subscriptionsStarted, 1);
});
test("delivery failures and previews logged accurately without SMTP", async () => {
  for (const outcome of ["PREVIEWED", "FAIL"] as const) {
    const invoice = fixture(3); invoice.dueAt = new Date(Date.now() - 3 * 86400000);
    const tx = { $queryRaw: async () => [], invoice: { findUnique: async () => invoice, findUniqueOrThrow: async () => invoice }, recoveryEvent: { create: async ({ data }: { data: object }) => { const event = { ...data, id: "event" }; invoice.recoveryEvents.push(event as unknown as RecoveryInvoice["recoveryEvents"][number]); return event; }, update: async ({ data }: { data: object }) => data } };
    const db = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) } as unknown as PrismaClient;
    const result = await recoveryAction(db, "i", "send", "staff", async () => { if (outcome === "FAIL") throw Error("provider secret"); return "PREVIEWED"; });
    assert.equal(result.status, outcome === "FAIL" ? "FAILED" : "SKIPPED"); assert.ok(!JSON.stringify(result).includes("provider secret"));
  }
});

test("ADMIN and STAFF can preview without delivery; invalid ranges rejected", async () => {
  for (const role of ["ADMIN", "STAFF"]) {
    const db = { invoice: { findUnique: async () => fixture() } } as unknown as PrismaClient;
    const api = financeApi(db, async () => ({ id: "staff", role }), "http://localhost", async () => { throw Error("Preview must not deliver"); });
    const preview = await api(new Request("http://localhost/api/finance/recovery/i/preview"));
    assert.equal(preview.status, 200); assert.equal((await preview.json()).data.delivery, "PREVIEW_ONLY");
    assert.equal((await api(new Request("http://localhost/api/finance/analytics/overview?from=2026-11-01T00:00:00Z&to=2026-10-01T00:00:00Z"))).status, 400);
    assert.equal((await api(new Request("http://localhost/api/finance/recovery/i/send", { method: "POST", headers: { origin: "http://evil.example" } }))).status, 403);
  }
});

