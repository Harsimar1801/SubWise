import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AuthError, assertRole } from "../auth/policy";
import { check } from "../management/domain";
import { health, healthInclude, simulate, simulationSchema } from "./domain";

type Actor = { role: string };
const paging = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), customerId: z.string().min(1).max(160).optional() }).strict();
export function insightsApi(db: PrismaClient, authorize: (headers: Headers) => Promise<Actor>, origin: string) {
  return async (request: Request) => {
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    try {
      const actor = await authorize(request.headers); assertRole(actor.role, ["ADMIN", "STAFF"]);
      const url = new URL(request.url), path = url.pathname.replace(/^\/api\/insights\//, "");
      const now = new Date();
      if (path === "revenue-simulation") {
        check(request.method === "POST", "Method not allowed", 405);
        check(request.headers.get("origin") === new URL(origin).origin, "Invalid origin", 403);
        check(request.headers.get("content-type")?.includes("application/json"), "JSON required", 415);
        const chunks: Uint8Array[] = []; let length = 0; const reader = request.body?.getReader();
        if (reader) while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > 8192) { void reader.cancel(); throw new AuthError(413, "Request too large"); } chunks.push(value); }
        const input = simulationSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        const plan = await db.subscriptionPlan.findUnique({ where: { id: input.planId } }); check(plan, "Plan not found", 404);
        const count = await db.subscription.count({ where: { status: "ACTIVE", pausedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], customer: { isActive: true }, items: { some: { planId: plan.id } } } });
        return json({ data: { planId: plan.id, ...simulate(input, plan, count) } });
      }
      check(request.method === "GET", "Method not allowed", 405);
      if (path === "subscription-health" || path === "subscription-health/summary") {
        const query = paging.parse(Object.fromEntries(url.searchParams));
        const where = query.customerId ? { customerId: query.customerId } : {};
        if (path.endsWith("/summary")) {
          // Cursor batches avoid loading every subscription's financial history at once.
          const categories = { Healthy: 0, Attention: 0, "High Risk": 0 }; let totalScore = 0, total = 0, cursor: string | undefined;
          while (true) {
            const batch = await db.subscription.findMany({ where, include: healthInclude, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
            for (const sub of batch) { const result = health(sub, now); categories[result.category as keyof typeof categories]++; totalScore += result.score; total++; }
            if (batch.length < 100) break; cursor = batch[batch.length - 1].id;
          }
          return json({ data: { total, categories, averageScore: total ? Math.round(totalScore / total * 100) / 100 : null, asOf: now.toISOString() } });
        }
        const subscriptions = await db.subscription.findMany({ where, include: healthInclude, orderBy: { id: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize });
        return json({ data: subscriptions.map(sub => health(sub, now)), meta: { page: query.page, pageSize: query.pageSize, total: await db.subscription.count({ where }) } });
      }
      const match = /^subscription-health\/([^/]+)$/.exec(path); check(match, "Not found", 404);
      check(!url.search, "Unexpected query parameters");
      const sub = await db.subscription.findUnique({ where: { id: match[1] }, include: healthInclude }); check(sub, "Subscription not found", 404);
      return json({ data: health(sub, now) });
    } catch (error) {
      if (error instanceof AuthError) return json({ error: error.message }, error.status);
      if (error instanceof z.ZodError) return json({ error: "Invalid input", issues: error.issues.map(({ path, message }) => ({ path, message })) }, 400);
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
      return json({ error: "Insights unavailable" }, 503);
    }
  };
}
