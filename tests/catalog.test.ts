import { test } from "node:test";
import assert from "node:assert/strict";
import { productSchema, planSchema, validateCombined, variantPrice, taxAmount, discountAmount, Discount } from "../src/lib/catalog/domain";
import { customerProjection, catalogApi } from "../src/lib/catalog/api";
import { PrismaClient } from "@prisma/client";

test("product inputs, integer amounts and unknown fields", () => {
  const product = { name: "Service", type: "SERVICE", sellingPriceMinor: 100000, costPriceMinor: 50000, currency: "INR" };
  assert.ok(productSchema.safeParse(product).success);
  for (const data of [{ ...product, name: " " }, { ...product, sellingPriceMinor: 1.5 }, { ...product, costPriceMinor: -1 }, { ...product, role: "ADMIN" }]) assert.equal(productSchema.safeParse(data).success, false);
});
test("variant and tax calculations round half up without floating point", () => {
  assert.equal(variantPrice(100000, 56000), 156000);
  assert.equal(taxAmount(156000, 1800), 28080);
  assert.equal(taxAmount(1, 5000), 1);
  assert.throws(() => variantPrice(2147483647, 1));
  assert.throws(() => taxAmount(100, 10001));
});
test("plan frequencies and dates", () => {
  const base = { name: "Plan", code: "MONTHLY", variantId: "variant", currency: "LKR", unitAmountMinor: 10, intervalCount: 1, trialDays: 0, minimumQuantity: 1 };
  for (const interval of ["DAY", "WEEK", "MONTH", "YEAR"]) assert.ok(planSchema.safeParse({ ...base, interval }).success);
  assert.equal(planSchema.safeParse({ ...base, interval: "HOUR" }).success, false);
  assert.equal(planSchema.safeParse({ ...base, interval: "MONTH", minimumQuantity: 0 }).success, false);
  assert.throws(() => validateCombined("plans", { availableFrom: new Date("2026-02-01Z"), availableUntil: new Date("2026-01-01Z") }));
});
test("discounts: fixed, percentage, thresholds, dates, scope and exhaustion", () => {
  const rule: Discount = { isActive: true, type: "FIXED", amountMinor: 500, currency: "LKR", percentageBps: null, startsAt: null, endsAt: null, minimumPurchaseMinor: 1000, minimumQuantity: 2, maximumUses: 3, usageCount: 0, scope: "SUBSCRIPTION", productId: null };
  const input = { subtotalMinor: 2000, quantity: 2, currency: "LKR", scope: "SUBSCRIPTION" as const };
  assert.equal(discountAmount(rule, input), 500);
  assert.equal(discountAmount({ ...rule, type: "PERCENTAGE", amountMinor: null, currency: null, percentageBps: 1250 }, input), 250);
  for (const change of [{ isActive: false }, { usageCount: 3 }, { endsAt: new Date(0) }, { startsAt: new Date("2100-01-01Z") }, { minimumQuantity: 3 }, { minimumPurchaseMinor: 3000 }, { scope: "PRODUCT", productId: "other" }, { currency: "USD" }]) assert.equal(discountAmount({ ...rule, ...change }, input), 0);
  assert.equal(rule.usageCount, 0);
  assert.throws(() => validateCombined("discounts", { type: "FIXED", percentageBps: 500 }));
});
test("customer projection cannot expose internal costs or notes", () => {
  const data = customerProjection("products", { id: "1", costPriceMinor: 10, internalNotes: "private", sellingPriceMinor: 20 });
  assert.equal("costPriceMinor" in data, false); assert.equal("internalNotes" in data, false);
});
test("non-admin writes and customer tax/discount reads are denied before database access", async () => {
  for (const role of ["STAFF", "CUSTOMER"]) {
    const api = catalogApi({} as PrismaClient, async () => ({ role }), "http://localhost:3000");
    const denied = await api(new Request("http://localhost:3000/api/catalog/products", { method: "POST" }), "products");
    assert.equal(denied.status, 403);
  }
  const api = catalogApi({} as PrismaClient, async () => ({ role: "CUSTOMER" }), "http://localhost:3000");
  assert.equal((await api(new Request("http://localhost:3000/api/catalog/taxes"), "taxes")).status, 403);
});
