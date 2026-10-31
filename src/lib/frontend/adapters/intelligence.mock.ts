import type { CurrentUser } from "../contracts/auth";
import type { FinancialInvoice, FinancialSubscription, IntelligenceAdapter, RecoveryEvent, SimulationPlan } from "../contracts/intelligence";
import { intelligenceAsOf, intelligenceInvoices, intelligenceSubscriptions } from "../fixtures/intelligence";
import { invoiceRecovery, simulateScenario, subscriptionHealth } from "../intelligence-rules";
import { check, integer } from "../management-validation";
import { mockManagementAdapter } from "./management.mock";
export function createMockIntelligenceAdapter(options: { invoices?: FinancialInvoice[]; subscriptions?: FinancialSubscription[]; asOf?: string; loadPlans?: (actor: CurrentUser) => Promise<SimulationPlan[]> } = {}): IntelligenceAdapter {
 const invoices = structuredClone(options.invoices ?? intelligenceInvoices), subscriptions = structuredClone(options.subscriptions ?? intelligenceSubscriptions), now = new Date(options.asOf ?? intelligenceAsOf);
 const allow = (actor: CurrentUser) => check(["ADMIN", "STAFF"].includes(actor.role), "Intelligence is available to Admin and Staff only.");
 const find = (id: string) => { const row = invoices.find(i => i.id === id); check(row, "Invoice not found."); return row; };
 function page<T>(rows: T[], query: { page?: number; pageSize?: number } = {}) { const page = query.page ?? 1, pageSize = query.pageSize ?? 20; integer(page, "Page", 1, 100000); integer(pageSize, "Page size", 1, 100); return { data: structuredClone(rows.slice((page - 1) * pageSize, page * pageSize)), meta: { page, pageSize, total: rows.length } }; }
 const healthRows = (customerId?: string) => subscriptions.filter(s => !customerId || s.customerId === customerId).map(s => subscriptionHealth(s, invoices, now));
 return {
  async simulate(actor, input) { allow(actor); const plans = options.loadPlans ? await options.loadPlans(actor) : (await mockManagementAdapter.load(actor)).plans; const plan = plans.find(p => p.id === input.planId); check(plan, "Plan not found."); const count = subscriptions.filter(s => s.planId === plan.id && s.status === "ACTIVE" && !s.pausedAt && s.customerActive && Date.parse(s.startsAt) <= now.getTime() && (!s.endsAt || Date.parse(s.endsAt) > now.getTime())).length; return { data: simulateScenario(input, plan, count) }; },
  async health(actor, query = {}) { allow(actor); return page(healthRows(query.customerId), query); },
  async healthSummary(actor, query = {}) { allow(actor); const rows = healthRows(query.customerId), categories = { Healthy: 0, Attention: 0, "High Risk": 0 }; rows.forEach(row => categories[row.category]++); return { data: { total: rows.length, categories, averageScore: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length * 100) / 100 : null, asOf: now.toISOString() } }; },
  async healthDetail(actor, id) { allow(actor); const row = healthRows().find(s => s.subscriptionId === id); check(row, "Subscription not found."); return { data: row }; },
  async recovery(actor, query) { allow(actor); return page(invoices.map(i => invoiceRecovery(i, now)).filter(i => i.eligible).sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "")), query); },
  async recoveryDetail(actor, id) { allow(actor); const row = find(id); return { data: { ...invoiceRecovery(row, now), history: structuredClone(row.history) } }; },
  async recoveryHistory(actor, id) { allow(actor); return { data: structuredClone(find(id).history) }; },
  async reminderPreview(actor, id) { allow(actor); const row = find(id), state = invoiceRecovery(row, now); return { data: { subject: `Payment reminder: invoice ${row.number}`, text: `Dear ${row.customerName},\n\nOur records show invoice ${row.number} has an outstanding balance of ${row.currency} ${state.outstandingMinor} minor units. It was due on ${row.dueAt?.slice(0, 10) ?? "unknown"} and is ${state.daysOverdue} calendar days overdue.\n\nPlease contact our billing team to arrange payment, quoting invoice ${row.number}. If you have already paid or wish to dispute this balance, please contact us so we can reconcile it.\n\nThank you,\nSubWise Billing`, delivery: "PREVIEW_ONLY" } }; },
  async recoveryAction(actor, id, action) {
   allow(actor); const row = find(id), state = invoiceRecovery(row, now);
   check(["send", "pause", "resume", "escalate"].includes(action), "Unsupported recovery action.");
   if (action === "send") check(state.canSend, "Reminder is not eligible, paused, or already reserved/sent at this stage.");
   else if (action === "escalate") check(state.eligible && !state.paused && state.stage === 14 && !state.escalated, "Escalation is not eligible.");
   else check(!state.completed, "Recovery is complete.");
   const type: RecoveryEvent["type"] = action === "send" ? "REMINDER" : action === "escalate" ? "ESCALATION" : "RETRY";
   const event = { id: crypto.randomUUID(), invoiceId: id, subscriptionId: row.subscriptionId, idempotencyKey: `demo-recovery:${crypto.randomUUID()}`, type, status: action === "send" ? "SKIPPED" as const : "SUCCEEDED" as const, attemptNumber: Math.max(0, ...row.history.filter(e => e.type === type).map(e => e.attemptNumber)) + 1, scheduledFor: now.toISOString(), executedAt: now.toISOString(), errorMessage: null, metadata: { action, stage: state.stage, actorId: actor.id, ...(action === "send" ? { delivery: "PREVIEWED" } : {}) }, createdAt: now.toISOString(), updatedAt: now.toISOString() };
   row.history.push(event); return { data: structuredClone(event) };
  },
 };
}
export const mockIntelligenceAdapter = createMockIntelligenceAdapter();
