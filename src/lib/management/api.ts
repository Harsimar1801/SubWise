import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { AuthError, assertRole } from "../auth/policy";
import { check, customerSchema, selfSchema, quotationSchema, templateSchema, templateContent } from "./domain";
import { priceLines } from "./pricing";
import { convertQuotation, subscriptionAction } from "./subscriptions";

type Actor = { id: string; role: string; customerId: string | null };
type Run = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
const querySchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), search: z.string().max(160).default(""), customerId: z.string().optional(), status: z.string().max(30).optional() }).strict();
export function managementApi(db: PrismaClient, authorize: (headers: Headers) => Promise<Actor>, origin: string, run: Run = work => db.$transaction(work, { isolationLevel: "Serializable", timeout: 30000 })) {
  return async (request: Request) => {
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    try {
      const actor = await authorize(request.headers);
      const [resource, id, action, extra] = new URL(request.url).pathname.slice(5).split("/");
      check(!extra && ["customers", "quotation-templates", "quotations", "subscriptions"].includes(resource), "Not found", 404);
      const write = request.method !== "GET";
      if (resource === "quotation-templates" || (write && resource !== "customers")) assertRole(actor.role, ["ADMIN", "STAFF"]);
      if (write && resource === "customers" && (request.method !== "PATCH" || !id)) assertRole(actor.role, ["ADMIN", "STAFF"]);
      let body: unknown = {};
      if (write) {
        check(request.headers.get("origin") === new URL(origin).origin, "Invalid origin", 403);
        check(request.headers.get("content-type")?.includes("application/json"), "JSON required", 415);
        const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
        if (reader) while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 65536) { void reader.cancel(); throw new AuthError(413, "Request too large"); } chunks.push(value); }
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      }
      const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
      const scope = actor.role === "CUSTOMER" ? { customerId: actor.customerId ?? "__none__" } : query.customerId ? { customerId: query.customerId } : {};
      const paging = { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
      const meta = (total: number) => ({ page: query.page, pageSize: query.pageSize, total });
      const result = await run(async tx => {
        if (resource === "customers") {
          if (id && actor.role === "CUSTOMER") check(actor.customerId === id, "Not found", 404);
          if (request.method === "GET") {
            if (id) {
              const customer = await tx.customer.findUnique({ where: { id } }); check(customer, "Customer not found", 404);
              if (action === "subscriptions") { const where = { customerId: id }; return { data: await tx.subscription.findMany({ where, ...paging, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }), meta: meta(await tx.subscription.count({ where })) }; }
              check(!action, "Not found", 404); return { data: customer };
            }
            const where = { ...(actor.role === "CUSTOMER" ? { id: actor.customerId ?? "__none__" } : {}), ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" as const } }, { email: { contains: query.search, mode: "insensitive" as const } }] } : {}) };
            return { data: await tx.customer.findMany({ where, ...paging, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }), meta: meta(await tx.customer.count({ where })) };
          }
          check(!action && ((request.method === "POST" && !id) || (request.method === "PATCH" && id)), "Method not allowed", 405);
          const data = actor.role === "CUSTOMER" ? selfSchema.parse(body) : id ? customerSchema.partial().parse(body) : customerSchema.parse(body);
          check(Object.keys(data).length, "Empty update");
          const old = id ? await tx.customer.findUnique({ where: { id } }) : null; check(!id || old, "Customer not found", 404);
          const adminData = data as z.infer<typeof customerSchema>;
          if (adminData.email) {
            const duplicate = await tx.customer.findFirst({ where: { email: { equals: adminData.email, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) } }); check(!duplicate, "Customer email already exists", 409);
          }
          if (old?.userId) check((adminData.userId === undefined || adminData.userId === old.userId) && (!adminData.email || adminData.email === old.email), "Linked identity cannot be reassigned or renamed", 409);
          if (adminData.userId) {
            const user = await tx.user.findUnique({ where: { id: adminData.userId }, include: { customer: true } });
            check(user?.role === "CUSTOMER" && user.isActive && (!user.customer || user.customer.id === id) && user.email.toLowerCase() === (adminData.email ?? old?.email)?.toLowerCase(), "Conflicting customer association", 409);
          } else if (adminData.email) {
            const user = await tx.user.findFirst({ where: { email: { equals: adminData.email, mode: "insensitive" } } }); check(!user || user.id === old?.userId, "Existing user requires an explicit matching association", 409);
          }
          if (old && adminData.currency && old.currency !== adminData.currency) check(!(await tx.subscription.count({ where: { customerId: old.id } })) && !(await tx.quotation.count({ where: { customerId: old.id } })), "Currency is locked once documents exist", 409);
          return { data: id ? await tx.customer.update({ where: { id }, data }) : await tx.customer.create({ data: data as z.infer<typeof customerSchema> }) };
        }
        if (resource === "quotation-templates") {
          check(!action, "Not found", 404);
          if (request.method === "GET") {
            if (id) { const data = await tx.quotationTemplate.findUnique({ where: { id } }); check(data, "Template not found", 404); return { data }; }
            const where = query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {};
            return { data: await tx.quotationTemplate.findMany({ where, ...paging, orderBy: { id: "asc" } }), meta: meta(await tx.quotationTemplate.count({ where })) };
          }
          check((request.method === "POST" && !id) || (request.method === "PATCH" && id), "Method not allowed", 405);
          const data = (id ? templateSchema.partial() : templateSchema).parse(body);
          if (data.content) { const plan = await tx.subscriptionPlan.findUnique({ where: { id: data.content.items[0].planId } }); check(plan, "Plan not found"); await priceLines(tx, data.content.items, plan.currency, new Date()); }
          return { data: id ? await tx.quotationTemplate.update({ where: { id }, data }) : await tx.quotationTemplate.create({ data: { ...data, name: data.name!, content: data.content!, createdById: actor.id } }) };
        }
        if (resource === "quotations") {
          const where = { ...scope, ...(query.status ? { status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]).parse(query.status) } : {}), ...(query.search ? { number: { contains: query.search, mode: "insensitive" as const } } : {}) };
          if (request.method === "GET") {
            check(!action, "Not found", 404);
            if (id) { const data = await tx.quotation.findFirst({ where: { id, ...scope }, include: { items: { orderBy: { position: "asc" } }, subscription: { select: { id: true, number: true } } } }); check(data, "Quotation not found", 404); return { data }; }
            return { data: await tx.quotation.findMany({ where, ...paging, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }), meta: meta(await tx.quotation.count({ where })) };
          }
          if (id && action) {
            check(request.method === "POST", "Method not allowed", 405);
            if (action === "convert") return { data: await convertQuotation(tx, id, body, actor.id) };
            z.object({}).strict().parse(body);
            const old = await tx.quotation.findUnique({ where: { id } }); check(old, "Quotation not found", 404);
            const now = new Date();
            const target = { send: "SENT", confirm: "ACCEPTED", reject: "REJECTED", expire: "EXPIRED" } as const;
            check(Object.hasOwn(target, action), "Unknown action");
            if (action === "expire") check(old.validUntil && old.validUntil <= now && ["DRAFT", "SENT", "ACCEPTED"].includes(old.status) && !(await tx.subscription.findUnique({ where: { quotationId: id } })), "Quotation is not eligible for expiry", 409);
            else check(old.validUntil && old.validUntil > now && (action === "send" ? old.status === "DRAFT" : old.status === "SENT"), "Invalid or expired quotation transition", 409);
            const updated = await tx.quotation.updateMany({ where: { id, status: old.status, updatedAt: old.updatedAt }, data: { status: target[action as keyof typeof target], ...(action === "confirm" ? { acceptedAt: now } : {}) } }); check(updated.count, "Concurrent change; retry", 409);
            return { data: await tx.quotation.findUnique({ where: { id } }) };
          }
          check((request.method === "POST" && !id) || (request.method === "PATCH" && id), "Method not allowed", 405);
          const old = id ? await tx.quotation.findUnique({ where: { id }, include: { items: { orderBy: { position: "asc" } } } }) : null;
          check(!id || old, "Quotation not found", 404); check(!old || old.status === "DRAFT", "Only draft quotations can be edited", 409);
          const input = (id ? quotationSchema.partial() : quotationSchema).parse(body);
          const customerId = input.customerId ?? old!.customerId;
          const customer = await tx.customer.findUnique({ where: { id: customerId } }); check(customer?.isActive, "Active customer required");
          const templateId = input.templateId ?? old?.templateId;
          const template = templateId ? await tx.quotationTemplate.findUnique({ where: { id: templateId } }) : null; check(!templateId || template?.isActive, "Active template required");
          const content = template ? templateContent.parse(template.content) : null;
          const items = input.items ?? old?.items.map(item => ({ planId: item.planId, quantity: item.quantity, unitAmountMinor: item.unitAmountMinor, taxRuleId: item.taxRuleId ?? undefined, discountRuleId: item.discountRuleId ?? undefined })) ?? content?.items;
          check(items?.length, "Items or a valid template are required");
          const validUntil = input.validUntil ?? old?.validUntil ?? new Date(Date.now() + (content?.validityDays ?? 30) * 86400000); check(validUntil > new Date(), "Quotation must expire in the future");
          const priced = await priceLines(tx, items, customer.currency, new Date());
          const data = { customerId, templateId, currency: customer.currency, validUntil, notes: input.notes ?? old?.notes, paymentTermsDays: input.paymentTermsDays ?? old?.paymentTermsDays ?? 0, ...priced.totals };
          if (!id) return { data: await tx.quotation.create({ data: { ...data, number: `QUO-${randomUUID()}`, createdById: actor.id, items: { create: priced.lines.map(line => line.data) } }, include: { items: true } }) };
          // Draft item identities remain stable; omissions are rejected rather than deleting records.
          check(priced.lines.length >= old!.items.length, "Existing lines cannot be removed; reject and create a replacement quotation", 409);
          for (const line of priced.lines) { const existing = old!.items[line.data.position]; if (existing) await tx.quotationItem.update({ where: { id: existing.id }, data: { ...line.data, taxRuleId: line.data.taxRuleId ?? null, discountRuleId: line.data.discountRuleId ?? null } }); else await tx.quotationItem.create({ data: { ...line.data, quotationId: id } }); }
          return { data: await tx.quotation.update({ where: { id }, data, include: { items: true } }) };
        }
        const where = { ...scope, ...(query.status ? { status: z.enum(["DRAFT", "TRIALING", "ACTIVE", "PAUSED", "PAST_DUE", "CANCELED", "EXPIRED"]).parse(query.status) } : {}), ...(query.search ? { number: { contains: query.search, mode: "insensitive" as const } } : {}) };
        if (request.method === "GET") {
          if (id) { const data = await tx.subscription.findFirst({ where: { id, ...scope }, include: action === "history" ? { activities: { ...paging, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } : { items: { orderBy: { position: "asc" } } } }); check(data, "Subscription not found", 404); check(!action || action === "history", "Not found", 404); return { data }; }
          return { data: await tx.subscription.findMany({ where, ...paging, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }), meta: meta(await tx.subscription.count({ where })) };
        }
        check(id && ((request.method === "POST" && action) || (request.method === "PATCH" && !action)), "Subscriptions must be created by quotation conversion", 405);
        if (action && !["renew"].includes(action)) z.object({}).strict().parse(body);
        return { data: await subscriptionAction(tx, id, action ?? "edit", body, actor.id) };
      });
      return json(result, request.method === "POST" && (!id || action === "convert") ? 201 : 200);
    } catch (error) {
      if (error instanceof AuthError) return json({ error: error.message }, error.status);
      if (error instanceof z.ZodError) return json({ error: "Invalid input", issues: error.issues.map(({ path, message }) => ({ path, message })) }, 400);
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (["P2002", "P2034"].includes(error.code)) return json({ error: "Duplicate record or concurrent change; reload and retry" }, 409);
        if (error.code === "P2025") return json({ error: "Not found" }, 404);
        if (["P2003", "P2004"].includes(error.code)) return json({ error: "Invalid relationship or constraint" }, 400);
      }
      return json({ error: "Management service unavailable" }, 503);
    }
  };
}
