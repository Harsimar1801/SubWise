import { Prisma, PrismaClient, SubscriptionItem } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { check, minor, resumeBilling } from "../management/domain";
import { taxAmount } from "../catalog/domain";

export const paymentSchema = z.object({ idempotencyKey: z.string().min(8).max(160), amountMinor: z.number().int().positive().max(2147483647), method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]), paidAt: z.iso.datetime({ offset: true }).transform(value => new Date(value)), reference: z.string().trim().min(1).max(160), notes: z.string().max(2000).optional() }).strict();
export function invoiceLines(items: SubscriptionItem[], allowedDiscounts: Set<string>) {
  return items.map(item => {
    const subtotal = minor(item.quantity * item.unitAmountMinor);
    const discountAmountMinor = item.discountRuleId && allowedDiscounts.has(item.discountRuleId) ? Math.min(subtotal, item.discountAmountMinor) : 0;
    const taxAmountMinor = taxAmount(subtotal - discountAmountMinor, item.taxRateBps);
    return { subscriptionItemId: item.id, position: item.position, description: item.description, quantity: item.quantity, unitAmountMinor: item.unitAmountMinor, taxRuleId: item.taxRuleId, discountRuleId: discountAmountMinor ? item.discountRuleId : null, taxRateBps: item.taxRateBps, discountAmountMinor, taxAmountMinor, totalMinor: minor(subtotal - discountAmountMinor + taxAmountMinor) };
  });
}
export async function balance(tx: Prisma.TransactionClient, invoiceId: string, total: number) {
  const allocations = await tx.paymentAllocation.aggregate({ where: { invoiceId, payment: { status: "COMPLETED" } }, _sum: { amountMinor: true } });
  const paidMinor = allocations._sum.amountMinor ?? 0;
  return { paidMinor, outstandingMinor: minor(total - paidMinor) };
}
export async function billSubscription(tx: Prisma.TransactionClient, id: string, now: Date, runId?: string) {
  await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${id} FOR UPDATE`;
  const sub = await tx.subscription.findUnique({ where: { id }, include: { items: true, customer: true } });
  if (!sub || sub.status !== "ACTIVE" || sub.pausedAt || !sub.customer.isActive || !sub.nextBillingAt || sub.nextBillingAt > now || sub.startsAt > now) return null;
  if (sub.endsAt && sub.endsAt <= now) {
    if (sub.items.length && sub.items.every(item => item.autoCloseAtExpiry)) {
      await tx.subscription.update({ where: { id }, data: { status: "EXPIRED", nextBillingAt: null } });
      await tx.subscriptionActivity.create({ data: { subscriptionId: id, action: "billing-expire", fromStatus: "ACTIVE", toStatus: "EXPIRED" } });
    }
    return null;
  }
  check(sub.items.length, "Subscription has no items", 409);
  const periodStart = sub.nextBillingAt;
  const next = resumeBilling(sub.startsAt, sub.interval, sub.intervalCount, periodStart);
  const periodEnd = sub.endsAt && next > sub.endsAt ? sub.endsAt : next;
  check(periodEnd > periodStart, "Invalid billing period", 409);
  const key = `recurring:${id}:${periodStart.toISOString()}`;
  const existing = await tx.invoice.findUnique({ where: { idempotencyKey: key } });
  if (existing) { check(existing.periodEnd?.getTime() === periodEnd.getTime(), "Existing billing period mismatch", 409); await tx.subscription.update({ where: { id }, data: { nextBillingAt: sub.endsAt && next >= sub.endsAt ? null : next } }); return existing; }
  const allowed = new Set<string>();
  for (const discountId of [...new Set(sub.items.map(item => item.discountRuleId).filter((value): value is string => Boolean(value)))].sort()) {
    await tx.$queryRaw`SELECT id FROM "DiscountRule" WHERE id = ${discountId} FOR UPDATE`;
    const rule = await tx.discountRule.findUniqueOrThrow({ where: { id: discountId } });
    if (rule.isActive && (!rule.startsAt || rule.startsAt <= periodStart) && (!rule.endsAt || rule.endsAt >= periodStart) && (rule.maximumUses === null || rule.usageCount < rule.maximumUses) && sub.items.some(item => item.discountRuleId === discountId && item.discountAmountMinor > 0)) {
      allowed.add(discountId); await tx.discountRule.update({ where: { id: discountId }, data: { usageCount: { increment: 1 } } });
    }
  }
  const items = invoiceLines(sub.items, allowed);
  const total = (field: "discountAmountMinor" | "taxAmountMinor" | "totalMinor") => minor(items.reduce((sum, item) => sum + item[field], 0));
  const invoice = await tx.invoice.create({ data: { number: `INV-${randomUUID()}`, customerId: sub.customerId, subscriptionId: id, billingRunId: runId, idempotencyKey: key, currency: sub.currency, periodStart, periodEnd, dueAt: new Date(now.getTime() + sub.paymentTermsDays * 86400000), subtotalMinor: minor(items.reduce((sum, item) => sum + item.quantity * item.unitAmountMinor, 0)), discountTotalMinor: total("discountAmountMinor"), taxTotalMinor: total("taxAmountMinor"), totalMinor: total("totalMinor"), items: { create: items } } });
  await tx.subscription.update({ where: { id }, data: { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, nextBillingAt: sub.endsAt && next >= sub.endsAt ? null : next } });
  return invoice;
}
export async function invoiceAction(tx: Prisma.TransactionClient, id: string, action: string, now = new Date()) {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
  const invoice = await tx.invoice.findUnique({ where: { id } }); check(invoice, "Invoice not found", 404);
  const amounts = await balance(tx, id, invoice.totalMinor);
  if (action === "confirm") {
    if (invoice.status === "OPEN" || invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID") return invoice;
    check(invoice.status === "DRAFT", "Only drafts can be confirmed", 409);
    const sub = invoice.subscriptionId ? await tx.subscription.findUnique({ where: { id: invoice.subscriptionId } }) : null;
    return tx.invoice.update({ where: { id }, data: { status: invoice.totalMinor ? "OPEN" : "PAID", issuedAt: now, paidAt: invoice.totalMinor ? null : now, dueAt: new Date(now.getTime() + (sub?.paymentTermsDays ?? 0) * 86400000) } });
  }
  check(action === "cancel", "Unknown invoice action");
  if (invoice.status === "VOID") return invoice;
  check(["DRAFT", "OPEN"].includes(invoice.status) && !amounts.paidMinor, "Paid or partially paid invoices cannot be cancelled", 409);
  return tx.invoice.update({ where: { id }, data: { status: "VOID" } });
}
export async function recordPayment(tx: Prisma.TransactionClient, id: string, input: unknown, actorId: string, now = new Date()) {
  const data = paymentSchema.parse(input); check(data.paidAt <= now, "Payment date cannot be in the future");
  // Serialize reference checks across different invoices as well as same-invoice balances.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(82714006)`;
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
  const invoice = await tx.invoice.findUnique({ where: { id } }); check(invoice, "Invoice not found", 404);
  const previous = await tx.payment.findUnique({ where: { idempotencyKey: data.idempotencyKey }, include: { allocations: true } });
  if (previous) { check(previous.allocations.length === 1 && previous.allocations[0].invoiceId === id && previous.amountMinor === data.amountMinor && previous.method === data.method && previous.reference === data.reference && previous.paidAt?.getTime() === data.paidAt.getTime() && previous.notes === (data.notes ?? null), "Idempotency key reused with different payment", 409); return previous; }
  check(["OPEN", "PARTIALLY_PAID"].includes(invoice.status), "Only confirmed unpaid invoices accept payments", 409);
  check(!(await tx.payment.findFirst({ where: { customerId: invoice.customerId, reference: data.reference, method: data.method } })), "Payment reference already recorded", 409);
  const amounts = await balance(tx, id, invoice.totalMinor); check(data.amountMinor <= amounts.outstandingMinor, "Payment exceeds outstanding balance", 409);
  const payment = await tx.payment.create({ data: { ...data, customerId: invoice.customerId, currency: invoice.currency, status: "COMPLETED", recordedById: actorId, allocations: { create: { invoiceId: id, amountMinor: data.amountMinor } } } });
  await tx.invoice.update({ where: { id }, data: { status: amounts.outstandingMinor === data.amountMinor ? "PAID" : "PARTIALLY_PAID", paidAt: amounts.outstandingMinor === data.amountMinor ? data.paidAt : null } });
  return payment;
}
export async function transaction<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt++) try { return await db.$transaction(work, { isolationLevel: "Serializable", timeout: 30000 }); } catch (error) {
    const retryable = error instanceof Prisma.PrismaClientKnownRequestError && (["P2034", "P2002"].includes(error.code) || (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code))));
    if (!retryable || attempt >= 3) throw error;
  }
}
export async function executeBilling(db: PrismaClient, key: string, now = new Date(), subscriptionId?: string) {
  return transaction(db, async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(82714005)`;
    const prior = await tx.billingRun.findUnique({ where: { idempotencyKey: key } });
    if (prior) return prior;
    const run = await tx.billingRun.create({ data: { idempotencyKey: key, scheduledFor: now, startedAt: new Date(), status: "RUNNING" } });
    // Exclude permanently skipped records before applying the batch limit so they
    // cannot starve eligible subscriptions on every subsequent run.
    const due = await tx.subscription.findMany({ where: { ...(subscriptionId ? { id: subscriptionId } : {}), status: "ACTIVE", pausedAt: null, startsAt: { lte: now }, customer: { isActive: true }, nextBillingAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }, { items: { some: {}, every: { autoCloseAtExpiry: true } } }] }, orderBy: [{ nextBillingAt: "asc" }, { id: "asc" }], take: subscriptionId ? 1 : 20, select: { id: true } });
    let processedCount = 0;
    for (const sub of due) if (await billSubscription(tx, sub.id, now, run.id)) processedCount++;
    return tx.billingRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date(), processedCount } });
  });
}
