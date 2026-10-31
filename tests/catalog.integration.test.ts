import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { catalogApi } from "../src/lib/catalog/api";
import { redeemDiscount } from "../src/lib/catalog/redemption";
loadEnvConfig(process.cwd());
test("catalog persistence, visibility and redemption use real PostgreSQL and rollback all fixtures", async () => {
  const db = new PrismaClient(); const rollback = new Error("test rollback");
  try {
    await assert.rejects(db.$transaction(async tx => {
      let role = "ADMIN";
      const api = catalogApi(tx as unknown as PrismaClient, async () => ({ role }), "http://localhost:3000");
      const call = (resource: "products" | "variants" | "plans" | "discounts" | "taxes", method: string, body?: unknown, id?: string) => api(new Request("http://localhost:3000/api/catalog/" + resource, { method, headers: { origin: "http://localhost:3000", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }), resource, id);
      const created = await call("products", "POST", { name: "Rollback fixture", type: "SERVICE", sellingPriceMinor: 100000, costPriceMinor: 50000, currency: "LKR", internalNotes: "Private", isPublished: false });
      assert.equal(created.status, 201); const product = (await created.json()).data;
      const variantResponse = await call("variants", "POST", { name: "Extra", sku: product.id, productId: product.id, additionalPriceMinor: 56000 });
      assert.equal(variantResponse.status, 201); const variant = (await variantResponse.json()).data;
      const planResponse = await call("plans", "POST", { name: "Monthly", code: product.id, variantId: variant.id, currency: "LKR", unitAmountMinor: 156000, interval: "MONTH", intervalCount: 1, trialDays: 0, minimumQuantity: 1, isPublished: true });
      assert.equal(planResponse.status, 201); const plan = (await planResponse.json()).data;
      role = "CUSTOMER";
      assert.equal((await call("products", "GET", undefined, product.id)).status, 404);
      assert.equal((await call("plans", "GET", undefined, plan.id)).status, 404);
      role = "ADMIN";
      assert.equal((await call("products", "PATCH", { isPublished: true }, product.id)).status, 200);
      role = "CUSTOMER";
      const safe = await call("products", "GET", undefined, product.id);
      assert.equal(safe.status, 200); assert.equal("costPriceMinor" in (await safe.json()).data, false);
      assert.equal((await call("plans", "GET", undefined, plan.id)).status, 200);
      role = "STAFF"; assert.equal((await call("products", "PATCH", { isActive: false }, product.id)).status, 403);
      role = "ADMIN";
      const discount = await call("discounts", "POST", { name: "Once", code: product.id, type: "PERCENTAGE", percentageBps: 1000, minimumPurchaseMinor: 0, minimumQuantity: 1, scope: "SUBSCRIPTION", maximumUses: 1 });
      assert.equal(discount.status, 201); const rule = (await discount.json()).data;
      const input = { subtotalMinor: 10000, quantity: 1, currency: "LKR", scope: "SUBSCRIPTION" as const };
      assert.equal(await redeemDiscount(tx, rule.id, input), 1000);
      await assert.rejects(redeemDiscount(tx, rule.id, input));
      assert.equal((await call("products", "PATCH", { isActive: false }, product.id)).status, 200);
      role = "CUSTOMER"; assert.equal((await call("plans", "GET", undefined, plan.id)).status, 404);
      throw rollback;
    }, { timeout: 60000 }), error => error === rollback);
  } finally { await db.$disconnect(); }
});
