import { loadEnvConfig } from "@next/env";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

loadEnvConfig(process.cwd());
async function main() {
  const origin = new URL(process.env.BETTER_AUTH_URL!).origin;
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3107"], {
    windowsHide: true, env: { ...process.env, AUTH_ALLOW_LOCAL_HTTP: "true" }, stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("App startup timed out")), 20000);
      child.stdout.on("data", (chunk) => { if (chunk.toString().includes("Ready")) { clearTimeout(timer); resolve(); } });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`App exited: ${code}`)); });
    });
    const cases: [string, unknown, number][] = [
      ["/api/health", undefined, 200], ["/api/auth/me", undefined, 401],
      ["/api/customers/unknown/profile", undefined, 401],
      ["/api/customers", undefined, 401], ["/api/quotation-templates", undefined, 401],
      ["/api/quotations", undefined, 401], ["/api/subscriptions", undefined, 401],
      ["/api/quotations/unknown/convert", {}, 401],
      ["/api/admin/staff", {}, 401], ["/api/auth/sign-up/email", { role: "ADMIN" }, 400],
    ];
    if (!process.env.SMTP_URL || !process.env.SMTP_FROM) cases.push(["/api/auth/request-password-reset", { email: "not-a-user@example.com" }, 503]);
    for (const [path, body, expected] of cases) {
      const response = await fetch(`http://127.0.0.1:3107${path}`, {
        method: body === undefined ? "GET" : "POST", headers: { origin, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000),
      });
      assert.equal(response.status, expected, path);
      console.log(`PASS ${path}: HTTP ${expected}`);
    }
  } finally {
    const stopped = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await stopped;
  }
}
main().catch(() => { console.error("Built-app auth smoke test failed; check build, auth config, and DB connection."); process.exitCode = 1; });
