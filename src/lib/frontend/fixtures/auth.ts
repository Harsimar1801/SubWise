import type { CurrentUser } from "../contracts/auth";
export const demoAccounts: { user: CurrentUser; password: string }[] = [
 { user: { id: "demo-admin", name: "Rohit Varma", email: "admin@subwise.demo", role: "ADMIN", customerId: null }, password: "SubWise!Demo" },
 { user: { id: "demo-staff", name: "Asha Perera", email: "staff@subwise.demo", role: "STAFF", customerId: null }, password: "SubWise!Demo" },
 { user: { id: "demo-customer", name: "Alex Morgan", email: "customer@subwise.demo", role: "CUSTOMER", customerId: "demo-acme" }, password: "SubWise!Demo" },
];
export const demoResetToken = "subwise-demo-reset";
