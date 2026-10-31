import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AuthError, assertRole } from "../auth/policy";
import { check } from "../management/domain";
import { analytics } from "./analytics";
import { recoveryInclude, recoveryState, reminder } from "./recovery-domain";
import { recoveryAction } from "./recovery";
import { Delivery, deliverReminder } from "./delivery";
const paging = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();
export const financialQuery = z.object({ currency: z.string().regex(/^[A-Z]{3}$/).default("LKR"), from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();
export function financeApi(db: PrismaClient, authorize: (headers: Headers) => Promise<{ id: string; role: string }>, origin: string, deliver: Delivery = deliverReminder) {
  return async (request: Request) => {
    const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
    try {
      const actor = await authorize(request.headers); assertRole(actor.role, ["ADMIN", "STAFF"]);
      const url = new URL(request.url), parts = url.pathname.replace(/^\/api\/finance\//, "").split("/"), [resource, id, action, extra] = parts; check(!extra, "Not found", 404);
      const now = new Date();
      if (resource === "recovery") {
        if (request.method === "GET") {
          if (id) {
            check(!action || ["preview", "history"].includes(action), "Not found", 404);
            const invoice = await db.invoice.findUnique({ where: { id }, include: recoveryInclude }); check(invoice, "Invoice not found", 404);
            return json({ data: action === "history" ? invoice.recoveryEvents : action === "preview" ? { ...reminder(invoice, now), delivery: "PREVIEW_ONLY" } : { ...recoveryState(invoice, now), history: invoice.recoveryEvents } });
          }
          const query = paging.parse(Object.fromEntries(url.searchParams));
          const invoices = await db.invoice.findMany({ where: { status: { in: ["OPEN", "PARTIALLY_PAID"] }, dueAt: { lt: now } }, include: recoveryInclude, orderBy: [{ dueAt: "asc" }, { id: "asc" }] });
          const eligible = invoices.map(i => recoveryState(i, now)).filter(s => s.eligible);
          return json({ data: eligible.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), meta: { ...query, total: eligible.length } });
        }
        check(request.method === "POST" && id && action, "Method not allowed", 405);
        check(request.headers.get("origin") === new URL(origin).origin, "Invalid origin", 403);
        check(request.headers.get("content-type")?.includes("application/json"), "JSON required", 415);
        // All actions accept only an empty object; bound the streaming input.
        let size = 0; const chunks: Uint8Array[] = []; const reader = request.body?.getReader();
        if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1024) { void reader.cancel(); throw new AuthError(413, "Request too large"); } chunks.push(value); }
        z.object({}).strict().parse(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
        return json({ data: await recoveryAction(db, id, action, actor.id, deliver) });
      }
      check(resource === "analytics" && request.method === "GET" && !action, "Not found", 404);
      check(id && ["overview", "trends", "plans", "renewals", "recent"].includes(id), "Not found", 404);
      const query = financialQuery.parse(Object.fromEntries(url.searchParams));
      const to = query.to ? new Date(query.to) : now, from = query.from ? new Date(query.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
      check(to > from && to.getTime() - from.getTime() <= 366 * 86400000, "Date range must be positive and at most 366 days");
      const result = await analytics(db, query.currency, from, to, now);
      if (id === "renewals" || id === "plans") { const rows = result[id]; return json({ data: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), meta: { page: query.page, pageSize: query.pageSize, total: rows.length } }); }
      return json({ data: result[id as "overview" | "trends" | "recent"] });
    } catch (error) {
      if (error instanceof AuthError) return json({ error: error.message }, error.status);
      if (error instanceof z.ZodError) return json({ error: "Invalid input", issues: error.issues.map(({ path, message }) => ({ path, message })) }, 400);
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
      return json({ error: "Finance service unavailable" }, 503);
    }
  };
}
