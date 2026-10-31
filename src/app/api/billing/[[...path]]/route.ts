import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/authorization";
import { billingApi } from "@/lib/billing/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = (request: Request) => billingApi(db, requireUser, { origin: process.env.BETTER_AUTH_URL ?? "http://localhost:3000", cronSecret: process.env.BILLING_CRON_SECRET, demoIds: process.env.BILLING_DEMO_SUBSCRIPTION_IDS, demoEnabled: process.env.BILLING_DEMO_ENABLED, production: process.env.NODE_ENV === "production" })(request);
export const GET = handle;
export const POST = handle;
