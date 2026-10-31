import type { ManagementSnapshot, LifecyclePermissions } from "../contracts/management";
const permissions: LifecyclePermissions = { allowPause: true, allowResume: true, allowRenew: true, allowEarlyClosure: true, autoCloseAtExpiry: true };
const lines = [{ planId: "plan-growth", description: "Growth Monthly", quantity: 2, unitAmountMinor: 150000, taxRuleId: "tax-vat" }];
export const managementFixtures: ManagementSnapshot = {
 products: [
  { id: "product-cloud", name: "Cloud Workspace", description: "A shared workspace for your team.", type: "SERVICE", currency: "LKR", sellingPriceMinor: 150000, costPriceMinor: 70000, isActive: true, isPublished: true },
  { id: "product-support", name: "Priority Support", description: "Dedicated support subscription.", type: "SERVICE", currency: "LKR", sellingPriceMinor: 50000, costPriceMinor: 20000, isActive: true, isPublished: false },
 ],
 variants: [
  { id: "variant-standard", productId: "product-cloud", name: "Standard", sku: "CLOUD-STD", additionalPriceMinor: 0, isActive: true },
  { id: "variant-plus", productId: "product-cloud", name: "Plus", sku: "CLOUD-PLUS", additionalPriceMinor: 50000, isActive: true },
  { id: "variant-support", productId: "product-support", name: "Business", sku: "SUP-BIZ", additionalPriceMinor: 0, isActive: true },
 ],
 plans: [
  { id: "plan-growth", variantId: "variant-standard", code: "GROWTH-M", name: "Growth Monthly", currency: "LKR", unitAmountMinor: 150000, interval: "MONTH", intervalCount: 1, minimumQuantity: 1, trialDays: 0, isActive: true, isPublished: true, ...permissions },
  { id: "plan-enterprise", variantId: "variant-plus", code: "ENTERPRISE-Y", name: "Enterprise Annual", currency: "LKR", unitAmountMinor: 2000000, interval: "YEAR", intervalCount: 1, minimumQuantity: 2, trialDays: 0, isActive: true, isPublished: true, ...permissions, allowEarlyClosure: false },
 ],
 customers: [
  { id: "demo-acme", name: "Alex Morgan", email: "customer@subwise.demo", companyName: "Acme Enterprises", phone: "+94 11 555 0100", currency: "LKR", isActive: true },
  { id: "customer-nexus", name: "Nimal Perera", email: "billing@nexus.example", companyName: "Nexus Media", phone: "+94 11 555 0120", currency: "LKR", isActive: true },
  { id: "customer-zenith", name: "Maya Silva", email: "finance@zenith.example", companyName: "Zenith Logistics", phone: "+94 11 555 0130", currency: "LKR", isActive: true },
 ],
 quotations: [
  { id: "quote-draft", number: "QUO-1003", customerId: "customer-zenith", currency: "LKR", status: "DRAFT", items: lines, validUntil: "2027-12-31T00:00:00Z", paymentTermsDays: 14, notes: "Team workspace proposal", subscriptionId: null },
  { id: "quote-accepted", number: "QUO-1002", customerId: "demo-acme", currency: "LKR", status: "ACCEPTED", items: lines, validUntil: "2027-12-31T00:00:00Z", paymentTermsDays: 14, notes: "Approved workspace proposal", subscriptionId: null },
 ],
 subscriptions: [
  { id: "subscription-acme", number: "SUB-1001", customerId: "demo-acme", quotationId: null, currency: "LKR", status: "ACTIVE", items: lines, permissions, interval: "MONTH", intervalCount: 1, startsAt: "2026-10-01T00:00:00Z", endsAt: "2027-10-01T00:00:00Z", history: [{ action: "activate", status: "ACTIVE", at: "2026-10-01T00:00:00Z" }] },
  { id: "subscription-nexus", number: "SUB-1002", customerId: "customer-nexus", quotationId: null, currency: "LKR", status: "PAUSED", items: lines, permissions, interval: "MONTH", intervalCount: 1, startsAt: "2026-09-01T00:00:00Z", endsAt: "2027-09-01T00:00:00Z", history: [{ action: "pause", status: "PAUSED", at: "2026-10-20T00:00:00Z" }] },
 ],
 invoices: [
  { id: "invoice-acme", number: "INV-1001", customerId: "demo-acme", subscriptionId: "subscription-acme", currency: "LKR", status: "PARTIALLY_PAID", totalMinor: 354000, paidMinor: 100000, outstandingMinor: 254000, issuedAt: "2026-10-01T00:00:00Z", dueAt: "2026-10-15T00:00:00Z", items: lines },
  { id: "invoice-nexus", number: "INV-1002", customerId: "customer-nexus", subscriptionId: "subscription-nexus", currency: "LKR", status: "OPEN", totalMinor: 354000, paidMinor: 0, outstandingMinor: 354000, issuedAt: "2026-10-20T00:00:00Z", dueAt: "2026-11-03T00:00:00Z", items: lines },
  { id: "invoice-paid", number: "INV-0998", customerId: "demo-acme", subscriptionId: "subscription-acme", currency: "LKR", status: "PAID", totalMinor: 354000, paidMinor: 354000, outstandingMinor: 0, issuedAt: "2026-09-01T00:00:00Z", dueAt: "2026-09-15T00:00:00Z", items: lines },
 ],
 payments: [
  { id: "payment-partial", invoiceId: "invoice-acme", customerId: "demo-acme", currency: "LKR", status: "COMPLETED", idempotencyKey: "seed-partial-1001", amountMinor: 100000, method: "BANK_TRANSFER", paidAt: "2026-10-12T00:00:00Z", reference: "BANK-1001", notes: "Partial settlement", },
  { id: "payment-full", invoiceId: "invoice-paid", customerId: "demo-acme", currency: "LKR", status: "COMPLETED", idempotencyKey: "seed-full-0998", amountMinor: 354000, method: "BANK_TRANSFER", paidAt: "2026-09-10T00:00:00Z", reference: "BANK-0998", notes: "", },
 ],
 taxes: [{ id: "tax-vat", name: "VAT 18%", rateBps: 1800, isActive: true }],
 discounts: [{ id: "discount-team", name: "Team offer 10%", type: "PERCENTAGE", percentageBps: 1000, scope: "SUBSCRIPTION", isActive: true }],
};
