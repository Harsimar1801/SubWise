import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", service: "subwise", database: "up" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Public health responses must not expose connection strings or DB errors.
    return NextResponse.json(
      { status: "degraded", service: "subwise", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
