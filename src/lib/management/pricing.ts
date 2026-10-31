import { Prisma, QuotationItem } from "@prisma/client";
import { z } from "zod";
import { lineSchema, check, minor } from "./domain";
import { discountAmount, taxAmount } from "../catalog/domain";
export async function priceLines(tx: Prisma.TransactionClient, inputs: z.infer<typeof lineSchema>[], currency: string, now: Date) {
  const lines: { plan: Prisma.SubscriptionPlanGetPayload<{ include: { variant: { include: { product: true } } } }>; subtotal: number; input: z.infer<typeof lineSchema>; data: Omit<QuotationItem, "id" | "quotationId" | "taxRuleId" | "discountRuleId"> & { taxRuleId?: string; discountRuleId?: string } }[] = [];
  for (const [position, input] of inputs.entries()) {
    const plan = await tx.subscriptionPlan.findUnique({ where: { id: input.planId }, include: { variant: { include: { product: true } } } });
    check(plan?.isActive && plan.variant.isActive && plan.variant.product.isActive, "Inactive or missing product, variant or plan");
    check(plan.currency === currency && (!plan.availableFrom || plan.availableFrom <= now) && (!plan.availableUntil || plan.availableUntil >= now), "Plan currency or availability mismatch");
    check(input.quantity >= plan.minimumQuantity, "Quantity below plan minimum");
    const tax = input.taxRuleId ? await tx.taxRule.findUnique({ where: { id: input.taxRuleId } }) : null;
    check(!input.taxRuleId || tax?.isActive, "Tax rule is inactive or missing");
    const unitAmountMinor = input.unitAmountMinor ?? plan.unitAmountMinor;
    lines.push({ plan, subtotal: minor(unitAmountMinor * input.quantity), input, data: { planId: plan.id, position, description: `${plan.variant.product.name} / ${plan.variant.name} / ${plan.name}`, quantity: input.quantity, unitAmountMinor, interval: plan.interval, intervalCount: plan.intervalCount, taxRuleId: input.taxRuleId, discountRuleId: input.discountRuleId, taxRateBps: tax?.rateBps ?? 0, discountAmountMinor: 0, taxAmountMinor: 0, totalMinor: 0 } });
  }
  check(lines.every(line => line.plan.interval === lines[0].plan.interval && line.plan.intervalCount === lines[0].plan.intervalCount), "All lines must share a billing cadence");
  for (const id of new Set(inputs.map(item => item.discountRuleId).filter((id): id is string => Boolean(id)))) {
    const rule = await tx.discountRule.findUnique({ where: { id } }); check(rule, "Discount not found");
    const group = lines.filter(line => line.input.discountRuleId === id);
    check(rule.scope !== "SUBSCRIPTION" || group.length === lines.length, "Subscription discount must be selected on every line");
    check(rule.scope !== "PRODUCT" || group.every(line => line.plan.variant.productId === rule.productId), "Discount product mismatch");
    const subtotal = minor(group.reduce((sum, line) => sum + line.subtotal, 0));
    const amount = discountAmount(rule, { subtotalMinor: subtotal, quantity: group.reduce((sum, line) => sum + line.input.quantity, 0), currency, scope: rule.scope as "PRODUCT" | "SUBSCRIPTION", productId: rule.productId ?? undefined }, now);
    check(amount > 0 && subtotal > 0, "Discount is ineligible or exhausted");
    let remaining = amount; let remainingSubtotal = subtotal;
    group.forEach(line => { const allocated = remainingSubtotal ? Number(BigInt(remaining) * BigInt(line.subtotal) / BigInt(remainingSubtotal)) : 0; line.data.discountAmountMinor = allocated; remaining -= allocated; remainingSubtotal -= line.subtotal; });
  }
  for (const line of lines) { line.data.taxAmountMinor = taxAmount(line.subtotal - line.data.discountAmountMinor, line.data.taxRateBps); line.data.totalMinor = minor(line.subtotal - line.data.discountAmountMinor + line.data.taxAmountMinor); }
  return { lines, totals: { subtotalMinor: minor(lines.reduce((sum, line) => sum + line.subtotal, 0)), discountTotalMinor: minor(lines.reduce((sum, line) => sum + line.data.discountAmountMinor, 0)), taxTotalMinor: minor(lines.reduce((sum, line) => sum + line.data.taxAmountMinor, 0)), totalMinor: minor(lines.reduce((sum, line) => sum + line.data.totalMinor, 0)) } };
}
