import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { AuthError, assertRole } from "../auth/policy";
import { check } from "../management/domain";
import { balance, executeBilling, invoiceAction, recordPayment, transaction } from "./service";
import { invoicePdf } from "./pdf";
type Actor = { id: string; role: string; customerId: string | null };
export function billingApi(db: PrismaClient, authorize: (headers: Headers) => Promise<Actor>, config: { origin: string; cronSecret?: string; demoIds?: string; demoEnabled?: string; production: boolean }) {
  return async (request: Request) => {
    const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
    try {
      const parts = new URL(request.url).pathname.slice(5).split("/"); const [resource, id, action, extra] = parts;
      check(!extra, "Not found", 404);
      const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      const cron = resource === "billing" && id === "run" && Boolean(config.cronSecret && config.cronSecret.length >= 32 && supplied.length === config.cronSecret.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(config.cronSecret)));
      const actor = cron ? { id: "cron", role: "ADMIN", customerId: null } : await authorize(request.headers);
      let body: unknown = {};
      if (request.method !== "GET") {
        assertRole(actor.role, resource === "billing" ? ["ADMIN"] : ["ADMIN", "STAFF"]);
        check(cron || request.headers.get("origin") === new URL(config.origin).origin, "Invalid origin", 403);
        check(request.headers.get("content-type")?.includes("application/json"), "JSON required", 415);
        const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
        if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8192) { void reader.cancel(); throw new AuthError(413, "Request too large"); } chunks.push(value); }
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      }
      if (resource === "billing") {
        check(request.method === "POST" && !action, "Method not allowed", 405);
        assertRole(actor.role, ["ADMIN"]);
        if (id === "run") { const data = z.object({ idempotencyKey: z.string().min(8).max(160) }).strict().parse(body); return json({ data: await executeBilling(db, `job:${data.idempotencyKey}`) }); }
        check(id === "demo" && !cron && !config.production && config.demoEnabled === "true", "Demo disabled", 403);
        const data = z.object({ subscriptionId: z.string().min(1) }).strict().parse(body);
        check(config.demoIds?.split(",").map(value => value.trim()).includes(data.subscriptionId), "Subscription is not explicitly allowlisted for demo", 403);
        const sub = await db.subscription.findUnique({ where: { id: data.subscriptionId } }); check(sub?.nextBillingAt && sub.status === "ACTIVE", "No demo period available", 409);
        return json({ data: await executeBilling(db, `demo:${sub.id}:${sub.nextBillingAt.toISOString()}`, sub.nextBillingAt, sub.id) });
      }
      check(resource === "invoices", "Not found", 404);
      const scope = actor.role === "CUSTOMER" ? { customerId: actor.customerId ?? "__none__", status: { not: "DRAFT" as const } } : {};
      if (request.method === "GET") {
        if (id) {
          const invoice = await db.invoice.findFirst({ where: { id, ...scope }, include: { items: { orderBy: { position: "asc" } } } }); check(invoice, "Invoice not found", 404);
          const amounts = await balance(db, id, invoice.totalMinor);
          if (action === "pdf") return new Response(Buffer.from(await invoicePdf(invoice, amounts.paidMinor)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="invoice-${invoice.id}.pdf"`, "Cache-Control": "no-store" } });
          check(!action, "Not found", 404);
          const payments = await db.paymentAllocation.findMany({ where: { invoiceId: id }, select: { amountMinor: true, payment: { select: { id: true, method: true, paidAt: true, reference: true, status: true } } } });
          return json({ data: { ...invoice, ...amounts, outstandingMinor: invoice.status === "VOID" ? 0 : amounts.outstandingMinor, overdue: ["OPEN", "PARTIALLY_PAID"].includes(invoice.status) && !!invoice.dueAt && invoice.dueAt < new Date() && amounts.outstandingMinor > 0, payments } });
        }
        const query = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), overdue: z.enum(["true", "false"]).optional(), status: z.enum(["DRAFT", "OPEN", "PARTIALLY_PAID", "PAID", "VOID", "UNCOLLECTIBLE"]).optional() }).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
        const where: Prisma.InvoiceWhereInput = { AND: [scope, query.status ? { status: query.status } : {}, query.overdue === "true" ? { status: { in: ["OPEN", "PARTIALLY_PAID"] }, dueAt: { lt: new Date() } } : {}] };
        const invoices = await db.invoice.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
        const data = await Promise.all(invoices.map(async invoice => ({ ...invoice, ...await balance(db, invoice.id, invoice.totalMinor), ...(invoice.status === "VOID" ? { outstandingMinor: 0 } : {}) })));
        return json({ data, meta: { page: query.page, pageSize: query.pageSize, total: await db.invoice.count({ where }) } });
      }
      check(request.method === "POST" && id && action, "Method not allowed", 405);
      if (action === "payments") return json({ data: await transaction(db, tx => recordPayment(tx, id, body, actor.id)) });
      z.object({}).strict().parse(body);
      return json({ data: await transaction(db, tx => invoiceAction(tx, id, action)) });
    } catch (error) {
      if (error instanceof AuthError) return json({ error: error.message }, error.status);
      if (error instanceof z.ZodError) return json({ error: "Invalid input", issues: error.issues.map(({ path, message }) => ({ path, message })) }, 400);
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return json({ error: "Concurrent or duplicate operation; retry with the same key" }, 409);
      return json({ error: "Billing unavailable; retry with the same key" }, 503);
    }
  };
}
