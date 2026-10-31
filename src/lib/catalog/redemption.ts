import { Prisma } from "@prisma/client";
import { discountAmount } from "./domain";

// Future invoice creation must call this in the SAME transaction as the invoice.
// Preview callers use discountAmount(), which never changes usage.
export async function redeemDiscount(tx: Prisma.TransactionClient, id: string, input: Parameters<typeof discountAmount>[1], now = new Date()) {
  const rule = await tx.discountRule.findUniqueOrThrow({ where: { id } });
  const amount = discountAmount(rule, input, now);
  if (!amount) throw new Error("Discount is not eligible");
  const updated = await tx.discountRule.updateMany({ where: { id, usageCount: rule.usageCount, updatedAt: rule.updatedAt, isActive: true }, data: { usageCount: { increment: 1 } } });
  if (!updated.count) throw new Error("Discount changed or was redeemed concurrently; retry transaction");
  return amount;
}
