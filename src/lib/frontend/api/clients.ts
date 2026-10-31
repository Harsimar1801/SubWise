// PREPARATION ONLY: intentionally not exported from the active adapters barrel.
import type { AuthAdapter, CurrentUser, LoginInput, PasswordResetInput, PasswordResetRequest, RegisteredUser, RegisterInput } from "../contracts/auth";
import type { AnalyticsQuery, ApiList, ApiResult, Overview, PlanRevenue, RecentActivity, Renewal, RevenueTrend } from "../contracts/analytics";
import type { ConvertInput, RecordPaymentInput } from "../contracts/management";
import type { HealthQuery, HealthSummary, RecoveryAction, RecoveryEvent, RecoveryState, ReminderPreview, SimulationInput, SimulationResult, SubscriptionHealth } from "../contracts/intelligence";
import type { CatalogCreates, CatalogQuery, CatalogRecords, CustomerCreate, CustomerDto, InvoiceBalanceDto, InvoiceDetailDto, InvoiceDto, InvoiceQuery, ManagementQuery, Paging, PaymentDto, QuotationCreate, QuotationDto, SubscriptionDto, SubscriptionPatch, TemplateCreate, TemplateDto } from "./dtos";
import { apiId, queryString, type ApiTransport, ApiClientError } from "./transport";

