import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { executeBilling, recordPayment, transaction, invoiceAction } from "../src/lib/billing/service";
test("concurrent workers, retries and payments on disposable database", async () => {
  assert.ok(process.env.TEST_DATABASE_URL, "Disposable TEST_DATABASE_URL required");
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const tag = randomUUID(); const now = new Date();
    const user = await db.user.create({ data: { name: "Fixture", email: `${tag}@example.com`, role: "ADMIN" } });
    const customer = await db.customer.create({ data: { name: "Fixture", email: `${tag}@example.com` } });
    const product = await db.product.create({ data: { name: "Fixture" } });
    const variant = await db.productVariant.create({ data: { name: "Fixture", sku: tag, productId: product.id } });
    const plan = await db.subscriptionPlan.create({ data: { name: "Fixture", code: tag, variantId: variant.id, unitAmountMinor: 10000 } });
    const sub = await db.subscription.create({ data: { number: tag, customerId: customer.id, startsAt: now, nextBillingAt: now, status: "ACTIVE", items: { create: { planId: plan.id, description: "Fixture", quantity: 1, unitAmountMinor: 10000, position: 0 } } } });
    await Promise.all([executeBilling(db, `${tag}-one`, now, sub.id), executeBilling(db, `${tag}-two`, now, sub.id)]);
    assert.equal(await db.invoice.count({ where: { subscriptionId: sub.id } }), 1);
    await executeBilling(db, `${tag}-one`, now, sub.id);
    assert.equal(await db.invoice.count({ where: { subscriptionId: sub.id } }), 1);
    const invoice = await db.invoice.findFirstOrThrow({ where: { subscriptionId: sub.id } });
    await transaction(db, tx => invoiceAction(tx, invoice.id, "confirm", now));
    const payment = { idempotencyKey: tag, method: "CASH", paidAt: now.toISOString(), reference: tag, amountMinor: 6000 };
    const result = await Promise.all([transaction(db, tx => recordPayment(tx, invoice.id, payment, user.id)), transaction(db, tx => recordPayment(tx, invoice.id, payment, user.id))]);
    assert.equal(result[0].id, result[1].id);
    const attempts = await Promise.allSettled([1, 2].map(index => transaction(db, tx => recordPayment(tx, invoice.id, { ...payment, idempotencyKey: tag + index, reference: tag + index, amountMinor: 4000 }, user.id))));
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, "PAID");
  } finally { await db.$disconnect(); }
});
