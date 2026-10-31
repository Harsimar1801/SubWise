import { BillingInterval, Prisma } from "@prisma/client";
import { z } from "zod";
import { check } from "../management/domain";

const money = z.number().int().min(0).max(2147483647);
export const simulationSchema = z.object({ planId: z.string().min(1).max(160), currentPriceMinor: money.optional(), proposedPriceMinor: money, subscriptionCount: z.number().int().min(0).max(1000000).optional(), discountBps: z.number().int().min(0).max(10000).default(0), countChange: z.number().int().min(-1000000).max(1000000).default(0), periodMonths: z.number().int().min(1).max(60).default(12) }).strict();
const safe = (n: bigint) => { check(n <= BigInt(Number.MAX_SAFE_INTEGER) && n >= BigInt(Number.MIN_SAFE_INTEGER), "Scenario exceeds safe monetary range"); return Number(n); };
export function simulate(input: z.infer<typeof simulationSchema>, plan: { unitAmountMinor: number; interval: BillingInterval; intervalCount: number; currency: string }, actualCount: number) {
  const count = input.subscriptionCount ?? actualCount;
  const nextCount = count + input.countChange;
  check(nextCount >= 0 && nextCount <= 1000000, "Resulting subscription count must be 0–1000000");
  const currentPrice = input.currentPriceMinor ?? plan.unitAmountMinor;
  const numerator = plan.interval === "DAY" || plan.interval === "WEEK" ? 365n : 1n;
  const denominator = BigInt(plan.intervalCount) * (plan.interval === "YEAR" ? 12n : plan.interval === "WEEK" ? 84n : plan.interval === "DAY" ? 12n : 1n);
  const monthly = (price: number, customers: number, discount: number) => safe((BigInt(price) * BigInt(customers) * BigInt(10000 - discount) * numerator + denominator * 5000n) / (denominator * 10000n));
  const baselineMrrMinor = monthly(currentPrice, count, 0), simulatedMrrMinor = monthly(input.proposedPriceMinor, nextCount, input.discountBps);
  const monthlyDifferenceMinor = simulatedMrrMinor - baselineMrrMinor;
  return { currency: plan.currency, currentPriceMinor: currentPrice, subscriptionCount: count, simulatedSubscriptionCount: nextCount, baselineMrrMinor, simulatedMrrMinor, monthlyDifferenceMinor, annualizedDifferenceMinor: safe(BigInt(monthlyDifferenceMinor) * 12n), percentageRevenueChange: baselineMrrMinor ? Math.round(monthlyDifferenceMinor / baselineMrrMinor * 10000) / 100 : null, chart: Array.from({ length: input.periodMonths }, (_, i) => ({ month: i + 1, baselineMinor: baselineMrrMinor, simulatedMinor: simulatedMrrMinor })), assumptions: ["Scenario estimate, not a prediction or booked revenue.", "Count means distinct active, unpaused subscriptions with active customers; one plan unit per subscription. Quantity and negotiated snapshots are not modeled.", "Current price defaults to catalog price; explicit overrides affect only this scenario.", "Tax excluded; proposed discount applies to simulated revenue only; no baseline discount assumed.", "Annual plans divide by 12; daily/weekly plans use a 365-day year divided into 12 equal months. intervalCount is respected.", "Prices and counts stay constant throughout the scenario; aggregate MRR rounds half up to integer minor units. Zero baseline yields null percentage change."] };
}

export const healthInclude = { invoices: { where: { status: { notIn: ["DRAFT", "VOID"] } }, select: { id: true, status: true, totalMinor: true, dueAt: true, allocations: { select: { amountMinor: true, payment: { select: { status: true, paidAt: true } } } } } } } satisfies Prisma.SubscriptionInclude;
type HealthSubscription = Prisma.SubscriptionGetPayload<{ include: typeof healthInclude }>;
export function health(sub: HealthSubscription, now: Date) {
  let score = 100; const deductions: { code: string; points: number; reason: string; action: string }[] = [];
  const deduct = (code: string, points: number, reason: string, action: string) => { score -= points; deductions.push({ code, points, reason, action }); };
  let overdueCount = 0, lateInvoiceCount = 0;
  for (const invoice of sub.invoices) {
    if (!invoice.dueAt || invoice.dueAt > now) continue;
    const completed = invoice.allocations.filter(a => a.payment.status === "COMPLETED" && a.payment.paidAt && a.payment.paidAt <= now);
    const paid = completed.reduce((sum, a) => sum + a.amountMinor, 0);
    if (paid < invoice.totalMinor && invoice.dueAt < now) overdueCount++;
    if (completed.some(a => a.payment.paidAt! > invoice.dueAt!)) lateInvoiceCount++;
  }
  if (overdueCount) deduct("OVERDUE", Math.min(40, overdueCount * 20), `${overdueCount} invoices have outstanding overdue balances`, "Contact customer to reconcile outstanding invoices.");
  if (lateInvoiceCount) deduct("LATE_PAYMENTS", Math.min(20, lateInvoiceCount * 5), `${lateInvoiceCount} invoices received a payment after the due date`, "Discuss payment timing and suitable payment terms.");
  if (lateInvoiceCount >= 3) deduct("REPEATED_DELAYS", 15, "At least three invoices received late payments", "Arrange a staff review of repeated payment delays.");
  const daysToExpiry = sub.endsAt ? Math.ceil((sub.endsAt.getTime() - now.getTime()) / 86400000) : null;
  if (sub.endsAt && sub.endsAt <= now) deduct("EXPIRED", 25, "Subscription end date has passed", "Review renewal eligibility or closure.");
  else if (daysToExpiry !== null && daysToExpiry <= 30) deduct("EXPIRING", 10, "Subscription expires within 30 days", "Discuss renewal before expiry.");
  if (sub.cancelAtPeriodEnd || sub.canceledAt || sub.status === "CANCELED") deduct("CANCELLATION", 40, "A cancellation signal is recorded", "Review the recorded cancellation with the customer.");
  score = Math.max(0, score);
  return { subscriptionId: sub.id, customerId: sub.customerId, status: sub.status, score, category: score >= 80 ? "Healthy" : score >= 50 ? "Attention" : "High Risk", deductions, recommendedActions: [...new Set(deductions.map(d => d.action))], overdueCount, lateInvoiceCount, daysToExpiry, asOf: now.toISOString(), historyNote: sub.invoices.length ? "All non-draft, non-void invoice history considered; each invoice counts once for late payments." : "No issued invoice history; no payment deductions applied." };
}
