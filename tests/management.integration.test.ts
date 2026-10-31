import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { managementApi } from "../src/lib/management/api";
loadEnvConfig(process.cwd());
test("customer isolation, quotation pricing/conversion and subscription lifecycle roll back all fixtures", async () => {
  const db = new PrismaClient(); const rollback = new Error("rollback fixtures");
  try {
    await assert.rejects(db.$transaction(async tx => {
      const tag = randomUUID();
      const user = await tx.user.create({ data: { name: "Staff fixture", email: `${tag}@example.com`, role: "STAFF" } });
      let actor = { id: user.id, role: "STAFF", customerId: null as string | null };
      const api = managementApi(db, async () => actor, "http://localhost:3000", work => work(tx));
      async function call(path: string, method = "GET", body?: unknown, status = 200) {
        const response = await api(new Request(`http://localhost:3000/api/${path}`, { method, headers: { origin: "http://localhost:3000", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
        assert.equal(response.status, status, `${method} ${path}: ${await response.clone().text()}`);
        return (await response.json()).data;
      }
      const customer = await call("customers", "POST", { name: "Customer fixture", email: `customer-${tag}@example.com` }, 201);
      const other = await call("customers", "POST", { name: "Other fixture", email: `other-${tag}@example.com` }, 201);
      await call("customers", "POST", { name: "Duplicate", email: `CUSTOMER-${tag}@EXAMPLE.COM` }, 409);
      actor = { ...actor, role: "CUSTOMER", customerId: customer.id };
      await call(`customers/${other.id}`, "GET", undefined, 404);
      await call(`customers/${customer.id}`, "PATCH", { phone: "123" });
      await call(`customers/${customer.id}`, "PATCH", { userId: user.id }, 400);
      await call("quotations", "POST", {}, 403);
      actor = { ...actor, role: "STAFF", customerId: null };
      const product = await tx.product.create({ data: { name: "Fixture" } });
      const variant = await tx.productVariant.create({ data: { productId: product.id, name: "Fixture", sku: tag } });
      const plan = await tx.subscriptionPlan.create({ data: { variantId: variant.id, name: "Fixture", code: tag, unitAmountMinor: 10000, allowPause: true, allowResume: true, allowRenew: true, allowEarlyClosure: true, autoCloseAtExpiry: true } });
      const tax = await tx.taxRule.create({ data: { name: "Fixture", code: tag, rateBps: 1800 } });
      const discount = await tx.discountRule.create({ data: { name: "Fixture", code: tag, type: "PERCENTAGE", percentageBps: 1000 } });
      const template = await call("quotation-templates", "POST", { name: tag, content: { validityDays: 30, items: [{ planId: plan.id, quantity: 2, taxRuleId: tax.id, discountRuleId: discount.id }] } }, 201);
      const quote = await call("quotations", "POST", { customerId: customer.id, templateId: template.id, paymentTermsDays: 14 }, 201);
      await call("quotations", "POST", { customerId: customer.id, templateId: template.id, validUntil: new Date(0).toISOString() }, 400);
      assert.equal(quote.subtotalMinor, 20000); assert.equal(quote.discountTotalMinor, 2000); assert.equal(quote.taxTotalMinor, 3240); assert.equal(quote.totalMinor, 21240);
      await call(`quotations/${quote.id}/convert`, "POST", { startsAt: new Date().toISOString() }, 409);
      await call(`quotations/${quote.id}/send`, "POST", {});
      await call(`quotations/${quote.id}/confirm`, "POST", {});
      await call(`quotations/${quote.id}`, "PATCH", { notes: "forbidden" }, 409);
      await tx.subscriptionPlan.update({ where: { id: plan.id }, data: { unitAmountMinor: 99999 } });
      const subscription = await call(`quotations/${quote.id}/convert`, "POST", { startsAt: new Date(Date.now() - 86400000).toISOString(), endsAt: new Date(Date.now() + 86400000 * 30).toISOString() }, 201);
      assert.equal(subscription.items[0].unitAmountMinor, 10000); assert.equal(subscription.paymentTermsDays, 14); assert.equal(subscription.status, "DRAFT");
      await call(`quotations/${quote.id}/convert`, "POST", { startsAt: new Date().toISOString() }, 409);
      const active = await call(`subscriptions/${subscription.id}/activate`, "POST", {}); assert.equal(active.status, "ACTIVE"); assert.equal(active.nextBillingAt, subscription.startsAt);
      await tx.subscriptionItem.updateMany({ where: { subscriptionId: subscription.id }, data: { allowPause: false } });
      await call(`subscriptions/${subscription.id}/pause`, "POST", {}, 403);
      await tx.subscriptionItem.updateMany({ where: { subscriptionId: subscription.id }, data: { allowPause: true } });
      await call(`subscriptions/${subscription.id}/pause`, "POST", {});
      const resumed = await call(`subscriptions/${subscription.id}/resume`, "POST", {}); assert.equal(resumed.status, "ACTIVE");
      await tx.subscription.update({ where: { id: subscription.id }, data: { endsAt: new Date(Date.now() - 1000) } });
      // Period dates are deliberately preserved; only the end/expiry eligibility changes.
      await call(`subscriptions/${subscription.id}/expire`, "POST", {});
      await tx.subscriptionItem.updateMany({ where: { subscriptionId: subscription.id }, data: { allowRenew: false } });
      await call(`subscriptions/${subscription.id}/renew`, "POST", { endsAt: new Date(Date.now() + 86400000 * 60).toISOString() }, 403);
      await tx.subscriptionItem.updateMany({ where: { subscriptionId: subscription.id }, data: { allowRenew: true } });
      await call(`subscriptions/${subscription.id}/activate`, "POST", {}, 409);
      await call(`subscriptions/${subscription.id}/renew`, "POST", { endsAt: new Date(Date.now() + 86400000 * 60).toISOString() });
      await call(`subscriptions/${subscription.id}/close`, "POST", {});
      await call(`subscriptions/${subscription.id}/activate`, "POST", {}, 409);
      assert.equal((await tx.discountRule.findUniqueOrThrow({ where: { id: discount.id } })).usageCount, 0);
      actor = { ...actor, role: "CUSTOMER", customerId: other.id };
      await call(`subscriptions/${subscription.id}`, "GET", undefined, 404);
      await call(`quotations/${quote.id}`, "GET", undefined, 404);
      actor = { ...actor, customerId: customer.id };
      const history = await call(`subscriptions/${subscription.id}/history`); assert.ok(history.activities.length >= 7);
      throw rollback;
    }, { timeout: 60000 }), error => error === rollback);
  } finally { await db.$disconnect(); }
});
