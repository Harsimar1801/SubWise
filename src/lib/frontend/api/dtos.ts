// Wire DTOs from origin/dev/backend f65630f. Dates stay ISO strings and JSON
// stays browser-safe. These are deliberately distinct from the mock UI facade.
import type { BillingInterval, LifecyclePermissions, PaymentMethod, QuotationStatus, SubscriptionStatus } from "../contracts/management";
import type { InvoiceStatus } from "../contracts/analytics";
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
interface Stamps { createdAt?: string; updatedAt?: string }
export interface Paging { page?: number; pageSize?: number }
export interface CatalogQuery extends Paging { search?: string; productId?: string; variantId?: string }
export interface ManagementQuery extends Paging { search?: string; customerId?: string; status?: string }
export interface InvoiceQuery extends Paging { status?: InvoiceStatus; overdue?: "true" | "false" }
export interface ProductDto extends Stamps { id: string; name: string; description: string | null; type: "SERVICE" | "GOODS"; currency: string; sellingPriceMinor: number; costPriceMinor?: number; internalNotes?: string | null; isActive?: boolean; isPublished?: boolean }
export interface ProductCreate { name: string; type: "SERVICE" | "GOODS"; currency: string; sellingPriceMinor: number; costPriceMinor: number; description?: string | null; internalNotes?: string | null; isActive?: boolean; isPublished?: boolean }
export interface VariantDto extends Stamps { id: string; productId: string; name: string; sku: string; attributes: Record<string, string> | null; additionalPriceMinor: number; isActive?: boolean }
export interface VariantCreate { productId: string; name: string; sku: string; additionalPriceMinor: number; attributes?: Record<string, string>; isActive?: boolean }
export interface PlanDto extends LifecyclePermissions, Stamps { id: string; variantId: string; code?: string; name: string; description: string | null; currency: string; unitAmountMinor: number; interval: BillingInterval; intervalCount: number; minimumQuantity: number; trialDays: number; availableFrom: string | null; availableUntil: string | null; isActive?: boolean; isPublished?: boolean }
export interface PlanCreate extends Partial<LifecyclePermissions> { variantId: string; code: string; name: string; currency: string; unitAmountMinor: number; interval: BillingInterval; intervalCount: number; trialDays: number; minimumQuantity: number; description?: string | null; availableFrom?: string | null; availableUntil?: string | null; isActive?: boolean; isPublished?: boolean }
export interface TaxCreate { code: string; name: string; rateBps: number; isActive?: boolean }
export interface TaxDto extends TaxCreate, Stamps { id: string; isActive: boolean }
export interface DiscountCreate { code: string; name: string; type: "FIXED" | "PERCENTAGE"; amountMinor?: number | null; currency?: string | null; percentageBps?: number | null; startsAt?: string | null; endsAt?: string | null; minimumPurchaseMinor: number; minimumQuantity: number; maximumUses?: number | null; scope: "PRODUCT" | "SUBSCRIPTION"; productId?: string | null; isActive?: boolean }
export interface DiscountDto extends Stamps { id: string; code: string; name: string; type: "FIXED" | "PERCENTAGE"; amountMinor: number | null; currency: string | null; percentageBps: number | null; startsAt: string | null; endsAt: string | null; minimumPurchaseMinor: number; minimumQuantity: number; maximumUses: number | null; scope: "PRODUCT" | "SUBSCRIPTION"; productId: string | null; usageCount: number; isActive: boolean }
export interface CatalogRecords { products: ProductDto; variants: VariantDto; plans: PlanDto; taxes: TaxDto; discounts: DiscountDto }
export interface CatalogCreates { products: ProductCreate; variants: VariantCreate; plans: PlanCreate; taxes: TaxCreate; discounts: DiscountCreate }
export interface CustomerCreate { name: string; email: string; phone?: string | null; companyName?: string | null; billingAddress?: Record<string, string>; taxId?: string | null; currency?: string; userId?: string | null; isActive?: boolean }
export interface CustomerDto extends Stamps { id: string; userId: string | null; name: string; email: string; phone: string | null; companyName: string | null; billingAddress: JsonValue; taxId: string | null; currency: string; isActive: boolean }
export interface QuotationLineCreate { planId: string; quantity: number; unitAmountMinor?: number; taxRuleId?: string; discountRuleId?: string }
export interface QuotationCreate { customerId: string; templateId?: string; items?: QuotationLineCreate[]; validUntil?: string; paymentTermsDays?: number; notes?: string | null }
export interface TemplateContent { validityDays: number; items: QuotationLineCreate[] }
export interface TemplateCreate { name: string; description?: string | null; content: TemplateContent; isActive?: boolean }
export interface TemplateDto extends Stamps { id: string; name: string; description: string | null; content: JsonValue; isActive: boolean; createdById: string | null }
export interface DocumentLineDto { id: string; position: number; description: string; quantity: number; unitAmountMinor: number; taxRuleId: string | null; discountRuleId: string | null; taxRateBps: number; discountAmountMinor: number; taxAmountMinor: number; totalMinor: number }
export interface QuotationItemDto extends DocumentLineDto { quotationId: string; planId: string; interval: BillingInterval; intervalCount: number }
export interface DocumentTotals { currency: string; subtotalMinor: number; discountTotalMinor: number; taxTotalMinor: number; totalMinor: number }
export interface QuotationDto extends DocumentTotals, Stamps { id: string; number: string; customerId: string; templateId: string | null; createdById: string | null; status: QuotationStatus; validUntil: string | null; acceptedAt: string | null; paymentTermsDays: number; notes: string | null; items?: QuotationItemDto[]; subscription?: { id: string; number: string } | null }
// Subscription item amounts/permissions are agreed snapshots, not current plan fields.
export interface SubscriptionItemDto extends LifecyclePermissions, Stamps { id: string; subscriptionId: string; planId: string; position: number; description: string; quantity: number; unitAmountMinor: number; taxRuleId: string | null; discountRuleId: string | null; taxRateBps: number; discountAmountMinor: number }
export interface SubscriptionActivityDto { id: string; subscriptionId: string; actorId: string | null; action: string; fromStatus: SubscriptionStatus | null; toStatus: SubscriptionStatus; createdAt: string }
export interface SubscriptionDto extends Stamps { id: string; number: string; customerId: string; quotationId: string | null; currency: string; status: SubscriptionStatus; interval: BillingInterval; intervalCount: number; startsAt: string; endsAt: string | null; trialEndsAt: string | null; currentPeriodStart: string | null; currentPeriodEnd: string | null; nextBillingAt: string | null; pausedAt: string | null; canceledAt: string | null; confirmedAt: string | null; cancelAtPeriodEnd: boolean; paymentTermsDays: number; items?: SubscriptionItemDto[]; activities?: SubscriptionActivityDto[] }
export interface SubscriptionPatch { startsAt?: string; endsAt?: string | null; paymentTermsDays?: number }
export interface InvoiceItemDto extends DocumentLineDto { invoiceId: string; subscriptionItemId: string | null }
export interface InvoiceDto extends DocumentTotals, Stamps { id: string; number: string; customerId: string; subscriptionId: string | null; billingRunId: string | null; idempotencyKey: string; status: InvoiceStatus; issuedAt: string | null; dueAt: string | null; paidAt: string | null; periodStart: string | null; periodEnd: string | null; notes: string | null; items?: InvoiceItemDto[] }
export type PaymentStatusDto = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
export interface PaymentDto extends Stamps { id: string; customerId: string; recordedById: string | null; idempotencyKey: string; reference: string | null; method: PaymentMethod; status: PaymentStatusDto; currency: string; amountMinor: number; paidAt: string | null; notes: string | null }
export interface InvoiceBalanceDto extends InvoiceDto { paidMinor: number; outstandingMinor: number }
export interface InvoiceDetailDto extends InvoiceBalanceDto { overdue: boolean; payments: { amountMinor: number; payment: Pick<PaymentDto, "id" | "method" | "paidAt" | "reference" | "status"> }[] }
