import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/authorization";
import { catalogApi } from "@/lib/catalog/api";
import { Resource, schemas } from "@/lib/catalog/domain";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!Object.hasOwn(schemas, path[0]) || path.length > 2) return Response.json({ error: "Not found" }, { status: 404 });
  return catalogApi(db, requireUser, process.env.BETTER_AUTH_URL ?? "http://localhost:3000")(request, path[0] as Resource, path[1]);
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
