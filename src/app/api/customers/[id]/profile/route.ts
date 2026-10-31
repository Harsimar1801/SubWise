import { handleAuth } from "@/lib/auth/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleAuth;
