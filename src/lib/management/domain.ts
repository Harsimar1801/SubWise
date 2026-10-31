import { BillingInterval, SubscriptionStatus } from "@prisma/client";
import { z } from "zod";
import { AuthError } from "../auth/policy";

const id = z.string().min(1).max(160);
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value));
export const customerSchema = z.object({ name: z.string().trim().min(1).max(120), email: z.email().trim().toLowerCase().max(254), phone: z.string().max(50).nullable().optional(), companyName: z.string().max(160).nullable().optional(), billingAddress: z.record(z.string(), z.string().max(500)).optional(), taxId: z.string().max(100).nullable().optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), userId: id.nullable().optional(), isActive: z.boolean().optional() }).strict();
export const selfSchema = customerSchema.pick({ name: true, phone: true, companyName: true, billingAddress: true }).partial();
export const lineSchema = z.object({ planId: id, quantity: z.number().int().min(1).max(100000), unitAmountMinor: z.number().int().min(0).max(2147483647).optional(), taxRuleId: id.optional(), discountRuleId: id.optional() }).strict();
export const templateContent = z.object({ validityDays: z.number().int().min(1).max(365), items: z.array(lineSchema).min(1).max(100) }).strict();
export const templateSchema = z.object({ name: z.string().trim().min(1).max(160), description: z.string().max(4000).nullable().optional(), content: templateContent, isActive: z.boolean().optional() }).strict();
export const quotationSchema = z.object({ customerId: id, templateId: id.optional(), items: z.array(lineSchema).min(1).max(100).optional(), validUntil: date.optional(), paymentTermsDays: z.number().int().min(0).max(365).optional(), notes: z.string().max(4000).nullable().optional() }).strict();
export const convertSchema = z.object({ startsAt: date, endsAt: date.optional() }).strict();
export const renewSchema = z.object({ endsAt: date }).strict();
export const scheduleSchema = z.object({ startsAt: date.optional(), endsAt: date.nullable().optional(), paymentTermsDays: z.number().int().min(0).max(365).optional() }).strict();
export function check(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new AuthError(status, message); }
export function minor(value: number) { check(Number.isSafeInteger(value) && value >= 0 && value <= 2147483647, "Monetary overflow"); return value; }
export function advanceDate(start: Date, interval: BillingInterval, count: number, steps = 1) {
  check(Number.isSafeInteger(count) && count > 0 && count <= 10000 && Number.isSafeInteger(steps) && steps > 0, "Invalid billing interval");
  const next = new Date(start);
  if (interval === "DAY" || interval === "WEEK") next.setUTCDate(next.getUTCDate() + count * steps * (interval === "WEEK" ? 7 : 1));
  else {
    const day = start.getUTCDate(); next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + count * steps * (interval === "YEAR" ? 12 : 1));
    const last = new Date(next); last.setUTCMonth(last.getUTCMonth() + 1, 0);
    next.setUTCDate(Math.min(day, last.getUTCDate()));
  }
  check(Number.isFinite(next.getTime()), "Date out of range"); return next;
}
export function resumeBilling(start: Date, interval: BillingInterval, count: number, now: Date) {
  let steps = 1; let next = advanceDate(start, interval, count, steps);
  while (next <= now) { check(steps < 100000, "Schedule exceeds supported range"); next = advanceDate(start, interval, count, ++steps); }
  return next;
}
export function allowedTransition(status: SubscriptionStatus, action: string) {
  const allowed: Record<string, SubscriptionStatus[]> = { activate: ["DRAFT"], pause: ["ACTIVE"], resume: ["PAUSED"], renew: ["ACTIVE", "PAUSED", "EXPIRED"], close: ["DRAFT", "ACTIVE", "PAUSED"], expire: ["ACTIVE", "PAUSED"] };
  check(allowed[action]?.includes(status), "Invalid subscription transition", 409);
}
