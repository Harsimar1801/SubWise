import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { verifyPassword } from "better-auth/crypto";
import { createAuth } from "../src/lib/auth/core";
import { authRouter } from "../src/lib/auth/http";
import { createAccount } from "../src/lib/auth/accounts";
import { passwordSchema } from "../src/lib/auth/policy";

loadEnvConfig(process.cwd());

test("password policy", () => {
  for (const password of ["Abcd!xyz", "UPPERCASE!", "lowercase!", "NoSpecial123", "Nospaces 123"]) assert.equal(passwordSchema.safeParse(password).success, false);
  assert.equal(passwordSchema.safeParse("StrongPassword!").success, true);
});

test("authentication APIs against isolated PostgreSQL", async () => {
  assert.ok(process.env.TEST_DATABASE_URL, "Set TEST_DATABASE_URL to an isolated migrated test database; production is never used implicitly");
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL, "Use a separate database");
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  // Test database must be dedicated to this suite; clear only auth throttles.
  await db.authRateLimit.deleteMany();
  const origin = "http://localhost:3000";
  const sent: string[] = [];
  const auth = createAuth(db, { baseURL: origin, secure: false, secret: randomUUID() + randomUUID(), sendReset: async (_email, url) => { sent.push(url); } });
  const route = authRouter(db, auth, origin, true);
  const tag = randomUUID();
  const email = `customer-${tag}@example.com`;
  const password = "StrongPassword!";
  const call = async (path: string, body?: unknown, cookie?: string, otherOrigin = origin) => route(new Request(origin + path, { method: body === undefined ? "GET" : "POST", headers: { origin: otherOrigin, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  const login = async (mail: string, pass = password) => {
    const response = await call("/api/auth/sign-in/email", { email: mail, password: pass });
    assert.equal(response.status, 200);
    const cookies = response.headers.getSetCookie();
    assert.ok(cookies.some(value => value.includes("HttpOnly") && value.toLowerCase().includes("samesite=lax")));
    return cookies.map(value => value.split(";")[0]).join("; ");
  };
  try {
    assert.equal((await call("/api/auth/me")).status, 401);
    assert.equal((await call("/api/auth/sign-up/email", { email, name: "Test", password, role: "ADMIN" })).status, 400);
    assert.equal((await call("/api/auth/sign-up/email", { email, name: "Test", password: "weak" })).status, 400);
    assert.equal((await call("/api/auth/sign-up/email", { email, name: "Test", password }, undefined, "https://evil.example")).status, 403);
    const registered = await call("/api/auth/sign-up/email", { email: email.toUpperCase(), name: "Test", password });
    assert.equal(registered.status, 201);
    const user = await db.user.findUniqueOrThrow({ where: { email }, include: { customer: true, accounts: true } });
    assert.equal(user.role, "CUSTOMER");
    assert.ok(user.customer);
    assert.notEqual(user.accounts[0].password, password);
    assert.ok(await verifyPassword({ hash: user.accounts[0].password!, password }));
    assert.equal((await call("/api/auth/sign-up/email", { email, name: "Test", password })).status, 409);
    assert.equal((await call("/api/auth/sign-in/email", { email, password: "IncorrectPassword!" })).status, 401);
    const cookie = await login(email);
    assert.equal((await call("/api/auth/me", undefined, cookie)).status, 200);
    assert.equal((await call(`/api/customers/${user.customer!.id}/profile`, undefined, cookie)).status, 200);
    assert.equal((await call("/api/customers/not-my-customer/profile", undefined, cookie)).status, 403);
    const staffInput = { email: `staff-${tag}@example.com`, name: "Staff", password };
    assert.equal((await call("/api/admin/staff", staffInput)).status, 401);
    assert.equal((await call("/api/admin/staff", staffInput, cookie)).status, 403);
    const admin = await createAccount(db, { email: `admin-${tag}@example.com`, name: "Admin", password }, "ADMIN", true);
    await assert.rejects(createAccount(db, { email: `another-admin-${tag}@example.com`, name: "Admin", password }, "ADMIN", true));
    const adminCookie = await login(admin.email);
    await db.user.update({ where: { id: admin.id }, data: { role: "STAFF" } });
    assert.equal((await call("/api/admin/staff", staffInput, adminCookie)).status, 403);
    await db.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
    assert.equal((await call("/api/admin/staff", staffInput, adminCookie)).status, 201);
    const staffCookie = await login(staffInput.email);
    assert.equal((await call("/api/admin/staff", { ...staffInput, email: `blocked-${tag}@example.com` }, staffCookie)).status, 403);
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    assert.equal((await call("/api/auth/me", undefined, cookie)).status, 401);
    assert.equal((await call("/api/auth/sign-in/email", { email, password })).status, 401);
    await db.user.update({ where: { id: user.id }, data: { isActive: true } });
    assert.equal((await call("/api/auth/sign-out", {}, cookie)).status, 200);
    assert.equal((await call("/api/auth/me", undefined, cookie)).status, 401);
    const beforeReset = await login(email);
    assert.equal((await call("/api/auth/request-password-reset", { email, redirectTo: origin + "/reset-password" })).status, 200);
    assert.equal(sent.length, 1);
    const token = new URL(sent[0]).pathname.split("/").at(-1)!;
    assert.equal(await db.authVerification.count({ where: { identifier: { contains: token } } }), 0, "Reset token identifiers must be hashed at rest");
    assert.equal((await call("/api/auth/reset-password", { token, newPassword: "weak" })).status, 400);
    const resets = await Promise.all([1, 2].map(() => call("/api/auth/reset-password", { token, newPassword: "ReplacementPassword!" })));
    assert.deepEqual(resets.map(response => response.status).sort(), [200, 400]);
    assert.equal((await call("/api/auth/reset-password", { token, newPassword: "ReplacementPassword!" })).status, 400);
    assert.equal((await call("/api/auth/me", undefined, beforeReset)).status, 401);
    assert.equal((await call("/api/auth/sign-in/email", { email, password })).status, 401);
    await login(email, "ReplacementPassword!");
    await call("/api/auth/request-password-reset", { email, redirectTo: origin + "/reset-password" });
    const expiredToken = new URL(sent.at(-1)!).pathname.split("/").at(-1)!;
    await db.authVerification.updateMany({ data: { expiresAt: new Date(0) } });
    assert.equal((await call("/api/auth/reset-password", { token: expiredToken, newPassword: "AnotherPassword!" })).status, 400);
    const unknown = await call("/api/auth/request-password-reset", { email: `unknown-${tag}@example.com` });
    assert.equal(unknown.status, 200);
    assert.equal(sent.length, 2);
    const secureAuth = createAuth(db, { baseURL: "https://subwise.example", secure: true, secret: randomUUID() + randomUUID(), sendReset: async () => {} });
    const secureLogin = await secureAuth.handler(new Request("https://subwise.example/api/auth/sign-in/email", { method: "POST", headers: { origin: "https://subwise.example", "content-type": "application/json" }, body: JSON.stringify({ email, password: "ReplacementPassword!" }) }));
    assert.equal(secureLogin.status, 200);
    assert.ok(secureLogin.headers.getSetCookie().some(cookie => cookie.includes("Secure") && cookie.includes("HttpOnly")));
    await db.authSession.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await call("/api/auth/me", undefined, beforeReset)).status, 401);
    for (let i = 0; i < 32; i++) await call("/api/auth/sign-in/email", { email, password: "WrongPassword!" });
    assert.equal((await call("/api/auth/sign-in/email", { email, password })).status, 429);
    console.log("Verified registration, roles, isolation, hashing, sessions, logout, reset expiry/single use and revocation.");
  } finally {
    // Run only on a disposable database: financial/customer rows must never be
    // deleted as test cleanup on production.
    await db.customer.deleteMany({ where: { email: { contains: tag } } });
    await db.user.deleteMany({ where: { email: { contains: tag } } });
    await db.$disconnect();
  }
});
