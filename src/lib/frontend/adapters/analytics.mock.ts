import type { AnalyticsAdapter, AnalyticsQuery } from "../contracts/analytics";
import { mockOverview, mockPlans, mockRecent, mockRenewals, mockTrends } from "../fixtures/analytics";
function validate(query: AnalyticsQuery) {
 if (query.currency !== mockOverview.currency) throw new Error("The demo dataset uses LKR only.");
 if ((query.page ?? 1)<1 || (query.pageSize ?? 20)<1 || (query.pageSize ?? 20)>100) throw new Error("Invalid pagination.");
 // Phase 1 exposes a fixed reporting snapshot, not a partial-date analytics engine.
 if (query.from && query.from!==mockOverview.from || query.to && query.to!==mockOverview.to) throw new Error("The demo dataset supports its fixed reporting period only.");
}
function page<T>(rows: T[], query: AnalyticsQuery) { const page = query.page ?? 1, pageSize = query.pageSize ?? 20; return { data: structuredClone(rows.slice((page-1)*pageSize,page*pageSize)), meta: {page,pageSize,total:rows.length} }; }
export const mockAnalyticsAdapter: AnalyticsAdapter = {
 async overview(query) { validate(query); return {data: structuredClone(mockOverview)}; },
 async trends(query) { validate(query); return {data: structuredClone(mockTrends)}; },
 async plans(query) { validate(query); return page(mockPlans,query); },
 async renewals(query) { validate(query); return page(mockRenewals,query); },
 async recent(query) { validate(query); return {data: structuredClone(mockRecent)}; }
};
