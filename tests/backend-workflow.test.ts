import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { managementApi } from "../src/lib/management/api";
import { billSubscription, invoiceAction, recordPayment, balance } from "../src/lib/billing/service";
loadEnvConfig(process.cwd());
test("customer to quotation to subscription to invoice to payment rolls back", async () => {
  const db = new PrismaClient(), rollback = new Error("audit rollback");
  try { await assert.rejects(db.$transaction(async tx => {
    const tag = randomUUID();
    const staff = await tx.user.create({ data: { name: "Audit fixture", email: `${tag}@example.com`, role: "STAFF" } });
    const api = managementApi(db, async () => ({ id: staff.id, role: "STAFF", customerId: null }), "http://localhost", work => work(tx));
    async function post(path: string, body: unknown, status = 200) {
      const response = await api(new Request(`http://localhost/api/${path}`, { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body) }));
      assert.equal(response.status, status, path); return (await response.json()).data;
    }
    const customer = await post("customers", { name: "Audit customer", email: `customer-${tag}@example.com` }, 201);
    const product = await tx.product.create({ data: { name: "Audit product" } });
    const variant = await tx.productVariant.create({ data: { productId: product.id, name: "Audit variant", sku: tag } });
    const plan = await tx.subscriptionPlan.create({ data: { variantId: variant.id, name: "Audit plan", code: tag, unitAmountMinor: 10000 } });
    const tax = await tx.taxRule.create({ data: { name: "Audit tax", code: tag, rateBps: 1800 } });
    const quote = await post("quotations", { customerId: customer.id, items: [{ planId: plan.id, quantity: 2, taxRuleId: tax.id }], paymentTermsDays: 14 }, 201);
    assert.equal(quote.totalMinor, 23600);
    await post(`quotations/${quote.id}/send`, {}); await post(`quotations/${quote.id}/confirm`, {});
    const subscription = await post(`quotations/${quote.id}/convert`, { startsAt: new Date(Date.now() - 1000).toISOString() }, 201);
    await post(`subscriptions/${subscription.id}/activate`, {});
    const now = new Date(); const invoice = await billSubscription(tx, subscription.id, now); assert.ok(invoice);
    assert.equal(invoice.totalMinor, quote.totalMinor); assert.equal(invoice.customerId, customer.id);
    assert.equal(await billSubscription(tx, subscription.id, now), null);
    await invoiceAction(tx, invoice.id, "confirm", now);
    const payment = { idempotencyKey: tag, amountMinor: 23600, method: "CASH", reference: tag, paidAt: now.toISOString() };
    const receipt = await recordPayment(tx, invoice.id, payment, staff.id, now);
    assert.equal((await recordPayment(tx, invoice.id, payment, staff.id, now)).id, receipt.id);
    assert.equal((await balance(tx, invoice.id, invoice.totalMinor)).outstandingMinor, 0);
    assert.equal((await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, "PAID");
    throw rollback;
  }, { timeout: 60000 }), error => error === rollback); } finally { await db.$disconnect(); }
});
