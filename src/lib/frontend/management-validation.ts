import type { BillingInterval, Plan, QuotationLineInput, ManagementSnapshot, Subscription, SubscriptionAction } from "./contracts/management";
export function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function integer(value: number, label: string, min = 0, max = 2147483647) { check(Number.isSafeInteger(value) && value >= min && value <= max, `${label} must be a whole number between ${min} and ${max}.`); }
export function currencyCode(value: string) { check(/^[A-Z]{3}$/.test(value), "Use a three-letter uppercase currency code."); try { new Intl.NumberFormat("en", { style: "currency", currency: value }); } catch { throw new Error("Invalid currency code."); } }
export function text(value: string, label: string, max = 160) { check(value.trim().length > 0 && value.length <= max, `${label} is required (maximum ${max} characters).`); }
export function isoDate(value: string, label: string) { check(Boolean(value) && Number.isFinite(Date.parse(value)), `Enter a valid ${label}.`); return Date.parse(value); }
export function cadence(interval: BillingInterval, count: number) { const units = { DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" }; return `Every ${count === 1 ? "" : `${count} `}${units[interval]}${count === 1 ? "" : "s"}`; }
export function quotationPlan(data: ManagementSnapshot, line: QuotationLineInput): Plan { const plan = data.plans.find(p => p.id === line.planId); check(plan, "Choose an existing plan."); return plan; }
export function lifecycleReason(sub: Subscription, action: SubscriptionAction, now = Date.now()): string | null {
 const statuses = { activate: ["DRAFT"], pause: ["ACTIVE"], resume: ["PAUSED"], renew: ["ACTIVE", "PAUSED", "EXPIRED"], close: ["DRAFT", "ACTIVE", "PAUSED"] };
 if (!statuses[action].includes(sub.status)) return `Unavailable for ${sub.status.toLowerCase().replaceAll("_", " ")} subscriptions.`;
 if (action === "activate" && (Date.parse(sub.startsAt) > now || sub.endsAt && Date.parse(sub.endsAt) <= now)) return "Activation requires a reached start date and an unexpired subscription.";
 if (action === "pause" && !sub.permissions.allowPause || action === "resume" && !sub.permissions.allowResume || action === "renew" && !sub.permissions.allowRenew) return "The agreed plan permissions do not allow this action.";
 if (action === "resume" && sub.endsAt && Date.parse(sub.endsAt) <= now) return "This subscription has expired.";
 if (action === "close" && sub.status !== "DRAFT" && !sub.permissions.allowEarlyClosure && (!sub.endsAt || Date.parse(sub.endsAt) > now)) return "Early closure is not allowed by the agreed plan.";
 return null;
}
