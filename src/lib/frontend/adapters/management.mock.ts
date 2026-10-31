import type { CurrentUser } from "../contracts/auth";
import type { ManagementAdapter, ManagementSnapshot, Plan, SubscriptionStatus } from "../contracts/management";
import { managementFixtures } from "../fixtures/management";
import { check, currencyCode, integer, isoDate, lifecycleReason, text } from "../management-validation";

// Disposable, browser-module state. No storage, network, billing schedule or database.
export function createMockManagementAdapter(): ManagementAdapter {
 const state: ManagementSnapshot = structuredClone(managementFixtures);
 const staff = (actor: CurrentUser) => check(actor.role === "ADMIN" || actor.role === "STAFF", "Staff access is required.");
 const admin = (actor: CurrentUser) => check(actor.role === "ADMIN", "Only an Admin can edit catalog configuration.");
 const id = () => crypto.randomUUID();
 const unique = (rows: { id: string }[], key: string, value: string, existingId?: string) => check(!rows.some(row => row.id !== existingId && (row as unknown as Record<string, unknown>)[key] === value), `${key} is already in use.`);
 function eligiblePlan(plan: Plan) {
  const variant = state.variants.find(v => v.id === plan.variantId);
  const product = state.products.find(p => p.id === variant?.productId);
  check(plan.isActive && variant?.isActive && product?.isActive, "Selected plans, variants and products must be active.");
 }
 return {
  async load(actor) {
   const snapshot = structuredClone(state);
   if (actor.role !== "CUSTOMER") return snapshot;
   const owns = (row: { customerId: string }) => row.customerId === actor.customerId;
   snapshot.customers = snapshot.customers.filter(c => c.id === actor.customerId);
   snapshot.quotations = snapshot.quotations.filter(owns);
   snapshot.subscriptions = snapshot.subscriptions.filter(owns);
   snapshot.invoices = snapshot.invoices.filter(i => owns(i) && i.status !== "DRAFT");
   snapshot.payments = snapshot.payments.filter(owns);
   // Customer screens don't expose internal catalog or pricing configuration.
   snapshot.products = []; snapshot.variants = []; snapshot.plans = []; snapshot.taxes = []; snapshot.discounts = [];
   return snapshot;
  },
  async saveProduct(actor, input, existingId) {
   admin(actor); text(input.name, "Product name"); currencyCode(input.currency);
   integer(input.sellingPriceMinor, "Selling price"); integer(input.costPriceMinor, "Cost price");
   const old = existingId ? state.products.find(p => p.id === existingId) : null;
   check(!existingId || old, "Product not found."); check(!old || old.currency === input.currency, "Product currency cannot change.");
   check(state.variants.filter(v => v.productId === existingId).every(v => Number.isSafeInteger(input.sellingPriceMinor + v.additionalPriceMinor) && input.sellingPriceMinor + v.additionalPriceMinor <= 2147483647), "A variant's effective price exceeds the supported range.");
   if (old) Object.assign(old, input); else state.products.push({ ...input, id: id() });
  },
  async saveVariant(actor, input, existingId) {
   admin(actor); text(input.name, "Variant name"); text(input.sku, "SKU"); integer(input.additionalPriceMinor, "Additional price"); unique(state.variants, "sku", input.sku, existingId);
   const product = state.products.find(p => p.id === input.productId); check(product, "Product not found."); integer(product.sellingPriceMinor + input.additionalPriceMinor, "Effective price");
   const old = existingId ? state.variants.find(v => v.id === existingId) : null;
   check(!existingId || old, "Variant not found."); check(!old || old.productId === input.productId, "A variant cannot move to another product.");
   check(!state.variants.some(v => v.id !== existingId && v.productId === input.productId && v.name === input.name), "Variant name already exists for this product.");
   if (old) Object.assign(old, input); else state.variants.push({ ...input, id: id() });
  },
  async savePlan(actor, input, existingId) {
   admin(actor); text(input.name, "Plan name"); text(input.code, "Plan code"); currencyCode(input.currency); unique(state.plans, "code", input.code, existingId);
   integer(input.unitAmountMinor, "Price"); integer(input.intervalCount, "Billing interval count", 1); integer(input.minimumQuantity, "Minimum quantity", 1); integer(input.trialDays, "Trial days");
   const variant = state.variants.find(v => v.id === input.variantId); const product = state.products.find(p => p.id === variant?.productId);
   check(product && product.currency === input.currency, "Plan currency must match the selected product.");
   const old = existingId ? state.plans.find(p => p.id === existingId) : null;
   check(!existingId || old, "Plan not found."); check(!old || old.variantId === input.variantId, "A plan cannot move to another variant.");
   if (old) Object.assign(old, input); else state.plans.push({ ...input, id: id() });
  },
  async saveCustomer(actor, input) {
   staff(actor); text(input.name, "Customer name", 120); check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email), "Enter a valid email."); currencyCode(input.currency);
   const email = input.email.trim().toLowerCase(); unique(state.customers, "email", email); state.customers.push({ ...input, email, id: id() });
  },
  async createQuotation(actor, input) {
   staff(actor); const customer = state.customers.find(c => c.id === input.customerId); check(customer?.isActive, "Choose an active customer.");
   check(input.items.length > 0 && input.items.length <= 100, "Add between 1 and 100 lines.");
   check(isoDate(input.validUntil, "valid-until date") > Date.now(), "Quotation validity must be in the future."); integer(input.paymentTermsDays, "Payment terms", 0, 365);
   const plans = input.items.map(line => { const plan = state.plans.find(p => p.id === line.planId); check(plan, "Plan not found."); eligiblePlan(plan); integer(line.quantity, "Quantity", plan.minimumQuantity, 100000); integer(line.unitAmountMinor, "Agreed price"); integer(line.unitAmountMinor * line.quantity, "Line subtotal"); check(plan.currency === customer.currency, "All plans must match the customer's currency."); check(!line.taxRuleId || state.taxes.some(t => t.id === line.taxRuleId && t.isActive), "Invalid tax selection."); check(!line.discountRuleId || state.discounts.some(d => d.id === line.discountRuleId && d.isActive), "Invalid discount selection."); return plan; });
   check(plans.every(p => p.interval === plans[0].interval && p.intervalCount === plans[0].intervalCount), "All quotation lines must share the same billing frequency.");
   check(input.items.every(line => line.discountRuleId === input.items[0].discountRuleId), "Apply the subscription discount consistently to every line.");
   state.quotations.unshift({ ...input, id: id(), number: `QUO-DEMO-${state.quotations.length + 1}`, currency: customer.currency, status: "DRAFT", items: input.items.map((line, i) => ({ ...line, description: plans[i].name })), subscriptionId: null });
  },
  async quotationAction(actor, quoteId, action) {
   staff(actor); const quote = state.quotations.find(q => q.id === quoteId); check(quote, "Quotation not found.");
   check(Date.parse(quote.validUntil) > Date.now(), "This quotation has expired.");
   check(action === "send" ? quote.status === "DRAFT" : quote.status === "SENT", "This action is unavailable in the current status.");
   quote.status = action === "send" ? "SENT" : action === "confirm" ? "ACCEPTED" : "REJECTED";
  },
  async convertQuotation(actor, quoteId, input) {
   staff(actor); const quote = state.quotations.find(q => q.id === quoteId); check(quote, "Quotation not found.");
   check(quote.status === "ACCEPTED" && !quote.subscriptionId && Date.parse(quote.validUntil) > Date.now(), "Only a valid, accepted, unconverted quotation can be converted.");
   check(state.customers.find(c => c.id === quote.customerId)?.isActive, "The customer must be active.");
   const start = isoDate(input.startsAt, "start date"); if (input.endsAt) check(isoDate(input.endsAt, "expiry date") > start, "Expiry must follow the start date.");
   const plans = quote.items.map(line => { const plan = state.plans.find(p => p.id === line.planId); check(plan, "Plan not found."); eligiblePlan(plan); return plan; });
   check(plans.every(p => p.interval === plans[0].interval && p.intervalCount === plans[0].intervalCount && p.currency === quote.currency), "Plan billing frequency or currency changed. Review the quotation.");
   const permissions = { allowPause: plans.every(p => p.allowPause), allowResume: plans.every(p => p.allowResume), allowRenew: plans.every(p => p.allowRenew), allowEarlyClosure: plans.every(p => p.allowEarlyClosure), autoCloseAtExpiry: plans.every(p => p.autoCloseAtExpiry) };
   const subscriptionId = id();
   state.subscriptions.unshift({ id: subscriptionId, number: `SUB-DEMO-${state.subscriptions.length + 1}`, customerId: quote.customerId, quotationId: quote.id, currency: quote.currency, status: "DRAFT", items: structuredClone(quote.items), permissions, interval: plans[0].interval, intervalCount: plans[0].intervalCount, startsAt: input.startsAt, endsAt: input.endsAt ?? null, history: [{ action: "confirm", status: "DRAFT", at: new Date().toISOString() }] });
   quote.subscriptionId = subscriptionId;
  },
  async subscriptionAction(actor, subscriptionId, action, input) {
   staff(actor); const sub = state.subscriptions.find(s => s.id === subscriptionId); check(sub, "Subscription not found.");
   const reason = lifecycleReason(sub, action); check(!reason, reason ?? "Action unavailable.");
   if (["activate", "resume", "renew"].includes(action)) check(state.customers.find(c => c.id === sub.customerId)?.isActive, "The customer must be active.");
   if (action === "renew") { const end = isoDate(input?.endsAt ?? "", "renewal expiry"); check(end > Date.now() && (!sub.endsAt || end > Date.parse(sub.endsAt)), "Renewal must extend the expiry beyond its current date and today."); sub.endsAt = input!.endsAt; if (sub.status === "EXPIRED") sub.startsAt = new Date().toISOString(); }
   const next: Record<string, SubscriptionStatus> = { activate: "ACTIVE", pause: "PAUSED", resume: "ACTIVE", close: "CANCELED" };
   sub.status = action === "renew" ? sub.status === "EXPIRED" ? "ACTIVE" : sub.status : next[action];
   sub.history.push({ action, status: sub.status, at: new Date().toISOString() });
  },
  async recordPayment(actor, invoiceId, input) {
   staff(actor); const invoice = state.invoices.find(i => i.id === invoiceId); check(invoice, "Invoice not found.");
   integer(input.amountMinor, "Payment amount", 1); text(input.reference, "Reference"); text(input.idempotencyKey, "Request key"); check(input.idempotencyKey.length >= 8, "Request key must have at least 8 characters.");
   check(isoDate(input.paidAt, "payment date") <= Date.now(), "Payment date cannot be in the future.");
   const previous = state.payments.find(p => p.idempotencyKey === input.idempotencyKey);
   if (previous) { check(previous.invoiceId === invoiceId && previous.amountMinor === input.amountMinor && previous.method === input.method && previous.reference === input.reference && previous.paidAt === input.paidAt && (previous.notes ?? "") === (input.notes ?? ""), "The request key was reused with different payment details."); return; }
   check(["OPEN", "PARTIALLY_PAID"].includes(invoice.status), "Only open or partially paid invoices accept payments.");
   check(input.amountMinor <= invoice.outstandingMinor, "Payment exceeds the outstanding balance.");
   check(!state.payments.some(p => p.customerId === invoice.customerId && p.method === input.method && p.reference === input.reference), "This payment reference has already been recorded.");
   state.payments.unshift({ ...input, id: id(), invoiceId, customerId: invoice.customerId, currency: invoice.currency, status: "COMPLETED" });
   invoice.paidMinor += input.amountMinor; invoice.outstandingMinor -= input.amountMinor; invoice.status = invoice.outstandingMinor ? "PARTIALLY_PAID" : "PAID";
  },
 };
}
export const mockManagementAdapter = createMockManagementAdapter();
