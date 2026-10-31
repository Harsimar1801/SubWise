import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { PrismaClient } from "@prisma/client";
import { passwordSchema } from "./policy";

export function createAuth(db: PrismaClient, options: {
  secret: string; baseURL: string; secure: boolean;
  sendReset: (email: string, url: string) => Promise<void>;
}) {
  return betterAuth({
    secret: options.secret, baseURL: options.baseURL,
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    user: { additionalFields: { role: { type: "string", defaultValue: "CUSTOMER", input: false }, isActive: { type: "boolean", defaultValue: true, input: false } } },
    account: { modelName: "AuthAccount" },
    verification: { modelName: "AuthVerification", storeIdentifier: "hashed" },
    session: { modelName: "AuthSession", expiresIn: 60 * 60 * 24, updateAge: 60 * 60, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", modelName: "AuthRateLimit", window: 60, max: 30,
      customRules: { "/sign-in/email": { window: 60, max: 15 }, "/request-password-reset": { window: 60, max: 5 }, "/reset-password": { window: 60, max: 10 } },
    },
    advanced: { useSecureCookies: options.secure },
    emailAndPassword: {
      enabled: true, disableSignUp: true, minPasswordLength: 9, maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 900, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => options.sendReset(user.email, url),
    },
    hooks: { before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/reset-password" && !passwordSchema.safeParse(ctx.body?.newPassword).success) {
        throw new APIError("BAD_REQUEST", { message: "Password must be 9–128 characters with uppercase, lowercase and special characters" });
      }
      if (ctx.path === "/sign-in/email" && typeof ctx.body?.email === "string") {
        ctx.body.email = ctx.body.email.trim().toLowerCase();
        const user = await db.user.findUnique({ where: { email: ctx.body.email } });
        if (user && !user.isActive) throw new APIError("UNAUTHORIZED", { message: "Invalid email or password" });
      }
    }) },
  });
}
