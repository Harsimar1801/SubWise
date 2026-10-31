import type { FinancialInvoice, FinancialSubscription } from "../contracts/intelligence";
export const intelligenceAsOf = "2026-10-31T12:00:00Z";
export const intelligenceSubscriptions: FinancialSubscription[] = [
 { id: "intel-healthy", customerId: "demo-acme", planId: "plan-growth", status: "ACTIVE", startsAt: "2026-01-01T00:00:00Z", endsAt: "2027-10-01T00:00:00Z", pausedAt: null, canceledAt: null, cancelAtPeriodEnd: false, customerActive: true },
 { id: "intel-attention", customerId: "customer-zenith", planId: "plan-growth", status: "ACTIVE", startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-11-20T00:00:00Z", pausedAt: null, canceledAt: null, cancelAtPeriodEnd: false, customerActive: true },
 { id: "intel-risk", customerId: "customer-nexus", planId: "plan-enterprise", status: "ACTIVE", startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-11-10T00:00:00Z", pausedAt: null, canceledAt: null, cancelAtPeriodEnd: false, customerActive: true },
];
export const intelligenceInvoices: FinancialInvoice[] = [
 { id: "recover-day3", number: "DEMO-INV-3001", subscriptionId: "intel-attention", customerId: "customer-zenith", customerName: "Maya Silva", currency: "LKR", status: "OPEN", totalMinor: 150000, dueAt: "2026-10-28T00:00:00Z", allocations: [], history: [] },
 { id: "recover-day7", number: "DEMO-INV-3002", subscriptionId: "intel-risk", customerId: "customer-nexus", customerName: "Nimal Perera", currency: "LKR", status: "PARTIALLY_PAID", totalMinor: 250000, dueAt: "2026-10-24T00:00:00Z", allocations: [{ amountMinor: 50000, status: "COMPLETED", paidAt: "2026-10-25T00:00:00Z" }], history: [] },
 { id: "recover-day14", number: "DEMO-INV-3003", subscriptionId: "intel-risk", customerId: "customer-nexus", customerName: "Nimal Perera", currency: "LKR", status: "PARTIALLY_PAID", totalMinor: 400000, dueAt: "2026-10-15T00:00:00Z", allocations: [{ amountMinor: 100000, status: "COMPLETED", paidAt: "2026-10-18T00:00:00Z" }], history: [] },
 { id: "intel-paid-late", number: "DEMO-INV-2901", subscriptionId: "intel-risk", customerId: "customer-nexus", customerName: "Nimal Perera", currency: "LKR", status: "PAID", totalMinor: 100000, dueAt: "2026-09-15T00:00:00Z", allocations: [{ amountMinor: 100000, status: "COMPLETED", paidAt: "2026-09-20T00:00:00Z" }], history: [] },
];
