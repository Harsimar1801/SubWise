import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AuthError, assertRole } from "../auth/policy";
import { Resource, schemas, validateCombined, variantPrice } from "./domain";

type Row = Record<string, unknown>;
// The resource/schema allowlist is the only way to select a delegate or columns.
type Store = { findMany(args: Row): Promise<Row[]>; count(args: Row): Promise<number>; findFirst(args: Row): Promise<Row | null>; create(args: Row): Promise<Row>; updateMany(args: Row): Promise<{ count: number }> };
const models = { products: "product", variants: "productVariant", plans: "subscriptionPlan", taxes: "taxRule", discounts: "discountRule" } as const;
const querySchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), search: z.string().max(160).default(""), productId: z.string().optional(), variantId: z.string().optional() }).strict();
function visibility(resource: Resource, now: Date): Row {
  const product = { isActive: true, isPublished: true };
  if (resource === "products") return product;
  if (resource === "variants") return { isActive: true, product };
  return { isActive: true, isPublished: true, AND: [{ OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] }, { OR: [{ availableUntil: null }, { availableUntil: { gte: now } }] }], variant: { isActive: true, product } };
}
export function customerProjection(resource: Resource, row: Row): Row {
  const fields = resource === "products" ? ["id", "name", "description", "type", "currency", "sellingPriceMinor"] : resource === "variants" ? ["id", "productId", "name", "sku", "attributes", "additionalPriceMinor"] : ["id", "variantId", "name", "description", "currency", "unitAmountMinor", "interval", "intervalCount", "trialDays", "minimumQuantity", "availableFrom", "availableUntil", "autoCloseAtExpiry", "allowPause", "allowResume", "allowRenew", "allowEarlyClosure"];
  return Object.fromEntries(fields.map(field => [field, row[field]]));
}
export function catalogApi(db: PrismaClient, authorize: (headers: Headers) => Promise<{ role: string }>, origin: string) {
  return async (request: Request, resource: Resource, id?: string) => {
    const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
    try {
      const user = await authorize(request.headers);
      const write = request.method !== "GET";
      assertRole(user.role, write || resource === "taxes" || resource === "discounts" ? write ? ["ADMIN"] : ["ADMIN", "STAFF"] : ["ADMIN", "STAFF", "CUSTOMER"]);
      if (write && request.headers.get("origin") !== new URL(origin).origin) throw new AuthError(403, "Invalid origin");
      const store = db[models[resource]] as unknown as Store;
      const visible = user.role === "CUSTOMER" ? visibility(resource, new Date()) : {};
      if (request.method === "GET") {
        const project = (row: Row) => user.role === "CUSTOMER" ? customerProjection(resource, row) : row;
        if (id) {
          const row = await store.findFirst({ where: { id, ...visible } });
          if (!row) throw new AuthError(404, "Not found");
          return json({ data: project(row) });
        }
        const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
        const where = { ...visible, ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}), ...(query.productId && (resource === "variants" || resource === "discounts") ? { productId: query.productId } : {}), ...(query.variantId && resource === "plans" ? { variantId: query.variantId } : {}) };
        const [rows, total] = await Promise.all([store.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }), store.count({ where })]);
        return json({ data: rows.map(project), meta: { page: query.page, pageSize: query.pageSize, total } });
      }
      if (request.method !== "POST" && request.method !== "PATCH") throw new AuthError(405, "Method not allowed");
      if ((request.method === "PATCH") !== Boolean(id)) throw new AuthError(405, "Method not allowed");
      if (!request.headers.get("content-type")?.includes("application/json")) throw new AuthError(415, "JSON required");
      const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 16384) { void reader.cancel(); throw new AuthError(413, "Request too large"); } chunks.push(value); }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const data = (id ? schemas[resource].partial() : schemas[resource]).parse(body) as Row;
      if (!Object.keys(data).length) throw new AuthError(400, "Empty update");
      const old = id ? await store.findFirst({ where: { id } }) : null;
      if (id && !old) throw new AuthError(404, "Not found");
      const combined = { ...old, ...data };
      try { validateCombined(resource, combined); } catch (error) { throw new AuthError(400, (error as Error).message); }
      for (const key of resource === "variants" ? ["productId"] : resource === "plans" ? ["variantId"] : []) if (old && key in data && data[key] !== old[key]) throw new AuthError(400, `${key} cannot change; deactivate and create a new record`);
      if (resource === "variants" || (resource === "discounts" && combined.productId)) {
        const product = await db.product.findUnique({ where: { id: String(combined.productId) } });
        if (!product) throw new AuthError(400, "Product does not exist");
        if (resource === "variants") try { variantPrice(product.sellingPriceMinor, Number(combined.additionalPriceMinor)); } catch { throw new AuthError(400, "Variant price overflows monetary range"); }
        if (resource === "discounts" && combined.type === "FIXED" && combined.currency !== product.currency) throw new AuthError(400, "Discount currency must match product");
      }
      if (resource === "plans") {
        const variant = await db.productVariant.findUnique({ where: { id: String(combined.variantId) }, include: { product: true } });
        if (!variant || variant.product.currency !== combined.currency) throw new AuthError(400, "Variant must exist and plan currency must match product");
      }
      if (resource === "products" && old && data.currency && data.currency !== old.currency) throw new AuthError(400, "Product currency cannot change");
      if (id) {
        const updated = await store.updateMany({ where: { id, updatedAt: old!.updatedAt }, data });
        if (!updated.count) throw new AuthError(409, "Record changed; reload and retry");
        return json({ data: await store.findFirst({ where: { id } }) });
      }
      return json({ data: await store.create({ data }) }, 201);
    } catch (error) {
      if (error instanceof AuthError) return json({ error: error.message }, error.status);
      if (error instanceof z.ZodError) return json({ error: "Invalid input", issues: error.issues.map(({ path, message }) => ({ path, message })) }, 400);
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return json({ error: "Unique code, SKU or name already exists" }, 409);
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2004"].includes(error.code)) return json({ error: "Invalid reference or database constraint" }, 400);
      return json({ error: "Catalog service unavailable" }, 503);
    }
  };
}
