import type { Overview, PlanRevenue, RecentActivity, Renewal, RevenueTrend } from "../contracts/analytics";
export const mockOverview: Overview = { currency: "LKR", from: "2026-05-01T00:00:00Z", to: "2026-11-01T00:00:00Z", asOf: "2026-10-31T09:00:00Z", activeSubscriptions: 1248, mrrMinor: 4285000, invoicedMinor: 20705000, paymentsReceivedMinor: 19985000, outstandingMinor: 720000, overdueInvoiceCount: 8, highRiskSubscriptions: 3, upcomingRenewalCount: 3 };
export const mockTrends: RevenueTrend[] = [2400000,2800000,3100000,3500000,3900000,4285000].map((amount,i) => ({ month: `2026-${String(i+5).padStart(2,"0")}`, invoicedMinor: amount+120000, collectionsMinor: amount, subscriptionsStarted: 20+i*3 }));
export const mockPlans: PlanRevenue[] = [ {planId:"enterprise",name:"Enterprise",invoicedMinor:11387750,mrrMinor:2356750}, {planId:"growth",name:"Growth",invoicedMinor:6211500,mrrMinor:1285500}, {planId:"starter",name:"Starter",invoicedMinor:3105750,mrrMinor:642750} ];
export const mockRenewals: Renewal[] = [ {id:"SUB-001",customerId:"demo-acme",endsAt:"2026-11-04T00:00:00Z"}, {id:"SUB-002",customerId:"demo-razor",endsAt:"2026-11-12T00:00:00Z"}, {id:"SUB-003",customerId:"demo-finstack",endsAt:"2026-11-25T00:00:00Z"} ];
export const mockRecent: RecentActivity = { invoices: [
 {id:"inv-841",number:"INV-841",totalMinor:480000,issuedAt:"2026-10-30T10:00:00Z",status:"PAID"},
 {id:"inv-840",number:"INV-840",totalMinor:245000,issuedAt:"2026-10-28T10:00:00Z",status:"OPEN"},
 {id:"inv-839",number:"INV-839",totalMinor:49000,issuedAt:"2026-10-25T10:00:00Z",status:"PAID"},
 {id:"inv-838",number:"INV-838",totalMinor:125000,issuedAt:"2026-10-21T10:00:00Z",status:"PARTIALLY_PAID"}
 ], payments: [{id:"pay-1",amountMinor:480000,paidAt:"2026-10-30T12:00:00Z",method:"BANK_TRANSFER"}] };
