import { createApiClients } from "../api/clients";
import { createApiTransport } from "../api/transport";
import type { AnalyticsAdapter, ApiList } from "../contracts/analytics";
import type { ManagementAdapter, ManagementSnapshot, LifecyclePermissions, DocumentLine } from "../contracts/management";
import type { IntelligenceAdapter } from "../contracts/intelligence";

export async function allPages<T>(load: (page: number) => Promise<ApiList<T>>): Promise<T[]> {
 const rows: T[] = [];
 for (let page = 1; ; page++) { const result = await load(page); rows.push(...result.data); if (rows.length >= result.meta.total || !result.data.length) return rows; }
}
export function createLiveAdapters(api: ReturnType<typeof createApiClients>) {
 async function directory<T>(load: (page: number) => Promise<ApiList<T>>) { const data = await allPages(load); return { data, meta: { page: 1, pageSize: data.length, total: data.length } }; }
 const analytics: AnalyticsAdapter = { ...api.analytics, plans: query => directory(page => api.analytics.plans({ ...query, page, pageSize: 100 })), renewals: query => directory(page => api.analytics.renewals({ ...query, page, pageSize: 100 })) };
 const management: ManagementAdapter = {
  async load(actor) {
   const catalog = <R extends "products" | "variants" | "plans" | "taxes" | "discounts">(resource: R) => allPages(page => api.catalog.list(resource, { page, pageSize: 100 }));
   const [products, variants, plans, customers, quotes, subs, bills, taxes, discounts] = await Promise.all([
    catalog("products"), catalog("variants"), catalog("plans"), allPages(page => api.customers.list({ page, pageSize: 100 })),
    allPages(page => api.quotations.list({ page, pageSize: 100 })), allPages(page => api.subscriptions.list({ page, pageSize: 100 })), allPages(page => api.invoices.list({ page, pageSize: 100 })),
    actor.role === "CUSTOMER" ? [] : catalog("taxes"), actor.role === "CUSTOMER" ? [] : catalog("discounts"),
   ]);
   // List endpoints omit document lines. Read details in bounded groups.
   async function details<T, U>(rows: T[], read: (row: T) => Promise<U>) { const out: U[] = []; for (let i = 0; i < rows.length; i += 8) out.push(...await Promise.all(rows.slice(i, i + 8).map(read))); return out; }
   const [quotations, subscriptions, invoices] = await Promise.all([
    details(quotes, async q => (await api.quotations.detail(q.id)).data),
    details(subs, async s => {
     const detail = (await api.subscriptions.detail(s.id)).data;
     const activities: NonNullable<typeof detail.activities> = [];
     for (let page = 1; ; page++) { const batch = (await api.subscriptions.history(s.id, { page, pageSize: 100 })).data.activities; activities.push(...batch); if (batch.length < 100) break; }
     return { ...detail, activities };
    }),
    details(bills, async i => (await api.invoices.detail(i.id)).data),
   ]);
   const line = (item: { description: string; quantity: number; unitAmountMinor: number; planId?: string; taxRuleId?: string | null; discountRuleId?: string | null }): DocumentLine => ({ description: item.description, quantity: item.quantity, unitAmountMinor: item.unitAmountMinor, planId: item.planId ?? "", ...(item.taxRuleId ? { taxRuleId: item.taxRuleId } : {}), ...(item.discountRuleId ? { discountRuleId: item.discountRuleId } : {}) });
   const flags: (keyof LifecyclePermissions)[] = ["allowPause", "allowResume", "allowRenew", "allowEarlyClosure", "autoCloseAtExpiry"];
   const snapshot: ManagementSnapshot = {
    products: products.map(p => ({ ...p, description: p.description ?? "", costPriceMinor: p.costPriceMinor ?? 0, isActive: p.isActive ?? true, isPublished: p.isPublished ?? true })),
    variants: variants.map(v => ({ ...v, isActive: v.isActive ?? true })),
    plans: plans.map(p => ({ ...p, code: p.code ?? "", isActive: p.isActive ?? true, isPublished: p.isPublished ?? true })),
    customers: customers.map(c => ({ ...c, companyName: c.companyName ?? "", phone: c.phone ?? "" })),
    quotations: quotations.map(q => ({ ...q, items: (q.items ?? []).map(line), validUntil: q.validUntil ?? "", notes: q.notes ?? "", subscriptionId: q.subscription?.id ?? null })),
    subscriptions: subscriptions.map(s => ({ ...s, items: (s.items ?? []).map(line), permissions: Object.fromEntries(flags.map(flag => [flag, !!s.items?.length && s.items.every(item => item[flag])])) as unknown as LifecyclePermissions, history: (s.activities ?? []).map(a => ({ action: a.action, status: a.toStatus, at: a.createdAt })) })),
    invoices: invoices.map(i => ({ ...i, subscriptionId: i.subscriptionId ?? "", issuedAt: i.issuedAt ?? "", dueAt: i.dueAt ?? "", items: (i.items ?? []).map(line) })),
    payments: invoices.flatMap(i => i.payments.filter(a => a.payment.status === "COMPLETED").map(a => ({ id: a.payment.id, invoiceId: i.id, customerId: i.customerId, currency: i.currency, status: "COMPLETED" as const, amountMinor: a.amountMinor, method: a.payment.method, paidAt: a.payment.paidAt ?? "", reference: a.payment.reference ?? "", idempotencyKey: "" }))),
    taxes, discounts: discounts.filter(d => d.type === "PERCENTAGE" && d.scope === "SUBSCRIPTION").map(d => ({ ...d, type: "PERCENTAGE" as const, scope: "SUBSCRIPTION" as const, percentageBps: d.percentageBps ?? 0 })),
   };
   return snapshot;
  },
  async saveProduct(_actor, input, id) { if (id) await api.catalog.update("products", id, input); else await api.catalog.create("products", input); },
  async saveVariant(_actor, input, id) { if (id) await api.catalog.update("variants", id, input); else await api.catalog.create("variants", input); },
  async savePlan(_actor, input, id) { if (id) await api.catalog.update("plans", id, input); else await api.catalog.create("plans", input); },
  async saveCustomer(_actor, input) { await api.customers.create(input); },
  async createQuotation(_actor, input) { await api.quotations.create(input); },
  async quotationAction(_actor, id, action) { await api.quotations.action(id, action); },
  async convertQuotation(_actor, id, input) { await api.quotations.convert(id, input); },
  async subscriptionAction(_actor, id, action, input) { if (action === "renew") { if (!input) throw Error("Renewal expiry required"); await api.subscriptions.renew(id, input); } else await api.subscriptions.action(id, action); },
  async recordPayment(_actor, id, input) { await api.invoices.recordPayment(id, input); },
 };
 const intelligence: IntelligenceAdapter = {
  simulate: (_actor, input) => api.simulation.run(input), health: (_actor, query) => directory(page => api.health.list({ ...query, page, pageSize: 100 })), healthSummary: (_actor, query) => api.health.summary(query), healthDetail: (_actor, id) => api.health.detail(id),
  recovery: (_actor, query) => directory(page => api.recovery.list({ ...query, page, pageSize: 100 })), recoveryDetail: (_actor, id) => api.recovery.detail(id), reminderPreview: (_actor, id) => api.recovery.preview(id), recoveryHistory: (_actor, id) => api.recovery.history(id), recoveryAction: (_actor, id, action) => api.recovery.action(id, action),
 };
 return { authAdapter: api.auth, managementAdapter: management, intelligenceAdapter: intelligence, analyticsAdapter: analytics };
}
export const liveClients = createApiClients(createApiTransport({ integrationApproved: true, timeoutMs: 45000 }));