export function createApiClients(transport: ApiTransport) {
 const get = <T>(path: string, query?: object, signal?: AbortSignal) => transport.request<T>(path + queryString(query), { signal });
 const post = <T>(path: string, body: unknown = {}, signal?: AbortSignal) => transport.request<T>(path, { method: "POST", body, signal });
 const patch = <T>(path: string, body: unknown, signal?: AbortSignal) => transport.request<T>(path, { method: "PATCH", body, signal });
 const auth = {
  async login(input: LoginInput): Promise<CurrentUser> { await post<unknown>("/api/auth/sign-in/email", input); return (await get<{ user: CurrentUser }>("/api/auth/me")).user; },
  register: (input: RegisterInput) => post<{ user: RegisteredUser }>("/api/auth/sign-up/email", input),
  async logout(): Promise<void> { await post<unknown>("/api/auth/sign-out"); },
  me: (signal?: AbortSignal) => get<{ user: CurrentUser }>("/api/auth/me", undefined, signal),
  async currentUser(): Promise<CurrentUser | null> { try { return (await auth.me()).user; } catch (error) { if (error instanceof ApiClientError && error.status === 401) return null; throw error; } },
  async requestPasswordReset(input: PasswordResetRequest): Promise<{ message: string }> { await post<unknown>("/api/auth/request-password-reset", input); return { message: "If the account is eligible, password reset instructions have been requested." }; },
  async resetPassword(input: PasswordResetInput): Promise<{ message: string }> { await post<unknown>("/api/auth/reset-password", input); return { message: "Password reset completed. Sign in again." }; },
 } satisfies AuthAdapter & { me: (signal?: AbortSignal) => Promise<{ user: CurrentUser }> };
 return {
  auth,
  billing: { run: (idempotencyKey: string) => post("/api/billing/run", { idempotencyKey }) },
  catalog: {
   list: <R extends keyof CatalogRecords>(resource: R, query?: CatalogQuery, signal?: AbortSignal) => get<ApiList<CatalogRecords[R]>>(`/api/catalog/${resource}`, query, signal),
   detail: <R extends keyof CatalogRecords>(resource: R, id: string, signal?: AbortSignal) => get<ApiResult<CatalogRecords[R]>>(`/api/catalog/${resource}/${apiId(id)}`, undefined, signal),
   create: <R extends keyof CatalogCreates>(resource: R, input: CatalogCreates[R]) => post<ApiResult<CatalogRecords[R]>>(`/api/catalog/${resource}`, input),
   update: <R extends keyof CatalogCreates>(resource: R, id: string, input: Partial<CatalogCreates[R]>) => patch<ApiResult<CatalogRecords[R]>>(`/api/catalog/${resource}/${apiId(id)}`, input),
  },
  customers: {
   list: (query?: ManagementQuery, signal?: AbortSignal) => get<ApiList<CustomerDto>>("/api/customers", query, signal),
   detail: (id: string, signal?: AbortSignal) => get<ApiResult<CustomerDto>>(`/api/customers/${apiId(id)}`, undefined, signal),
   profile: (id: string, signal?: AbortSignal) => get<{ customer: Pick<CustomerDto, "id" | "name" | "email"> }>(`/api/customers/${apiId(id)}/profile`, undefined, signal),
   create: (input: CustomerCreate) => post<ApiResult<CustomerDto>>("/api/customers", input),
   update: (id: string, input: Partial<CustomerCreate>) => patch<ApiResult<CustomerDto>>(`/api/customers/${apiId(id)}`, input),
   subscriptions: (id: string, query?: Paging, signal?: AbortSignal) => get<ApiList<SubscriptionDto>>(`/api/customers/${apiId(id)}/subscriptions`, query, signal),
  },
  quotationTemplates: {
   list: (query?: ManagementQuery, signal?: AbortSignal) => get<ApiList<TemplateDto>>("/api/quotation-templates", query, signal),
   detail: (id: string) => get<ApiResult<TemplateDto>>(`/api/quotation-templates/${apiId(id)}`),
   create: (input: TemplateCreate) => post<ApiResult<TemplateDto>>("/api/quotation-templates", input),
   update: (id: string, input: Partial<TemplateCreate>) => patch<ApiResult<TemplateDto>>(`/api/quotation-templates/${apiId(id)}`, input),
  },
  quotations: {
   list: (query?: ManagementQuery, signal?: AbortSignal) => get<ApiList<QuotationDto>>("/api/quotations", query, signal),
   detail: (id: string, signal?: AbortSignal) => get<ApiResult<QuotationDto>>(`/api/quotations/${apiId(id)}`, undefined, signal),
   create: (input: QuotationCreate) => post<ApiResult<QuotationDto>>("/api/quotations", input),
   update: (id: string, input: Partial<QuotationCreate>) => patch<ApiResult<QuotationDto>>(`/api/quotations/${apiId(id)}`, input),
   action: (id: string, action: "send" | "confirm" | "reject" | "expire") => post<ApiResult<QuotationDto>>(`/api/quotations/${apiId(id)}/${action}`),
   convert: (id: string, input: ConvertInput) => post<ApiResult<SubscriptionDto>>(`/api/quotations/${apiId(id)}/convert`, input),
  },
  subscriptions: {
   list: (query?: ManagementQuery, signal?: AbortSignal) => get<ApiList<SubscriptionDto>>("/api/subscriptions", query, signal),
   detail: (id: string, signal?: AbortSignal) => get<ApiResult<SubscriptionDto>>(`/api/subscriptions/${apiId(id)}`, undefined, signal),
   history: (id: string, query?: Paging, signal?: AbortSignal) => get<ApiResult<SubscriptionDto & { activities: NonNullable<SubscriptionDto["activities"]> }>>(`/api/subscriptions/${apiId(id)}/history`, query, signal),
   update: (id: string, input: SubscriptionPatch) => patch<ApiResult<SubscriptionDto>>(`/api/subscriptions/${apiId(id)}`, input),
   action: (id: string, action: "activate" | "pause" | "resume" | "close" | "expire") => post<ApiResult<SubscriptionDto>>(`/api/subscriptions/${apiId(id)}/${action}`),
   renew: (id: string, input: { endsAt: string }) => post<ApiResult<SubscriptionDto>>(`/api/subscriptions/${apiId(id)}/renew`, input),
  },
  invoices: {
   list: (query?: InvoiceQuery, signal?: AbortSignal) => get<ApiList<InvoiceBalanceDto>>("/api/invoices", query, signal),
   detail: (id: string, signal?: AbortSignal) => get<ApiResult<InvoiceDetailDto>>(`/api/invoices/${apiId(id)}`, undefined, signal),
   action: (id: string, action: "confirm" | "cancel") => post<ApiResult<InvoiceDto>>(`/api/invoices/${apiId(id)}/${action}`),
   recordPayment: (id: string, input: RecordPaymentInput) => post<ApiResult<PaymentDto>>(`/api/invoices/${apiId(id)}/payments`, input),
   pdf: (id: string, signal?: AbortSignal) => transport.download(`/api/invoices/${apiId(id)}/pdf`, signal),
  },
  analytics: {
   overview: (query: AnalyticsQuery, signal?: AbortSignal) => get<ApiResult<Overview>>("/api/finance/analytics/overview", query, signal),
   trends: (query: AnalyticsQuery, signal?: AbortSignal) => get<ApiResult<RevenueTrend[]>>("/api/finance/analytics/trends", query, signal),
   plans: (query: AnalyticsQuery, signal?: AbortSignal) => get<ApiList<PlanRevenue>>("/api/finance/analytics/plans", query, signal),
   renewals: (query: AnalyticsQuery, signal?: AbortSignal) => get<ApiList<Renewal>>("/api/finance/analytics/renewals", query, signal),
   recent: (query: AnalyticsQuery, signal?: AbortSignal) => get<ApiResult<RecentActivity>>("/api/finance/analytics/recent", query, signal),
  },
  simulation: { run: (input: SimulationInput, signal?: AbortSignal) => post<ApiResult<SimulationResult>>("/api/insights/revenue-simulation", input, signal) },
  health: {
   list: (query?: HealthQuery, signal?: AbortSignal) => get<ApiList<SubscriptionHealth>>("/api/insights/subscription-health", query, signal),
   summary: (query?: Pick<HealthQuery, "customerId">, signal?: AbortSignal) => get<ApiResult<HealthSummary>>("/api/insights/subscription-health/summary", query, signal),
   detail: (id: string, signal?: AbortSignal) => get<ApiResult<SubscriptionHealth>>(`/api/insights/subscription-health/${apiId(id)}`, undefined, signal),
  },
  recovery: {
   list: (query?: Paging, signal?: AbortSignal) => get<ApiList<RecoveryState>>("/api/finance/recovery", query, signal),
   detail: (id: string, signal?: AbortSignal) => get<ApiResult<RecoveryState & { history: RecoveryEvent[] }>>(`/api/finance/recovery/${apiId(id)}`, undefined, signal),
   preview: (id: string, signal?: AbortSignal) => get<ApiResult<ReminderPreview>>(`/api/finance/recovery/${apiId(id)}/preview`, undefined, signal),
   history: (id: string, signal?: AbortSignal) => get<ApiResult<RecoveryEvent[]>>(`/api/finance/recovery/${apiId(id)}/history`, undefined, signal),
   action: (id: string, action: RecoveryAction) => post<ApiResult<RecoveryEvent>>(`/api/finance/recovery/${apiId(id)}/${action}`),
  },
 };
}
