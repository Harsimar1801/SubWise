import assert from "node:assert/strict";
import { test } from "node:test";
import { passwordError } from "../src/lib/frontend/contracts/auth";
import { mockAuthAdapter as auth } from "../src/lib/frontend/adapters/auth.mock";
import { mockAnalyticsAdapter as analytics } from "../src/lib/frontend/adapters/analytics.mock";
import { money } from "../src/lib/frontend/formatters";
const storage=new Map<string,string>();
Object.defineProperty(globalThis,"sessionStorage",{value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)}});
test("demo auth follows customer-only registration, explicit login, session and logout contracts",async()=>{
 await auth.logout();assert.equal(await auth.currentUser(),null);
 await assert.rejects(auth.login({email:"admin@subwise.demo",password:"wrong"}));
 const result=await auth.register({name:"Example",email:"EXAMPLE@demo.test",password:"Strong!Demo"});
 assert.equal(result.user.role,"CUSTOMER");assert.equal(await auth.currentUser(),null);
 const user=await auth.login({email:"example@demo.test",password:"Strong!Demo"});assert.ok(user.customerId);assert.equal((await auth.currentUser())?.id,user.id);
 await auth.logout();assert.equal(await auth.currentUser(),null);
 await assert.rejects(auth.register({name:"Example",email:"example@demo.test",password:"Strong!Demo"}));
});
test("password and money handling match frontend contracts",()=>{
 assert.equal(passwordError("Strong!Demo"),null);assert.ok(passwordError("weak"));assert.ok(passwordError("Strong123"));
 assert.match(money(12345,"USD"),/123\.45/);assert.match(money(12345,"JPY"),/12,345/);
});
test("reset rejects invalid tokens and consumes the demo token",async()=>{
 await assert.rejects(auth.resetPassword({token:"invalid",newPassword:"Strong!Demo"}));
 await auth.resetPassword({token:"subwise-demo-reset",newPassword:"Changed!Demo"});
 await assert.rejects(auth.resetPassword({token:"subwise-demo-reset",newPassword:"Changed!Demo"}));
 await auth.login({email:"customer@subwise.demo",password:"Changed!Demo"});await auth.logout();
});
test("analytics retains minor-unit fields and paginated API envelopes",async()=>{
 const q={currency:"LKR"};const overview=await analytics.overview(q);assert.ok(Number.isInteger(overview.data.mrrMinor));
 const plans=await analytics.plans({...q,pageSize:1});assert.equal(plans.data.length,1);assert.equal(plans.meta.total,3);
 await assert.rejects(analytics.overview({currency:"USD"}));
});

