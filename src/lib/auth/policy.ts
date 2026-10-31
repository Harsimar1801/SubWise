import { z } from "zod";

export const passwordSchema = z.string().min(9).max(128)
  .regex(/[A-Z]/, "Include an uppercase character")
  .regex(/[a-z]/, "Include a lowercase character")
  .regex(/[^A-Za-z0-9\s]/, "Include a special character");
export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
}).strict();

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function assertRole(role: string, allowed: readonly string[]) {
  if (!allowed.includes(role)) throw new AuthError(403, "Forbidden");
}

export function assertCustomerAccess(user: { role: string; customerId: string | null }, customerId: string) {
  if (user.role === "CUSTOMER" && user.customerId !== customerId) throw new AuthError(403, "Forbidden");
}
