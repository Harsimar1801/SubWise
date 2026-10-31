import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockIntelligenceAdapter } from "../src/lib/frontend/adapters/intelligence.mock";
import { simulateScenario, subscriptionHealth, invoiceRecovery } from "../src/lib/frontend/intelligence-rules";
import { intelligenceAsOf, intelligenceInvoices, intelligenceSubscriptions } from "../src/lib/frontend/fixtures/intelligence";
import { demoAccounts } from "../src/lib/frontend/fixtures/auth";
import type { SimulationPlan } from "../src/lib/frontend/contracts/intelligence";
const admin = demoAccounts[0].user, staff = demoAccounts[1].user, customer = demoAccounts[2].user;
const now = new Date(intelligenceAsOf), plan: SimulationPlan = { id: "test-plan", unitAmountMinor: 12000, interval: "MONTH", intervalCount: 1, currency: "LKR" };
test("simulation matches backend arithmetic and produces constant chart values", () => {
 const result = simulateScenario({ planId: plan.id, proposedPriceMinor: 15000, subscriptionCount: 10, countChange: 2, discountBps: 1000, periodMonths: 6 }, plan, 0);
 assert.equal(result.baselineMrrMinor, 120000); assert.equal(result.simulatedMrrMinor, 162000); assert.equal(result.monthlyDifferenceMinor, 42000); assert.equal(result.annualizedDifferenceMinor, 504000); assert.equal(result.percentageRevenueChange, 35);
 assert.equal(result.chart.length, 6); assert.ok(result.chart.every(p => p.baselineMinor === 120000 && p.simulatedMinor === 162000));
});
test("simulation normalizes every cadence, handles zero, discounts and rejects invalid ranges", () => {
 for (const [interval, expected] of [["DAY", 365000], ["WEEK", 52143], ["MONTH", 12000], ["YEAR", 1000]] as const) {
  assert.equal(simulateScenario({ planId: plan.id, proposedPriceMinor: 12000, subscriptionCount: 1 }, { ...plan, interval }, 0).baselineMrrMinor, expected);
 }
 assert.equal(simulateScenario({ planId: plan.id, proposedPriceMinor: 1, subscriptionCount: 0 }, plan, 100).percentageRevenueChange, null);
 assert.equal(simulateScenario({ planId: plan.id, proposedPriceMinor: 100, subscriptionCount: 1, discountBps: 10000 }, plan, 0).simulatedMrrMinor, 0);
 assert.throws(() => simulateScenario({ planId: plan.id, proposedPriceMinor: 100, subscriptionCount: 1, countChange: -2 }, plan, 0));
 assert.throws(() => simulateScenario({ planId: plan.id, proposedPriceMinor: 1.5 }, plan, 0));
 assert.throws(() => simulateScenario({ planId: plan.id, proposedPriceMinor: 100, periodMonths: 61 }, plan, 0));
});
test("health is explained by supported financial evidence and summary agrees with rows", async () => {
 const adapter = createMockIntelligenceAdapter(); const rows = (await adapter.health(admin)).data, summary = (await adapter.healthSummary(staff)).data;
 assert.deepEqual(rows.map(r => r.score), [100, 70, 20]); assert.deepEqual(rows.map(r => r.category), ["Healthy", "Attention", "High Risk"]);
 assert.deepEqual(summary.categories, { Healthy: 1, Attention: 1, "High Risk": 1 }); assert.equal(summary.averageScore, 63.33);
 for (const row of rows) assert.equal(row.score, Math.max(0, 100 - row.deductions.reduce((s, d) => s + d.points, 0)));
 const empty = await createMockIntelligenceAdapter({ subscriptions: [] }).healthSummary(admin); assert.equal(empty.data.averageScore, null);
});
test("health ignores draft/void invoices and future or failed payments", () => {
 const invoice = structuredClone(intelligenceInvoices[0]); invoice.subscriptionId = intelligenceSubscriptions[0].id;
 invoice.allocations = [{ amountMinor: invoice.totalMinor, status: "FAILED", paidAt: "2026-10-29T00:00:00Z" }, { amountMinor: invoice.totalMinor, status: "COMPLETED", paidAt: "2026-11-01T00:00:00Z" }];
 const result = subscriptionHealth(intelligenceSubscriptions[0], [invoice], now); assert.equal(result.overdueCount, 1); assert.equal(result.lateInvoiceCount, 0); assert.equal(result.score, 80);
 invoice.status = "VOID"; assert.equal(subscriptionHealth(intelligenceSubscriptions[0], [invoice], now).score, 100);
});
test("recovery stages and local preview/pause/resume/escalation follow backend eligibility", async () => {
 const adapter = createMockIntelligenceAdapter(); const initial = await adapter.recovery(admin); assert.equal(initial.data.length, 3);
 assert.equal((await adapter.recoveryDetail(admin, "recover-day3")).data.canSend, true);
 const event = (await adapter.recoveryAction(staff, "recover-day3", "send")).data; assert.equal(event.status, "SKIPPED"); assert.equal(event.metadata?.delivery, "PREVIEWED");
 assert.equal((await adapter.recoveryDetail(admin, "recover-day3")).data.lastReminderAt, null);
 await adapter.recoveryAction(staff, "recover-day7", "pause"); await assert.rejects(adapter.recoveryAction(staff, "recover-day7", "send"));
 await adapter.recoveryAction(staff, "recover-day7", "resume"); assert.equal((await adapter.recoveryDetail(admin, "recover-day7")).data.canSend, true);
 await assert.rejects(adapter.recoveryAction(admin, "recover-day14", "send"));
 await adapter.recoveryAction(admin, "recover-day14", "escalate"); await assert.rejects(adapter.recoveryAction(admin, "recover-day14", "escalate"));
 assert.equal((await adapter.recoveryDetail(admin, "recover-day14")).data.nextAction, "STAFF_FOLLOW_UP");
 assert.equal((await adapter.reminderPreview(admin, "recover-day3")).data.delivery, "PREVIEW_ONLY");
});
test("recovery uses UTC calendar days, blocks pending reminders and completes paid balances", () => {
 const invoice = structuredClone(intelligenceInvoices[0]); invoice.dueAt = "2026-10-28T23:59:00Z"; assert.equal(invoiceRecovery(invoice, now).daysOverdue, 3);
 invoice.history.push({ id: "pending", invoiceId: invoice.id, subscriptionId: invoice.subscriptionId, idempotencyKey: "test-pending-key", type: "REMINDER", status: "PENDING", metadata: { stage: 3 }, attemptNumber: 1, scheduledFor: intelligenceAsOf, executedAt: null, errorMessage: null, createdAt: intelligenceAsOf, updatedAt: intelligenceAsOf });
 assert.equal(invoiceRecovery(invoice, now).canSend, false);
 invoice.allocations.push({ amountMinor: invoice.totalMinor, status: "COMPLETED", paidAt: intelligenceAsOf }); assert.equal(invoiceRecovery(invoice, now).completed, true);
});
test("all intelligence operations reject customer role before returning financial data", async () => {
 const adapter = createMockIntelligenceAdapter();
 for (const operation of [() => adapter.simulate(customer, { planId: "plan-growth", proposedPriceMinor: 10 }), () => adapter.health(customer), () => adapter.healthSummary(customer), () => adapter.healthDetail(customer, "intel-healthy"), () => adapter.recovery(customer), () => adapter.recoveryDetail(customer, "recover-day3"), () => adapter.reminderPreview(customer, "recover-day3"), () => adapter.recoveryHistory(customer, "recover-day3"), () => adapter.recoveryAction(customer, "recover-day3", "send")]) await assert.rejects(operation, /Admin and Staff/);
});
