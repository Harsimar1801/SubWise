import { PrismaClient, RecoveryEventType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { check } from "../management/domain";
import { recoveryInclude, recoveryState, reminder } from "./recovery-domain";
import { Delivery } from "./delivery";
export async function recoveryAction(db: PrismaClient, id: string, action: string, actorId: string, deliver: Delivery) {
  const reserved = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({ where: { id }, include: recoveryInclude }); check(invoice, "Invoice not found", 404);
    const state = recoveryState(invoice, new Date());
    check(["pause", "resume", "escalate", "send"].includes(action), "Unknown action", 404);
    if (action === "send") check(state.canSend, "Reminder not eligible, already sent or pending", 409);
    else if (action === "escalate") check(state.eligible && !state.paused && state.stage === 14 && !state.escalated, "Escalation not eligible", 409);
    else check(!state.completed, "Recovery is complete", 409);
    const type: RecoveryEventType = action === "send" ? "REMINDER" : action === "escalate" ? "ESCALATION" : "RETRY";
    const attemptNumber = Math.max(0, ...invoice.recoveryEvents.filter(e => e.type === type).map(e => e.attemptNumber)) + 1;
    return tx.recoveryEvent.create({ data: { invoiceId: id, subscriptionId: invoice.subscriptionId, type, attemptNumber, idempotencyKey: `recovery:${randomUUID()}`, scheduledFor: new Date(), executedAt: action === "send" ? null : new Date(), status: action === "send" ? "PENDING" : "SUCCEEDED", metadata: { action, stage: state.stage, actorId } } });
  }, { timeout: 30000 });
  if (action !== "send") return reserved;
  // Do not retry a transaction that performs an external side effect. Pending
  // reservations survive uncertain failures and prevent accidental duplicate sends.
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id }, include: recoveryInclude });
    const state = recoveryState(invoice, new Date());
    if (!state.eligible || state.paused) return tx.recoveryEvent.update({ where: { id: reserved.id }, data: { status: "SKIPPED", executedAt: new Date() } });
    try {
      const result = await deliver(invoice.customer.email, reminder(invoice, new Date()));
      return tx.recoveryEvent.update({ where: { id: reserved.id }, data: { status: result === "SENT" ? "SUCCEEDED" : "SKIPPED", executedAt: new Date(), metadata: { ...(reserved.metadata as object), delivery: result } } });
    } catch {
      return tx.recoveryEvent.update({ where: { id: reserved.id }, data: { status: "FAILED", executedAt: new Date(), errorMessage: "Delivery failed; verify transport outcome before retrying" } });
    }
  }, { timeout: 30000 });
}