// Phase 2: isolate every management test from the browser's singleton demo store.
import { createMockManagementAdapter } from "../src/lib/frontend/adapters/management.mock";
import { demoAccounts } from "../src/lib/frontend/fixtures/auth";
import { parseAmount } from "../src/components/ui/money-field";
const admin = demoAccounts[0].user, staff = demoAccounts[1].user, customer = demoAccounts[2].user;
test("management snapshots scope customers and enforce catalog permissions", async () => {
 const adapter = createMockManagementAdapter();
 const own = await adapter.load(customer);
 assert.ok(own.invoices.every(i => i.customerId === customer.customerId));
 assert.equal(own.products.length, 0);
 const original = await adapter.load(admin); const product = original.products[0];
 await assert.rejects(adapter.saveProduct(staff, { ...product, name: "Forbidden edit" }, product.id));
 await adapter.saveProduct(admin, { ...product, name: "Edited product" }, product.id);
 assert.equal((await adapter.load(admin)).products[0].name, "Edited product");
 original.products[0].name = "Mutated caller copy";
 assert.equal((await adapter.load(admin)).products[0].name, "Edited product");
});
test("quotation workflow requires acceptance and conversion creates only a draft subscription", async () => {
 const adapter = createMockManagementAdapter(); const initial = await adapter.load(admin);
 await assert.rejects(adapter.convertQuotation(staff, "quote-draft", { startsAt: new Date().toISOString() }));
 await adapter.quotationAction(staff, "quote-draft", "send");
 await adapter.quotationAction(staff, "quote-draft", "confirm");
 await adapter.convertQuotation(staff, "quote-draft", { startsAt: new Date().toISOString() });
 const after = await adapter.load(admin); const sub = after.subscriptions[0];
 assert.equal(sub.status, "DRAFT"); assert.equal(after.invoices.length, initial.invoices.length);
 await assert.rejects(adapter.convertQuotation(staff, "quote-draft", { startsAt: new Date().toISOString() }));
 await adapter.subscriptionAction(staff, sub.id, "activate");
 await adapter.subscriptionAction(staff, sub.id, "pause");
 await adapter.subscriptionAction(staff, sub.id, "resume");
 await adapter.subscriptionAction(staff, sub.id, "close");
 await assert.rejects(adapter.subscriptionAction(staff, sub.id, "resume"));
});
test("quotation input validates quantities, cadence and currency before changing local state", async () => {
 const adapter = createMockManagementAdapter();
 const input = { customerId: "demo-acme", validUntil: new Date(Date.now() + 86400000).toISOString(), paymentTermsDays: 14, notes: "", items: [{ planId: "plan-enterprise", quantity: 1, unitAmountMinor: 2000000 }] };
 await assert.rejects(adapter.createQuotation(staff, input), /Quantity/);
 await assert.rejects(adapter.createQuotation(staff, { ...input, items: [{ ...input.items[0], quantity: 2 }, { planId: "plan-growth", quantity: 1, unitAmountMinor: 150000 }] }), /frequency/);
 await adapter.createQuotation(staff, { ...input, items: [{ ...input.items[0], quantity: 2 }] });
 assert.equal((await adapter.load(admin)).quotations.length, 3);
});
test("local payment recording supports partial settlement and rejects overpayment or reused references", async () => {
 const adapter = createMockManagementAdapter(); const input = { idempotencyKey: "test-request-1001", amountMinor: 50000, method: "BANK_TRANSFER" as const, paidAt: new Date().toISOString(), reference: "TEST-PARTIAL", notes: "" };
 await assert.rejects(adapter.recordPayment(customer, "invoice-acme", input));
 await assert.rejects(adapter.recordPayment(staff, "invoice-acme", { ...input, amountMinor: 999999 }));
 await adapter.recordPayment(staff, "invoice-acme", input);
 await adapter.recordPayment(staff, "invoice-acme", input); // same-key retry is idempotent
 let snapshot = await adapter.load(admin); let invoice = snapshot.invoices.find(i => i.id === "invoice-acme")!;
 assert.equal(invoice.paidMinor, 150000); assert.equal(invoice.outstandingMinor, 204000); assert.equal(invoice.status, "PARTIALLY_PAID");
 assert.equal(snapshot.payments.filter(p => p.reference === input.reference).length, 1);
 await assert.rejects(adapter.recordPayment(staff, "invoice-acme", { ...input, idempotencyKey: "another-request" }));
 await adapter.recordPayment(staff, "invoice-acme", { ...input, idempotencyKey: "settle-request", reference: "TEST-FINAL", amountMinor: 204000 });
 snapshot = await adapter.load(admin); invoice = snapshot.invoices.find(i => i.id === "invoice-acme")!;
 assert.equal(invoice.status, "PAID"); assert.equal(invoice.outstandingMinor, 0);
});
test("money inputs preserve currency minor units without floating point rounding", () => {
 assert.equal(parseAmount("12.34", "LKR"), 1234);
 assert.equal(parseAmount("1234", "JPY"), 1234);
 assert.throws(() => parseAmount("1.001", "LKR"));
 assert.throws(() => parseAmount("-1", "LKR"));
});
