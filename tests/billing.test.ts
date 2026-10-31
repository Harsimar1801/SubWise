import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { billSubscription, invoiceAction, recordPayment, balance } from "../src/lib/billing/service";
import { billingApi } from "../src/lib/billing/api";
import { resumeBilling } from "../src/lib/management/domain";
import { invoicePdf } from "../src/lib/billing/pdf";
import { PDFDocument } from "pdf-lib";
loadEnvConfig(process.cwd());
test("anchored billing month end and leap year", () => {
  assert.equal(resumeBilling(new Date("2024-01-31Z"), "MONTH", 1, new Date("2024-02-29Z")).toISOString(), "2024-03-31T00:00:00.000Z");
});
test("billing authorization denies customers and disables demo", async () => {
  const api = billingApi({} as PrismaClient, async () => ({ id: "x", role: "CUSTOMER", customerId: "y" }), { origin: "http://localhost", production: false });
  assert.equal((await api(new Request("http://localhost/api/billing/run", { method: "POST" }))).status, 403);
  const admin = billingApi({} as PrismaClient, async () => ({ id: "x", role: "ADMIN", customerId: null }), { origin: "http://localhost", production: true, demoEnabled: "true" });
  assert.equal((await admin(new Request("http://localhost/api/billing/demo", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{}" }))).status, 403);
});
test("real PostgreSQL billing and payment flow with rollback", async () => {
  const db = new PrismaClient(); const rollback = new Error("rollback");
  try { await assert.rejects(db.$transaction(async tx => {
    const tag = randomUUID(); const now = new Date("2024-01-31T00:00:00Z");
    const user = await tx.user.create({ data: { name: "Billing fixture", email: `${tag}@example.com`, role: "STAFF" } });
    const customer = await tx.customer.create({ data: { name: "Fixture", email: `c-${tag}@example.com` } });
    const product = await tx.product.create({ data: { name: "Fixture" } });
    const variant = await tx.productVariant.create({ data: { name: "Fixture", sku: tag, productId: product.id } });
    const plan = await tx.subscriptionPlan.create({ data: { name: "Fixture", code: tag, variantId: variant.id, unitAmountMinor: 99999 } });
    const discount = await tx.discountRule.create({ data: { code: tag, name: "Fixture", type: "FIXED", currency: "LKR", amountMinor: 1000, maximumUses: 1 } });
    const sub = await tx.subscription.create({ data: { number: tag, customerId: customer.id, status: "ACTIVE", startsAt: now, nextBillingAt: now, paymentTermsDays: 14, items: { create: { planId: plan.id, description: "Agreed item", position: 0, quantity: 2, unitAmountMinor: 10000, taxRateBps: 1800, discountAmountMinor: 1000, discountRuleId: discount.id, autoCloseAtExpiry: true } } } });
    const first = await billSubscription(tx, sub.id, now); assert.ok(first); assert.equal(first.totalMinor, 22420); assert.equal(first.periodEnd?.toISOString(), "2024-02-29T00:00:00.000Z");
    assert.equal(await billSubscription(tx, sub.id, now), null);
    await invoiceAction(tx, first.id, "confirm", now);
    const payment = { idempotencyKey: tag, amountMinor: 10000, method: "BANK_TRANSFER", paidAt: now.toISOString(), reference: tag };
    const paid = await recordPayment(tx, first.id, payment, user.id, now);
    assert.equal((await recordPayment(tx, first.id, payment, user.id, now)).id, paid.id);
    assert.equal((await tx.invoice.findUniqueOrThrow({ where: { id: first.id } })).status, "PARTIALLY_PAID");
    await assert.rejects(recordPayment(tx, first.id, { ...payment, idempotencyKey: tag + "bad", reference: tag + "bad", amountMinor: 99999 }, user.id, now));
    await assert.rejects(invoiceAction(tx, first.id, "cancel", now));
    await recordPayment(tx, first.id, { ...payment, idempotencyKey: tag + "full", reference: tag + "full", amountMinor: 12420 }, user.id, now);
    assert.equal((await balance(tx, first.id, first.totalMinor)).outstandingMinor, 0);
    assert.equal((await tx.invoice.findUniqueOrThrow({ where: { id: first.id } })).status, "PAID");
    const second = await billSubscription(tx, sub.id, new Date("2024-02-29Z")); assert.ok(second); assert.equal(second.discountTotalMinor, 0); assert.equal(second.periodEnd?.toISOString(), "2024-03-31T00:00:00.000Z");
    await invoiceAction(tx, second.id, "cancel"); await assert.rejects(invoiceAction(tx, second.id, "confirm"));
    await tx.subscription.update({ where: { id: sub.id }, data: { status: "PAUSED" } }); assert.equal(await billSubscription(tx, sub.id, new Date("2025-01-01Z")), null);
    await tx.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", endsAt: new Date("2024-04-01Z") } }); assert.equal(await billSubscription(tx, sub.id, new Date("2025-01-01Z")), null);
    assert.equal((await tx.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status, "EXPIRED");
    const api = billingApi(tx as unknown as PrismaClient, async () => ({ id: "unrelated", role: "CUSTOMER", customerId: "unrelated" }), { origin: "http://localhost", production: false });
    assert.equal((await api(new Request(`http://localhost/api/invoices/${first.id}`))).status, 404);
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: first.id }, include: { items: true } });
    const pdf = await PDFDocument.load(await invoicePdf(invoice, first.totalMinor)); assert.ok(pdf.getPageCount() >= 1);
    throw rollback;
  }, { timeout: 60000 }), error => error === rollback); } finally { await db.$disconnect(); }
});
