export interface ApiResult<T> { data: T }
export interface PageMeta { page: number; pageSize: number; total: number }
export interface ApiList<T> extends ApiResult<T[]> { meta: PageMeta }
export interface ApiError { error: string; issues?: { path: (string | number)[]; message: string }[] }
export type InvoiceStatus = "DRAFT" | "OPEN" | "PARTIALLY_PAID" | "PAID" | "VOID" | "UNCOLLECTIBLE";
export interface AnalyticsQuery { currency: string; from?: string; to?: string; page?: number; pageSize?: number }
export interface Overview { currency: string; from: string; to: string; asOf: string; activeSubscriptions: number; mrrMinor: number; invoicedMinor: number; paymentsReceivedMinor: number; outstandingMinor: number; overdueInvoiceCount: number; highRiskSubscriptions: number; upcomingRenewalCount: number }
export interface RevenueTrend { month: string; invoicedMinor: number; collectionsMinor: number; subscriptionsStarted: number }
export interface PlanRevenue { planId: string; name: string; invoicedMinor: number; mrrMinor: number }
export interface Renewal { id: string; customerId: string; endsAt: string }
export interface RecentInvoice { id: string; number: string; totalMinor: number; issuedAt: string; status: InvoiceStatus }
export interface RecentPayment { id: string; amountMinor: number; paidAt: string; method: "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER" }
export interface RecentActivity { invoices: RecentInvoice[]; payments: RecentPayment[] }
// Mirrors /api/finance/analytics/{overview,trends,plans,renewals,recent}.
export interface AnalyticsAdapter {
 overview(query: AnalyticsQuery): Promise<ApiResult<Overview>>;
 trends(query: AnalyticsQuery): Promise<ApiResult<RevenueTrend[]>>;
 plans(query: AnalyticsQuery): Promise<ApiList<PlanRevenue>>;
 renewals(query: AnalyticsQuery): Promise<ApiList<Renewal>>;
 recent(query: AnalyticsQuery): Promise<ApiResult<RecentActivity>>;
}
