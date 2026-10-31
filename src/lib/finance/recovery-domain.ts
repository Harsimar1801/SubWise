import { Prisma } from "@prisma/client";
export const recoveryInclude = { customer: { select: { name: true, email: true } }, allocations: { include: { payment: { select: { status: true } } } }, recoveryEvents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } satisfies Prisma.InvoiceInclude;
export type RecoveryInvoice = Prisma.InvoiceGetPayload<{ include: typeof recoveryInclude }>;
export function recoveryState(invoice: RecoveryInvoice, now: Date) {
  const outstandingMinor = Math.max(0, invoice.totalMinor - invoice.allocations.filter(a => a.payment.status === "COMPLETED").reduce((s, a) => s + a.amountMinor, 0));
  const daysOverdue = invoice.dueAt ? Math.max(0, Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000) - Math.floor(Date.UTC(invoice.dueAt.getUTCFullYear(), invoice.dueAt.getUTCMonth(), invoice.dueAt.getUTCDate()) / 86400000)) : 0;
  const eligible = ["OPEN", "PARTIALLY_PAID"].includes(invoice.status) && outstandingMinor > 0 && !!invoice.dueAt && invoice.dueAt < now;
  const metadata = (e: RecoveryInvoice["recoveryEvents"][number]) => (e.metadata ?? {}) as Record<string, unknown>;
  const controls = invoice.recoveryEvents.filter(e => e.type === "RETRY" && e.status === "SUCCEEDED");
  const paused = controls.length > 0 && metadata(controls[controls.length - 1]).action === "pause";
  const stage = daysOverdue >= 14 ? 14 : daysOverdue >= 7 ? 7 : daysOverdue >= 3 ? 3 : 0;
  const reminders = invoice.recoveryEvents.filter(e => e.type === "REMINDER");
  const sent = reminders.filter(e => e.status === "SUCCEEDED");
  const blocked = reminders.some(e => metadata(e).stage === stage && ["PENDING", "SUCCEEDED"].includes(e.status));
  const escalated = invoice.recoveryEvents.some(e => e.type === "ESCALATION" && e.status === "SUCCEEDED");
  return { invoiceId: invoice.id, number: invoice.number, currency: invoice.currency, dueAt: invoice.dueAt, customerId: invoice.customerId, outstandingMinor, daysOverdue, eligible, completed: !["OPEN", "PARTIALLY_PAID"].includes(invoice.status) || outstandingMinor === 0, paused, stage, escalated, lastReminderAt: sent.at(-1)?.executedAt ?? null, canSend: eligible && !paused && (stage === 3 || stage === 7) && !blocked, nextAction: !eligible ? "NONE" : paused ? "RESUME" : stage === 14 ? escalated ? "STAFF_FOLLOW_UP" : "ESCALATE" : blocked ? "WAIT" : stage ? "REMIND" : "WAIT_UNTIL_DAY_3" };
}
export function reminder(invoice: RecoveryInvoice, now: Date) {
  const state = recoveryState(invoice, now);
  return { subject: `Payment reminder: invoice ${invoice.number}`, text: `Dear ${invoice.customer.name},\n\nOur records show invoice ${invoice.number} has an outstanding balance of ${invoice.currency} ${state.outstandingMinor} minor units. It was due on ${invoice.dueAt?.toISOString().slice(0, 10) ?? "unknown"} and is ${state.daysOverdue} calendar days overdue.\n\nPlease contact our billing team to arrange payment, quoting invoice ${invoice.number}. If you have already paid or wish to dispute this balance, please contact us so we can reconcile it.\n\nThank you,\nSubWise Billing` };
}

