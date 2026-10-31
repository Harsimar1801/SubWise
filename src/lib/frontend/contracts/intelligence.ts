import type { CurrentUser } from "./auth";
import type { ApiList, ApiResult } from "./analytics";
import type { BillingInterval, SubscriptionStatus } from "./management";

export interface SimulationPlan { id: string; unitAmountMinor: number; currency: string; interval: BillingInterval; intervalCount: number }
export interface SimulationInput { planId: string; proposedPriceMinor: number; currentPriceMinor?: number; subscriptionCount?: number; discountBps?: number; countChange?: number; periodMonths?: number }
export interface SimulationResult { planId: string; currency: string; currentPriceMinor: number; subscriptionCount: number; simulatedSubscriptionCount: number; baselineMrrMinor: number; simulatedMrrMinor: number; monthlyDifferenceMinor: number; annualizedDifferenceMinor: number; percentageRevenueChange: number | null; chart: { month: number; baselineMinor: number; simulatedMinor: number }[]; assumptions: string[] }
export type HealthCategory = "Healthy" | "Attention" | "High Risk";
export interface HealthDeduction { code: string; points: number; reason: string; action: string }
export interface SubscriptionHealth { subscriptionId: string; customerId: string; status: SubscriptionStatus; score: number; category: HealthCategory; deductions: HealthDeduction[]; recommendedActions: string[]; overdueCount: number; lateInvoiceCount: number; daysToExpiry: number | null; asOf: string; historyNote: string }
export interface HealthSummary { total: number; categories: Record<HealthCategory, number>; averageScore: number | null; asOf: string }
export interface HealthQuery { page?: number; pageSize?: number; customerId?: string }
export interface RecoveryEvent { id: string; invoiceId: string; subscriptionId: string | null; idempotencyKey: string; type: "REMINDER" | "RETRY" | "ESCALATION"; status: "PENDING" | "SUCCEEDED" | "FAILED" | "SKIPPED"; attemptNumber: number; scheduledFor: string; executedAt: string | null; errorMessage: string | null; metadata: Record<string, unknown> | null; createdAt: string; updatedAt: string }
export interface RecoveryState { invoiceId: string; number: string; currency: string; dueAt: string | null; customerId: string; outstandingMinor: number; daysOverdue: number; eligible: boolean; completed: boolean; paused: boolean; stage: 0 | 3 | 7 | 14; escalated: boolean; lastReminderAt: string | null; canSend: boolean; nextAction: "NONE" | "RESUME" | "STAFF_FOLLOW_UP" | "ESCALATE" | "WAIT" | "REMIND" | "WAIT_UNTIL_DAY_3" }
export interface ReminderPreview { subject: string; text: string; delivery: "PREVIEW_ONLY" }
export type RecoveryAction = "send" | "pause" | "resume" | "escalate";
export interface IntelligenceAdapter {
 simulate(actor: CurrentUser, input: SimulationInput): Promise<ApiResult<SimulationResult>>;
 health(actor: CurrentUser, query?: HealthQuery): Promise<ApiList<SubscriptionHealth>>;
 healthSummary(actor: CurrentUser, query?: Pick<HealthQuery, "customerId">): Promise<ApiResult<HealthSummary>>;
 healthDetail(actor: CurrentUser, id: string): Promise<ApiResult<SubscriptionHealth>>;
 recovery(actor: CurrentUser, query?: { page?: number; pageSize?: number }): Promise<ApiList<RecoveryState>>;
 recoveryDetail(actor: CurrentUser, id: string): Promise<ApiResult<RecoveryState & { history: RecoveryEvent[] }>>;
 reminderPreview(actor: CurrentUser, id: string): Promise<ApiResult<ReminderPreview>>;
 recoveryHistory(actor: CurrentUser, id: string): Promise<ApiResult<RecoveryEvent[]>>;
 recoveryAction(actor: CurrentUser, id: string, action: RecoveryAction): Promise<ApiResult<RecoveryEvent>>;
}
// Internal mock evidence. These are not additional backend API fields.
export interface FinancialInvoice { id: string; number: string; subscriptionId: string; customerId: string; customerName: string; currency: string; status: "OPEN" | "PARTIALLY_PAID" | "PAID" | "DRAFT" | "VOID" | "UNCOLLECTIBLE"; totalMinor: number; dueAt: string | null; allocations: { amountMinor: number; status: "COMPLETED" | "FAILED" | "PENDING"; paidAt: string | null }[]; history: RecoveryEvent[] }
export interface FinancialSubscription { id: string; customerId: string; planId: string; status: SubscriptionStatus; startsAt: string; endsAt: string | null; pausedAt: string | null; canceledAt: string | null; cancelAtPeriodEnd: boolean; customerActive: boolean }
