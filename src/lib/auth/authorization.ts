import "server-only";
import { db } from "@/lib/db";
import { getAuth } from "./server";
import { assertCustomerAccess } from "./policy";
import { resolveUser } from "./http";

export async function requireUser(headers: Headers, roles: readonly string[] = ["ADMIN", "STAFF", "CUSTOMER"]) {
  return resolveUser(db, getAuth(), headers, [...roles]);
}

export async function requireCustomerAccess(headers: Headers, customerId: string) {
  const user = await requireUser(headers);
  assertCustomerAccess(user, customerId);
  return user;
}
