import { PermissionDenied } from "@/features/intelligence/shared";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BusinessPage } from "@/features/management/business-page";
import { type ManagementSection } from "@/lib/frontend/contracts/management";
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
 const { section } = await params;
 if (["revenue-simulator", "subscription-health", "payment-recovery"].includes(section)) return <PermissionDenied/>;
 if (!(["quotations", "subscriptions", "invoices", "payments"] as readonly string[]).includes(section)) notFound();
 return <Suspense fallback={<p role="status">Loading workspace…</p>}><BusinessPage key={section} section={section as ManagementSection}/></Suspense>;
}
