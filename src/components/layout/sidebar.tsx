"use client";
import Link from "next/link";
import { BarChart3, Boxes, CreditCard, FileText, Layers, LayoutDashboard, LifeBuoy, Plus, RefreshCw, Settings, ShieldCheck, Users, X, BookOpen, RotateCcw, ChartNoAxesCombined } from "lucide-react";
import type { Role } from "@/lib/frontend/contracts/auth";
import { rolePath } from "@/lib/frontend/contracts/auth";
import { Brand } from "./brand";
import { Button } from "../ui/primitives";
const nav = [ ["Products",Boxes],["Plans",Layers],["Customers",Users],["Quotations",FileText],["Subscriptions",RefreshCw],["Invoices",FileText],["Payments",CreditCard],["Revenue Simulator",ChartNoAxesCombined],["Subscription Health",ShieldCheck],["Payment Recovery",RotateCcw],["Reports",BarChart3],["Settings",Settings] ] as const;
export function Sidebar({role,mobile,onClose}:{role:Role;mobile?:boolean;onClose?:()=>void}) {
 const items=role==="CUSTOMER"?nav.filter(([label])=>["Subscriptions","Invoices","Payments","Settings"].includes(label)):nav;
 return <aside className={`${mobile?"flex h-full w-full":"fixed inset-y-0 left-0 z-20 hidden w-64 lg:flex"} flex-col border-r border-line bg-sidebar px-3 py-5`}><div className="flex items-center justify-between px-3"><Brand/>{mobile && <Button variant="ghost" onClick={onClose} aria-label="Close navigation"><X size={18}/></Button>}</div><Button className="mt-6" disabled title="Subscription management will be added in a later phase"><Plus size={15}/> New Subscription</Button><nav aria-label="Main navigation" className="mt-4 flex-1 space-y-1 overflow-y-auto"><Link href={rolePath(role)} onClick={onClose} aria-current="page" className="flex items-center gap-3 rounded-lg bg-selected px-3 py-3 text-[13px] font-semibold"><LayoutDashboard size={17}/>Overview</Link>{items.map(([label,Icon])=><button key={label} type="button" disabled title="Available in a later phase" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-muted disabled:opacity-70"><Icon size={17}/>{label}</button>)}</nav><div className="mt-4 border-t border-line pt-3 text-muted"><p className="flex items-center gap-3 px-3 py-2 text-xs"><BookOpen size={16}/>Documentation · coming soon</p><p className="flex items-center gap-3 px-3 py-2 text-xs"><LifeBuoy size={16}/>Support · coming soon</p><p className="mt-4 px-3 text-[10px] uppercase tracking-wider">Frontend demo • mock data</p></div></aside>;
}
