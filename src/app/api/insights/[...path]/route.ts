import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/authorization";
import { insightsApi } from "@/lib/insights/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = (request: Request) => insightsApi(db, requireUser, process.env.BETTER_AUTH_URL ?? "http://localhost:3000")(request);
export const GET = handle;
export const POST = handle;
