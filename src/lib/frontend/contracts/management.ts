import type { CurrentUser } from "./auth";
import type { InvoiceStatus } from "./analytics";

export type BillingInterval = "DAY" | "WEEK" | "MONTH" | "YEAR";
export type SubscriptionStatus = "DRAFT" | "TRIALING" | "ACTIVE" | "PAUSED" | "PAST_DUE" | "CANCELED" | "EXPIRED";
export type QuotationStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";
export interface ProductInput { name: string; description: string; type: "SERVICE" | "GOODS"; currency: string; sellingPriceMinor: number; costPriceMinor: number; isActive: boolean; isPublished: boolean }
export interface Product extends ProductInput { id: string }
export interface VariantInput { productId: string; name: string; sku: string; additionalPriceMinor: number; isActive: boolean }
export interface Variant extends VariantInput { id: string }
export interface LifecyclePermissions { allowPause: boolean; allowResume: boolean; allowRenew: boolean; allowEarlyClosure: boolean; autoCloseAtExpiry: boolean }
export interface PlanInput extends LifecyclePermissions { variantId: string; code: string; name: string; currency: string; unitAmountMinor: number; interval: BillingInterval; intervalCount: number; minimumQuantity: number; trialDays: number; isActive: boolean; isPublished: boolean }
export interface Plan extends PlanInput { id: string }
export interface CustomerInput { name: string; email: string; companyName: string; phone: string; currency: string; isActive: boolean }
export interface Customer extends CustomerInput { id: string }
export interface Tax { id: string; name: string; rateBps: number; isActive: boolean }
export interface Discount { id: string; name: string; type: "PERCENTAGE"; percentageBps: number; scope: "SUBSCRIPTION"; isActive: boolean }
export interface QuotationLineInput { planId: string; quantity: number; unitAmountMinor: number; taxRuleId?: string; discountRuleId?: string }
export interface QuotationInput { customerId: string; items: QuotationLineInput[]; validUntil: string; paymentTermsDays: number; notes: string }
export interface DocumentLine extends QuotationLineInput { description: string }
export interface Quotation { id: string; number: string; customerId: string; currency: string; status: QuotationStatus; items: DocumentLine[]; validUntil: string; paymentTermsDays: number; notes: string; subscriptionId: string | null }
export interface ConvertInput { startsAt: string; endsAt?: string }
export type SubscriptionAction = "activate" | "pause" | "resume" | "renew" | "close";
export interface Subscription { id: string; number: string; customerId: string; quotationId: string | null; currency: string; status: SubscriptionStatus; items: DocumentLine[]; permissions: LifecyclePermissions; interval: BillingInterval; intervalCount: number; startsAt: string; endsAt: string | null; history: { action: string; status: SubscriptionStatus; at: string }[] }
export interface Invoice { id: string; number: string; customerId: string; subscriptionId: string; currency: string; status: InvoiceStatus; totalMinor: number; paidMinor: number; outstandingMinor: number; issuedAt: string; dueAt: string; items: DocumentLine[] }
// Body for POST /api/invoices/:id/payments. Currency/customer derive from invoice.
export interface RecordPaymentInput { idempotencyKey: string; amountMinor: number; method: PaymentMethod; paidAt: string; reference: string; notes?: string }
// invoiceId is a frontend view projection from allocation records, not a request field.
export interface Payment extends RecordPaymentInput { id: string; invoiceId: string; customerId: string; currency: string; status: "COMPLETED" }
export interface ManagementSnapshot { products: Product[]; variants: Variant[]; plans: Plan[]; customers: Customer[]; quotations: Quotation[]; subscriptions: Subscription[]; invoices: Invoice[]; payments: Payment[]; taxes: Tax[]; discounts: Discount[] }
// UI facade over the catalog, management and invoice endpoint families. Future HTTP
// adapters normalize API envelopes and compose related reads into this snapshot.
export interface ManagementAdapter {
 load(actor: CurrentUser): Promise<ManagementSnapshot>;
 saveProduct(actor: CurrentUser, input: ProductInput, id?: string): Promise<void>;
 saveVariant(actor: CurrentUser, input: VariantInput, id?: string): Promise<void>;
 savePlan(actor: CurrentUser, input: PlanInput, id?: string): Promise<void>;
 saveCustomer(actor: CurrentUser, input: CustomerInput): Promise<void>;
 createQuotation(actor: CurrentUser, input: QuotationInput): Promise<void>;
 quotationAction(actor: CurrentUser, id: string, action: "send" | "confirm" | "reject"): Promise<void>;
 convertQuotation(actor: CurrentUser, id: string, input: ConvertInput): Promise<void>;
 subscriptionAction(actor: CurrentUser, id: string, action: SubscriptionAction, input?: { endsAt: string }): Promise<void>;
 recordPayment(actor: CurrentUser, invoiceId: string, input: RecordPaymentInput): Promise<void>;
}
export const sections = ["products", "plans", "customers", "quotations", "subscriptions", "invoices", "payments", "revenue-simulator", "subscription-health", "payment-recovery"] as const;
export type ManagementSection = typeof sections[number];
