import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceDate, allowedTransition, resumeBilling, customerSchema } from "../src/lib/management/domain";
test("calendar boundaries, leap years and anchored resume", () => {
  const start = new Date("2024-01-31T10:00:00Z");
  assert.equal(advanceDate(start, "MONTH", 1).toISOString(), "2024-02-29T10:00:00.000Z");
  assert.equal(advanceDate(new Date("2024-02-29Z"), "YEAR", 1).toISOString(), "2025-02-28T00:00:00.000Z");
  assert.equal(resumeBilling(start, "MONTH", 1, new Date("2024-03-01Z")).toISOString(), "2024-03-31T10:00:00.000Z");
  assert.equal(advanceDate(start, "WEEK", 2).toISOString(), "2024-02-14T10:00:00.000Z");
});
test("closed subscriptions cannot activate and profiles reject privilege fields", () => {
  assert.throws(() => allowedTransition("CANCELED", "activate"));
  assert.throws(() => allowedTransition("EXPIRED", "activate"));
  assert.doesNotThrow(() => allowedTransition("EXPIRED", "renew"));
  assert.equal(customerSchema.safeParse({ name: "Name", email: "invalid" }).success, false);
  assert.equal(customerSchema.safeParse({ name: "Name", email: "a@example.com", role: "ADMIN" }).success, false);
});
