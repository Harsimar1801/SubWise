import type { FinancialInvoice, FinancialSubscription, HealthDeduction, RecoveryState, SimulationInput, SimulationPlan, SimulationResult, SubscriptionHealth } from "./contracts/intelligence";
import { check, integer } from "./management-validation";

// Deterministic mock calculations mirror the inspected backend, not an ML model.
export function simulateScenario(input: SimulationInput, plan: SimulationPlan, actualCount: number): SimulationResult {
 check(input.planId === plan.id, "Plan not found.");
 integer(input.proposedPriceMinor, "Proposed price");
 if (input.currentPriceMinor !== undefined) integer(input.currentPriceMinor, "Current price");
 const count = input.subscriptionCount ?? actualCount, change = input.countChange ?? 0, discount = input.discountBps ?? 0, months = input.periodMonths ?? 12;
 integer(count, "Subscription count", 0, 1000000); integer(change, "Count change", -1000000, 1000000); integer(discount, "Discount", 0, 10000); integer(months, "Period months", 1, 60); integer(count + change, "Resulting subscription count", 0, 1000000);
 integer(plan.intervalCount, "Billing interval count", 1);
 const currentPrice = input.currentPriceMinor ?? plan.unitAmountMinor;
 const numerator = plan.interval === "DAY" || plan.interval === "WEEK" ? 365n : 1n;
 const denominator = BigInt(plan.intervalCount) * (plan.interval === "YEAR" ? 12n : plan.interval === "WEEK" ? 84n : plan.interval === "DAY" ? 12n : 1n);
 const safe = (value: bigint) => { check(value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER), "Scenario exceeds safe monetary range."); return Number(value); };
 const monthly = (price: number, customers: number, bps: number) => safe((BigInt(price) * BigInt(customers) * BigInt(10000 - bps) * numerator + denominator * 5000n) / (denominator * 10000n));
 const baselineMrrMinor = monthly(currentPrice, count, 0), simulatedMrrMinor = monthly(input.proposedPriceMinor, count + change, discount), difference = simulatedMrrMinor - baselineMrrMinor;
 return { planId: plan.id, currency: plan.currency, currentPriceMinor: currentPrice, subscriptionCount: count, simulatedSubscriptionCount: count + change, baselineMrrMinor, simulatedMrrMinor, monthlyDifferenceMinor: difference, annualizedDifferenceMinor: safe(BigInt(difference) * 12n), percentageRevenueChange: baselineMrrMinor ? Math.round(difference / baselineMrrMinor * 10000) / 100 : null, chart: Array.from({ length: months }, (_, i) => ({ month: i + 1, baselineMinor: baselineMrrMinor, simulatedMinor: simulatedMrrMinor })), assumptions: ["Scenario estimate, not a prediction or booked revenue.", "Count means distinct active, unpaused subscriptions with active customers; one plan unit per subscription. Quantity and negotiated snapshots are not modeled.", "Current price defaults to catalog price. Overrides affect this scenario only.", "Tax excluded. Proposed discount applies to simulated revenue only; baseline has no discount.", "Annual plans divide by 12; daily/weekly plans use a 365-day year divided into 12 equal months. Billing interval count is respected.", "Prices and counts stay constant throughout the scenario. Aggregate MRR rounds half up to integer minor units; zero baseline yields no percentage change."] };
}
export function subscriptionHealth(sub: FinancialSubscription, invoices: FinancialInvoice[], now: Date): SubscriptionHealth {
 let score = 100, overdueCount = 0, lateInvoiceCount = 0;
 const deductions: HealthDeduction[] = [], relevant = invoices.filter(i => i.subscriptionId === sub.id && !["DRAFT", "VOID"].includes(i.status));
 const deduct = (code: string, points: number, reason: string, action: string) => { score -= points; deductions.push({ code, points, reason, action }); };
 for (const invoice of relevant) {
  if (!invoice.dueAt || Date.parse(invoice.dueAt) > now.getTime()) continue;
  const completed = invoice.allocations.filter(a => a.status === "COMPLETED" && a.paidAt && Date.parse(a.paidAt) <= now.getTime());
  if (completed.reduce((sum, a) => sum + a.amountMinor, 0) < invoice.totalMinor && Date.parse(invoice.dueAt) < now.getTime()) overdueCount++;
  if (completed.some(a => Date.parse(a.paidAt!) > Date.parse(invoice.dueAt!))) lateInvoiceCount++;
 }
 if (overdueCount) deduct("OVERDUE", Math.min(40, overdueCount * 20), `${overdueCount} invoices have outstanding overdue balances`, "Contact customer to reconcile outstanding invoices.");
 if (lateInvoiceCount) deduct("LATE_PAYMENTS", Math.min(20, lateInvoiceCount * 5), `${lateInvoiceCount} invoices received a payment after the due date`, "Discuss payment timing and suitable payment terms.");
 if (lateInvoiceCount >= 3) deduct("REPEATED_DELAYS", 15, "At least three invoices received late payments", "Arrange a staff review of repeated payment delays.");
 const daysToExpiry = sub.endsAt ? Math.ceil((Date.parse(sub.endsAt) - now.getTime()) / 86400000) : null;
 if (sub.endsAt && Date.parse(sub.endsAt) <= now.getTime()) deduct("EXPIRED", 25, "Subscription end date has passed", "Review renewal eligibility or closure.");
 else if (daysToExpiry !== null && daysToExpiry <= 30) deduct("EXPIRING", 10, "Subscription expires within 30 days", "Discuss renewal before expiry.");
 if (sub.cancelAtPeriodEnd || sub.canceledAt || sub.status === "CANCELED") deduct("CANCELLATION", 40, "A cancellation signal is recorded", "Review the recorded cancellation with the customer.");
 score = Math.max(0, score);
 return { subscriptionId: sub.id, customerId: sub.customerId, status: sub.status, score, category: score >= 80 ? "Healthy" : score >= 50 ? "Attention" : "High Risk", deductions, recommendedActions: [...new Set(deductions.map(d => d.action))], overdueCount, lateInvoiceCount, daysToExpiry, asOf: now.toISOString(), historyNote: relevant.length ? "All non-draft, non-void invoice history considered; each invoice counts once for late payments." : "No issued invoice history; no payment deductions applied." };
}
export function invoiceRecovery(invoice: FinancialInvoice, now: Date): RecoveryState {
 const outstandingMinor = Math.max(0, invoice.totalMinor - invoice.allocations.filter(a => a.status === "COMPLETED").reduce((sum, a) => sum + a.amountMinor, 0));
 const utcDay = (date: Date) => Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
 const daysOverdue = invoice.dueAt ? Math.max(0, utcDay(now) - utcDay(new Date(invoice.dueAt))) : 0;
 const eligible = ["OPEN", "PARTIALLY_PAID"].includes(invoice.status) && outstandingMinor > 0 && Boolean(invoice.dueAt) && Date.parse(invoice.dueAt!) < now.getTime();
 const controls = invoice.history.filter(e => e.type === "RETRY" && e.status === "SUCCEEDED"), paused = controls.at(-1)?.metadata?.action === "pause";
 const stage = daysOverdue >= 14 ? 14 : daysOverdue >= 7 ? 7 : daysOverdue >= 3 ? 3 : 0;
 const reminders = invoice.history.filter(e => e.type === "REMINDER"), blocked = reminders.some(e => e.metadata?.stage === stage && ["PENDING", "SUCCEEDED"].includes(e.status));
 const escalated = invoice.history.some(e => e.type === "ESCALATION" && e.status === "SUCCEEDED");
 return { invoiceId: invoice.id, number: invoice.number, currency: invoice.currency, customerId: invoice.customerId, dueAt: invoice.dueAt, outstandingMinor, daysOverdue, eligible, completed: !["OPEN", "PARTIALLY_PAID"].includes(invoice.status) || outstandingMinor === 0, paused, stage, escalated, lastReminderAt: reminders.filter(e => e.status === "SUCCEEDED").at(-1)?.executedAt ?? null, canSend: eligible && !paused && (stage === 3 || stage === 7) && !blocked, nextAction: !eligible ? "NONE" : paused ? "RESUME" : stage === 14 ? escalated ? "STAFF_FOLLOW_UP" : "ESCALATE" : blocked ? "WAIT" : stage ? "REMIND" : "WAIT_UNTIL_DAY_3" };
}
