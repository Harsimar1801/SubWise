import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { recoveryAction } from "../src/lib/finance/recovery";
loadEnvConfig(process.cwd());
test("PostgreSQL recovery persistence, duplicate prevention, pause and payment termination roll back", async () => {
  const db = new PrismaClient(), rollback = new Error("rollback fixtures");
  try { await assert.rejects(db.$transaction(async tx => {
    const tag = randomUUID();
    const customer = await tx.customer.create({ data: { name: "Recovery fixture", email: `${tag}@example.com` } });
    const invoice = await tx.invoice.create({ data: { customerId: customer.id, number: tag, idempotencyKey: tag, status: "OPEN", totalMinor: 10000, subtotalMinor: 10000, dueAt: new Date(Date.now() - 4 * 86400000) } });
    const adapter = { $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient;
    let delivered = 0;
    const send = async () => { delivered++; return "SENT" as const; };
    await recoveryAction(adapter, invoice.id, "pause", "fixture", send);
    await assert.rejects(recoveryAction(adapter, invoice.id, "send", "fixture", send));
    await recoveryAction(adapter, invoice.id, "resume", "fixture", send);
    assert.equal((await recoveryAction(adapter, invoice.id, "send", "fixture", send)).status, "SUCCEEDED");
    await assert.rejects(recoveryAction(adapter, invoice.id, "send", "fixture", send)); assert.equal(delivered, 1);
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
    await assert.rejects(recoveryAction(adapter, invoice.id, "send", "fixture", send));
    assert.equal(await tx.recoveryEvent.count({ where: { invoiceId: invoice.id } }), 3);
    throw rollback;
  }, { timeout: 60000 }), error => error === rollback); } finally { await db.$disconnect(); }
});
