import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { createAccount } from "../src/lib/auth/accounts";
import { ZodError } from "zod";
import { AuthError } from "../src/lib/auth/policy";

loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  try {
    await createAccount(db, { email: process.env.BOOTSTRAP_ADMIN_EMAIL, name: process.env.BOOTSTRAP_ADMIN_NAME, password: process.env.BOOTSTRAP_ADMIN_PASSWORD }, "ADMIN", true);
    console.log("Initial administrator created. Clear bootstrap credentials from your environment.");
  } catch (error) {
    if (error instanceof ZodError) {
      const fields: Record<string, string> = { email: "BOOTSTRAP_ADMIN_EMAIL", name: "BOOTSTRAP_ADMIN_NAME", password: "BOOTSTRAP_ADMIN_PASSWORD" };
      console.error("Bootstrap failed: invalid or missing configuration.");
      for (const issue of error.issues) {
        const field = fields[String(issue.path[0])];
        // Never stringify validation issues: they may contain submitted values.
        const guidance = issue.path[0] === "password"
          ? "Supply 9–128 characters including uppercase, lowercase and a special character."
          : issue.path[0] === "email" ? "Supply a valid email address (maximum 254 characters)."
          : "Supply a nonblank name (maximum 120 characters).";
        console.error(`${field}: ${guidance}`);
      }
    } else if (error instanceof AuthError) {
      console.error(`Bootstrap failed: ${error.message}.`);
    } else if (error instanceof Error && "code" in error && typeof error.code === "string" && /^P\d{4}$/.test(error.code)) {
      console.error(`Bootstrap failed: database error ${error.code}. Check connectivity and applied migrations.`);
    } else {
      console.error("Bootstrap failed unexpectedly. Check database access and applied migrations. Error details are suppressed to protect credentials.");
    }
    process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
void main();
