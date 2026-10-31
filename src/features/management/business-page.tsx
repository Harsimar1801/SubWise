"use client";
import type { ManagementSection } from "@/lib/frontend/contracts/management";
import { ProductsPage, PlansPage } from "./catalog";
import { CustomersPage } from "./customers";
import { QuotationsPage } from "./quotations";
import { SubscriptionsPage } from "./subscriptions";
import { InvoicesPage } from "./invoices";
import { PaymentsPage } from "./payments";
export function BusinessPage({ section }: { section: ManagementSection }) {
 const screens = { products: ProductsPage, plans: PlansPage, customers: CustomersPage, quotations: QuotationsPage, subscriptions: SubscriptionsPage, invoices: InvoicesPage, payments: PaymentsPage };
 const Screen = screens[section]; return <Screen/>;
}
