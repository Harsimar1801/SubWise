import "server-only";
import { db } from "@/lib/db";
import { getAuth } from "./server";
import { authRouter } from "./http";

export async function handleAuth(request: Request) {
  try {
    return await authRouter(db, getAuth(), process.env.BETTER_AUTH_URL!, Boolean(process.env.SMTP_URL && process.env.SMTP_FROM))(request);
  } catch {
    return Response.json({ error: "Authentication is not configured" }, { status: 503 });
  }
}
