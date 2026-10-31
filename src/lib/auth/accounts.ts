import { Prisma, PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { AuthError, credentialsSchema } from "./policy";

export async function createAccount(db: PrismaClient, input: unknown, role: Role, bootstrap = false) {
  const data = credentialsSchema.parse(input);
  const password = await hashPassword(data.password);
  try {
    return await db.$transaction(async (tx) => {
      if (bootstrap) {
        // Serialize concurrent bootstraps. No public bootstrap endpoint exists.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(82714002)`;
        if (await tx.user.count({ where: { role: "ADMIN" } })) throw new AuthError(409, "An administrator already exists");
      }
      if (await tx.user.findFirst({ where: { email: { equals: data.email, mode: "insensitive" } } }) ||
          await tx.customer.findFirst({ where: { email: { equals: data.email, mode: "insensitive" } } })) {
        throw new AuthError(409, "Email is already registered");
      }
      const id = randomUUID();
      const user = await tx.user.create({ data: {
        id, email: data.email, name: data.name, role,
        accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password } },
        ...(role === "CUSTOMER" ? { customer: { create: { name: data.name, email: data.email } } } : {}),
      }, select: { id: true, email: true, name: true, role: true } });
      return user;
    }, { timeout: 15000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AuthError(409, "Email is already registered");
    throw error;
  }
}
