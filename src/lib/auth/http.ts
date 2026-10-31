import { PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import { createAuth } from "./core";
import { createAccount } from "./accounts";
import { AuthError, assertRole, assertCustomerAccess } from "./policy";

type Auth = ReturnType<typeof createAuth>;
export async function resolveUser(db: PrismaClient, auth: Auth, headers: Headers, roles = ["ADMIN", "STAFF", "CUSTOMER"]) {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new AuthError(401, "Authentication required");
  const user = await db.user.findUnique({ where: { id: session.user.id }, include: { customer: true } });
  if (!user?.isActive || (user.role === "CUSTOMER" && !user.customer?.isActive)) throw new AuthError(401, "Authentication required");
  assertRole(user.role, roles);
  return { id: user.id, name: user.name, email: user.email, role: user.role, customerId: user.customer?.id ?? null };
}

export function authRouter(db: PrismaClient, auth: Auth, origin: string, mailConfigured: boolean) {
  return async (request: Request) => {
    const path = new URL(request.url).pathname;
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    try {
      if (request.method === "POST") {
        if (request.headers.get("origin") !== new URL(origin).origin) throw new AuthError(403, "Invalid origin");
        if (!request.headers.get("content-type")?.includes("application/json")) throw new AuthError(415, "JSON required");
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 8192) { void reader.cancel(); throw new AuthError(413, "Request too large"); }
            chunks.push(value);
          }
        }
        // Next.js may supply a different Request implementation than Node's
        // global constructor. Copy the URL and fields across that boundary.
        request = new Request(request.url, { method: request.method, headers: request.headers, body: Buffer.concat(chunks).toString("utf8") });
        // A shared database limit cannot be evaded by spoofing forwarding headers.
        const key = `subwise:${path}`;
        const now = BigInt(Date.now());
        const rows = await db.$queryRaw<{ count: number }[]>`
          INSERT INTO "AuthRateLimit" (id, key, count, "lastRequest") VALUES (${key}, ${key}, 1, ${now})
          ON CONFLICT (key) DO UPDATE SET
            count = CASE WHEN "AuthRateLimit"."lastRequest" < ${now - 60000n} THEN 1 ELSE "AuthRateLimit".count + 1 END,
            "lastRequest" = CASE WHEN "AuthRateLimit"."lastRequest" < ${now - 60000n} THEN ${now} ELSE "AuthRateLimit"."lastRequest" END
          RETURNING count`;
        if (rows[0].count > (path.endsWith("sign-up/email") ? 10 : 30)) throw new AuthError(429, "Too many requests; retry in one minute");
      }
      if (path === "/api/auth/sign-up/email" && request.method === "POST") return json({ user: await createAccount(db, await request.json(), "CUSTOMER") }, 201);
      if (path === "/api/admin/staff" && request.method === "POST") {
        await resolveUser(db, auth, request.headers, ["ADMIN"]);
        return json({ user: await createAccount(db, await request.json(), "STAFF") }, 201);
      }
      if (path === "/api/auth/me" && request.method === "GET") return json({ user: await resolveUser(db, auth, request.headers) });
      const profile = path.match(/^\/api\/customers\/([^/]+)\/profile$/);
      if (profile && request.method === "GET") {
        const user = await resolveUser(db, auth, request.headers);
        assertCustomerAccess(user, profile[1]);
        const customer = await db.customer.findUnique({ where: { id: profile[1] }, select: { id: true, name: true, email: true } });
        if (!customer) throw new AuthError(404, "Customer not found");
        return json({ customer });
      }
      const allowed = request.method === "GET" ? ["/api/auth/get-session", "/api/auth/reset-password"] : request.method === "POST" ? ["/api/auth/sign-in/email", "/api/auth/sign-out", "/api/auth/request-password-reset", "/api/auth/reset-password"] : [];
      // Do not expose upstream sign-up/update-user/account-linking endpoints.
      if (!allowed.includes(path) && !(request.method === "GET" && path.startsWith("/api/auth/reset-password/"))) return json({ error: "Not found" }, 404);
      if (path === "/api/auth/request-password-reset" && !mailConfigured) return json({ error: "Password reset mail is not configured" }, 503);
      return await auth.handler(request);
    } catch (error) {
      if (error instanceof AuthError) return json({ error: error.message }, error.status);
      if (error instanceof ZodError) return json({ error: "Invalid input", issues: error.issues.map(({ path, message }) => ({ path, message })) }, 400);
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
      return json({ error: "Authentication service unavailable" }, 503);
    }
  };
}
