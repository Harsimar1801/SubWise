"use client";
import Link from "next/link";
import { Card, PageHeader, Badge } from "@/components/ui/primitives";
import { rolePath } from "@/lib/frontend/contracts/auth";
import { useManagement } from "./context";
export function WorkspaceOverview() {
 const { data, actor } = useManagement(); const title = actor.role === "STAFF" ? "Staff workspace" : "Customer workspace";
 return <><PageHeader title={title} description={`Welcome, ${actor.name}. Review your subscription operations below.`}/><Badge tone="blue">Live workspace · server records</Badge><div className="grid gap-4 sm:grid-cols-3">{[{ label: "Subscriptions", section: "subscriptions", count: data.subscriptions.length }, { label: "Invoices", section: "invoices", count: data.invoices.length }, { label: "Payments", section: "payments", count: data.payments.length }].map(item => <Card key={item.section}><h2 className="text-xs text-muted">{item.label}</h2><p className="my-4 text-3xl font-semibold tabular-nums">{item.count}</p><Link className="text-xs font-semibold underline underline-offset-4" href={`${rolePath(actor.role)}/${item.section}`}>View {item.label.toLowerCase()}</Link></Card>)}</div><Card><h2 className="font-semibold">{actor.role === "CUSTOMER" ? "Your account" : "Your operations workspace"}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted">{actor.role === "CUSTOMER" ? "You can view your own quotations, subscriptions, invoices, and recorded payments. Contact staff for lifecycle changes or payment recording." : "Manage customers and quotations, review subscriptions, and record invoice payments. Catalog configuration is read-only for Staff."}</p></Card></>;
}
