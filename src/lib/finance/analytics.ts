import { PrismaClient } from "@prisma/client";
import { health, healthInclude, simulate, simulationSchema } from "../insights/domain";
export async function analytics(db: PrismaClient, currency: string, from: Date, to: Date, now: Date) {
  const [invoices, payments, subscriptions] = await Promise.all([
    db.invoice.findMany({ where: { currency, status: { notIn: ["DRAFT", "VOID"] }, OR: [{ issuedAt: { gte: from, lt: to } }, { status: { in: ["OPEN", "PARTIALLY_PAID", "UNCOLLECTIBLE"] } }] }, include: { allocations: { include: { payment: { select: { status: true } } } }, items: { include: { subscriptionItem: { select: { planId: true, plan: { select: { name: true } } } } } } } }),
    db.payment.findMany({ where: { currency, status: "COMPLETED", paidAt: { gte: from, lt: to } }, orderBy: { paidAt: "desc" } }),
    db.subscription.findMany({ where: { currency }, include: { ...healthInclude, customer: { select: { isActive: true } }, items: { include: { plan: { select: { name: true } } } } } })
  ]);
  const inRange = (date: Date | null) => !!date && date >= from && date < to;
  const issued = invoices.filter(i => inRange(i.issuedAt));
  const open = invoices.filter(i => ["OPEN", "PARTIALLY_PAID", "UNCOLLECTIBLE"].includes(i.status));
  const balance = (i: typeof invoices[number]) => Math.max(0, i.totalMinor - i.allocations.filter(a => a.payment.status === "COMPLETED").reduce((s, a) => s + a.amountMinor, 0));
  const active = subscriptions.filter(s => s.status === "ACTIVE" && !s.pausedAt && s.customer.isActive && s.startsAt <= now && (!s.endsAt || s.endsAt > now));
  const byPlan = new Map<string, { planId: string; name: string; invoicedMinor: number; mrrMinor: number }>();
  const getPlan = (id: string, name: string) => { if (!byPlan.has(id)) byPlan.set(id, { planId: id, name, invoicedMinor: 0, mrrMinor: 0 }); return byPlan.get(id)!; };
  for (const invoice of issued) for (const item of invoice.items) { const link = item.subscriptionItem; getPlan(link?.planId ?? "unattributed", link?.plan.name ?? "Unattributed").invoicedMinor += item.totalMinor; }
  let mrrMinor = 0;
  for (const sub of active) for (const item of sub.items) {
    const amount = Math.max(0, item.quantity * item.unitAmountMinor - item.discountAmountMinor);
    // Reuse Phase 6 normalization; price bounds do not apply to a computed line total.
    const normalized = simulate(simulationSchema.parse({ planId: item.planId, proposedPriceMinor: 0, subscriptionCount: 1 }), { currency, interval: sub.interval, intervalCount: sub.intervalCount, unitAmountMinor: amount }, 1).baselineMrrMinor;
    mrrMinor += normalized; getPlan(item.planId, item.plan.name).mrrMinor += normalized;
  }
  const monthly = new Map<string, { month: string; invoicedMinor: number; collectionsMinor: number; subscriptionsStarted: number }>();
  for (const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); date < to; date.setUTCMonth(date.getUTCMonth() + 1)) { const month = date.toISOString().slice(0, 7); monthly.set(month, { month, invoicedMinor: 0, collectionsMinor: 0, subscriptionsStarted: 0 }); }
  for (const invoice of issued) monthly.get(invoice.issuedAt!.toISOString().slice(0, 7))!.invoicedMinor += invoice.totalMinor;
  for (const payment of payments) monthly.get(payment.paidAt!.toISOString().slice(0, 7))!.collectionsMinor += payment.amountMinor;
  for (const sub of subscriptions.filter(s => inRange(s.startsAt))) monthly.get(sub.startsAt.toISOString().slice(0, 7))!.subscriptionsStarted++;
  const upcoming = active.filter(s => s.endsAt && s.endsAt <= new Date(now.getTime() + 30 * 86400000)).sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime()).map(s => ({ id: s.id, customerId: s.customerId, endsAt: s.endsAt }));
  const data = { currency, from, to, asOf: now, activeSubscriptions: active.length, mrrMinor, invoicedMinor: issued.reduce((s, i) => s + i.totalMinor, 0), paymentsReceivedMinor: payments.reduce((s, p) => s + p.amountMinor, 0), outstandingMinor: open.reduce((s, i) => s + balance(i), 0), overdueInvoiceCount: open.filter(i => ["OPEN", "PARTIALLY_PAID"].includes(i.status) && i.dueAt && i.dueAt < now && balance(i) > 0).length, highRiskSubscriptions: subscriptions.filter(s => health(s, now).category === "High Risk").length, upcomingRenewalCount: upcoming.length };
  return { overview: data, trends: [...monthly.values()], plans: [...byPlan.values()], renewals: upcoming, recent: { invoices: issued.sort((a, b) => b.issuedAt!.getTime() - a.issuedAt!.getTime()).slice(0, 10).map(i => ({ id: i.id, number: i.number, totalMinor: i.totalMinor, issuedAt: i.issuedAt, status: i.status })), payments: payments.slice(0, 10).map(p => ({ id: p.id, amountMinor: p.amountMinor, paidAt: p.paidAt, method: p.method })) } };
}

