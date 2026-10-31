import { z } from "zod";

const money = z.number().int().min(0).max(2147483647);
const positive = z.number().int().min(1).max(2147483647);
const name = z.string().trim().min(1).max(160);
const currency = z.string().regex(/^[A-Z]{3}$/);
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value)).nullable();
export const productSchema = z.object({ name, description: z.string().max(4000).nullable().optional(), type: z.enum(["SERVICE", "GOODS"]), sellingPriceMinor: money, costPriceMinor: money, currency, internalNotes: z.string().max(4000).nullable().optional(), isActive: z.boolean().optional(), isPublished: z.boolean().optional() }).strict();
export const variantSchema = z.object({ productId: name, name, sku: name, additionalPriceMinor: money, attributes: z.record(z.string().max(100), z.string().max(500)).optional(), isActive: z.boolean().optional() }).strict();
export const planSchema = z.object({ variantId: name, code: name, name, description: z.string().max(4000).nullable().optional(), currency, unitAmountMinor: money, interval: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]), intervalCount: positive, trialDays: money, minimumQuantity: positive, availableFrom: date.optional(), availableUntil: date.optional(), autoCloseAtExpiry: z.boolean().optional(), allowPause: z.boolean().optional(), allowResume: z.boolean().optional(), allowRenew: z.boolean().optional(), allowEarlyClosure: z.boolean().optional(), isActive: z.boolean().optional(), isPublished: z.boolean().optional() }).strict();
export const taxSchema = z.object({ code: name, name, rateBps: z.number().int().min(0).max(10000), isActive: z.boolean().optional() }).strict();
export const discountSchema = z.object({ code: name, name, type: z.enum(["FIXED", "PERCENTAGE"]), amountMinor: money.nullable().optional(), currency: currency.nullable().optional(), percentageBps: z.number().int().min(0).max(10000).nullable().optional(), startsAt: date.optional(), endsAt: date.optional(), minimumPurchaseMinor: money, minimumQuantity: positive, maximumUses: positive.nullable().optional(), scope: z.enum(["PRODUCT", "SUBSCRIPTION"]), productId: name.nullable().optional(), isActive: z.boolean().optional() }).strict();
export const schemas = { products: productSchema, variants: variantSchema, plans: planSchema, taxes: taxSchema, discounts: discountSchema };
export type Resource = keyof typeof schemas;
export function validateCombined(resource: Resource, value: Record<string, unknown>) {
  const start = value[resource === "plans" ? "availableFrom" : "startsAt"];
  const end = value[resource === "plans" ? "availableUntil" : "endsAt"];
  if (start && end && new Date(String(end)) < new Date(String(start))) throw new Error("End date must not precede start date");
  if (resource === "discounts") {
    if (value.type === "FIXED" ? value.amountMinor == null || !value.currency || value.percentageBps != null : value.percentageBps == null || value.amountMinor != null || value.currency != null) throw new Error("Supply amountMinor and currency for FIXED, or percentageBps for PERCENTAGE; clear the other fields");
    if (value.scope === "PRODUCT" ? !value.productId : value.productId != null) throw new Error("PRODUCT scope requires productId; SUBSCRIPTION scope requires null productId");
    if (value.maximumUses != null && Number(value.maximumUses) < Number(value.usageCount ?? 0)) throw new Error("maximumUses cannot be less than usageCount");
  }
}
function integer(value: number) { if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new Error("Invalid or overflowing monetary value"); return BigInt(value); }
function result(value: bigint) { if (value > 2147483647n || value < 0n) throw new Error("Monetary overflow"); return Number(value); }
export function variantPrice(base: number, additional: number) { return result(integer(base) + integer(additional)); }
export function taxAmount(netMinor: number, rateBps: number) { if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) throw new Error("Invalid tax rate"); return result((integer(netMinor) * BigInt(rateBps) + 5000n) / 10000n); }
export type Discount = { isActive: boolean; type: string; amountMinor: number | null; currency: string | null; percentageBps: number | null; startsAt: Date | null; endsAt: Date | null; minimumPurchaseMinor: number; minimumQuantity: number; maximumUses: number | null; usageCount: number; scope: string; productId: string | null };
export function discountAmount(rule: Discount, input: { subtotalMinor: number; quantity: number; currency: string; productId?: string; scope: "PRODUCT" | "SUBSCRIPTION" }, now = new Date()) {
  const subtotal = integer(input.subtotalMinor);
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new Error("Invalid quantity");
  if (!rule.isActive || (rule.startsAt && now < rule.startsAt) || (rule.endsAt && now > rule.endsAt) || input.subtotalMinor < rule.minimumPurchaseMinor || input.quantity < rule.minimumQuantity || (rule.maximumUses !== null && rule.usageCount >= rule.maximumUses) || rule.scope !== input.scope || (rule.scope === "PRODUCT" && rule.productId !== input.productId) || (rule.type === "FIXED" && rule.currency !== input.currency)) return 0;
  const amount = rule.type === "FIXED" ? integer(rule.amountMinor!) : BigInt(taxAmount(input.subtotalMinor, rule.percentageBps!));
  return result(amount > subtotal ? subtotal : amount);
}
