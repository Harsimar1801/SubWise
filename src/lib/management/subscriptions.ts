import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { check, convertSchema, advanceDate, allowedTransition, renewSchema, resumeBilling, scheduleSchema } from "./domain";
import { priceLines } from "./pricing";

export async function convertQuotation(tx: Prisma.TransactionClient, id: string, input: unknown, actorId: string, now = new Date()) {
  const data = convertSchema.parse(input);
  const quote = await tx.quotation.findUnique({ where: { id }, include: { items: { orderBy: { position: "asc" } }, customer: true } });
  check(quote, "Quotation not found", 404);
  check(quote.status === "ACCEPTED" && quote.validUntil && quote.validUntil > now && quote.customer.isActive, "Quotation must be approved, unexpired and for an active customer", 409);
  check(!data.endsAt || data.endsAt > data.startsAt, "Expiry must follow start");
  check(!(await tx.subscription.findUnique({ where: { quotationId: id } })), "Quotation already converted", 409);
  check(quote.items.length, "Quotation has no lines");
  const eligible = await priceLines(tx, quote.items.map(item => ({ planId: item.planId, quantity: item.quantity, unitAmountMinor: item.unitAmountMinor })), quote.currency, now);
  const items = quote.items.map((item, index) => {
    const plan = eligible.lines[index].plan;
    check(item.interval === plan.interval && item.intervalCount === plan.intervalCount, "Plan cadence changed; revise quotation", 409);
    return { planId: item.planId, position: item.position, description: item.description, quantity: item.quantity, unitAmountMinor: item.unitAmountMinor, taxRuleId: item.taxRuleId, discountRuleId: item.discountRuleId, taxRateBps: item.taxRateBps, discountAmountMinor: item.discountAmountMinor, autoCloseAtExpiry: plan.autoCloseAtExpiry, allowPause: plan.allowPause, allowResume: plan.allowResume, allowRenew: plan.allowRenew, allowEarlyClosure: plan.allowEarlyClosure };
  });
  return tx.subscription.create({ data: { number: `SUB-${randomUUID()}`, customerId: quote.customerId, quotationId: id, currency: quote.currency, interval: quote.items[0].interval, intervalCount: quote.items[0].intervalCount, startsAt: data.startsAt, endsAt: data.endsAt, nextBillingAt: data.startsAt, confirmedAt: now, paymentTermsDays: quote.paymentTermsDays, items: { create: items }, activities: { create: { actorId, action: "confirm", toStatus: "DRAFT" } } }, include: { items: true } });
}

export async function subscriptionAction(tx: Prisma.TransactionClient, id: string, action: string, input: unknown, actorId: string, now = new Date()) {
  const sub = await tx.subscription.findUnique({ where: { id }, include: { items: true, customer: true } });
  check(sub, "Subscription not found", 404);
  const data: Prisma.SubscriptionUpdateManyMutationInput = {};
  if (action === "edit") {
    check(sub.status === "DRAFT", "Only confirmed drafts can be edited", 409);
    Object.assign(data, scheduleSchema.parse(input));
    const starts = data.startsAt instanceof Date ? data.startsAt : sub.startsAt;
    const ends = data.endsAt instanceof Date ? data.endsAt : data.endsAt === null ? null : sub.endsAt;
    check(!ends || ends > starts, "Expiry must follow start");
  } else {
    allowedTransition(sub.status, action); check(sub.items.length, "Subscription has no items");
    if (action === "activate") {
      check(sub.confirmedAt && sub.customer.isActive && sub.startsAt <= now && (!sub.endsAt || sub.endsAt > now), "Subscription is not eligible for activation", 409);
      const next = sub.startsAt;
      Object.assign(data, { status: "ACTIVE", currentPeriodStart: next, currentPeriodEnd: sub.endsAt && advanceDate(next, sub.interval, sub.intervalCount) > sub.endsAt ? sub.endsAt : advanceDate(next, sub.interval, sub.intervalCount), nextBillingAt: next });
    }
    if (action === "pause") { check(sub.items.every(item => item.allowPause), "Pausing is not allowed", 403); Object.assign(data, { status: "PAUSED", pausedAt: now, nextBillingAt: null }); }
    if (action === "resume") {
      check(sub.items.every(item => item.allowResume) && sub.customer.isActive, "Resuming is not allowed", 403); check(!sub.endsAt || sub.endsAt > now, "Subscription has expired", 409);
      const next = resumeBilling(sub.startsAt, sub.interval, sub.intervalCount, now);
      Object.assign(data, { status: "ACTIVE", pausedAt: null, nextBillingAt: sub.endsAt && next >= sub.endsAt ? null : next, currentPeriodStart: now, currentPeriodEnd: sub.endsAt && next > sub.endsAt ? sub.endsAt : next });
    }
    if (action === "renew") {
      check(sub.items.every(item => item.allowRenew) && sub.customer.isActive, "Renewal is not allowed", 403);
      const renewal = renewSchema.parse(input); check(renewal.endsAt > now && (!sub.endsAt || renewal.endsAt > sub.endsAt), "Renewal must extend expiry");
      Object.assign(data, { endsAt: renewal.endsAt });
      if (sub.status === "EXPIRED") Object.assign(data, { status: "ACTIVE", startsAt: now, currentPeriodStart: now, currentPeriodEnd: advanceDate(now, sub.interval, sub.intervalCount) > renewal.endsAt ? renewal.endsAt : advanceDate(now, sub.interval, sub.intervalCount), nextBillingAt: now, pausedAt: null });
    }
    if (action === "close") { check(sub.status === "DRAFT" || (sub.endsAt && sub.endsAt <= now) || sub.items.every(item => item.allowEarlyClosure), "Early closure is not allowed", 403); Object.assign(data, { status: "CANCELED", canceledAt: now, nextBillingAt: null }); }
    if (action === "expire") { check(sub.endsAt && sub.endsAt <= now && sub.items.every(item => item.autoCloseAtExpiry), "Not eligible for automatic expiry", 409); Object.assign(data, { status: "EXPIRED", nextBillingAt: null }); }
  }
  const changed = await tx.subscription.updateMany({ where: { id, updatedAt: sub.updatedAt, status: sub.status }, data });
  check(changed.count, "Concurrent update; retry", 409);
  const updated = await tx.subscription.findUniqueOrThrow({ where: { id }, include: { items: true } });
  await tx.subscriptionActivity.create({ data: { subscriptionId: id, actorId, action, fromStatus: sub.status, toStatus: updated.status } });
  return updated;
}
