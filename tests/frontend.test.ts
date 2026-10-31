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
