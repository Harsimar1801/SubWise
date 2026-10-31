"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { WorkspaceLoading } from "@/components/ui/workspace-state";
import { Badge, Button, Card, Input, Table, type Column } from "@/components/ui/primitives";
import { Field, Select } from "@/components/ui/forms";
export function useResource<T>(load: () => Promise<T>) {
 const [data, setData] = useState<T | null>(null), [error, setError] = useState(""), [version, setVersion] = useState(0);
 useEffect(() => { let active = true; load().then(value => { if (active) { setData(value); setError(""); } }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Unable to load the sample data."); }); return () => { active = false; }; }, [load, version]);
 return { data, error, reload: () => setVersion(v => v + 1) };
}
export function ResourceState({ error, retry }: { error: string; retry: () => void }) { return error ? <Card><p role="alert">{error}</p><Button variant="secondary" className="mt-4" onClick={retry}>Retry</Button></Card> : <WorkspaceLoading/>; }
export function IntelligenceNotice() { return <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-3 text-xs text-muted"><Badge tone="blue">Mock intelligence portfolio</Badge><span>Fixed snapshot: 31 Oct 2026 · local actions reset on reload · no API connection</span></div>; }
export function Metric({ label, value, note }: { label: string; value: ReactNode; note: string }) { return <Card><h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</h2><p className="my-3 break-words text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="text-[11px] leading-5 text-muted">{note}</p></Card>; }
export function Directory<T>({ rows, columns, rowKey, searchable, category, categories, label }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; searchable: (row: T) => string; category?: (row: T) => string; categories?: string[]; label: string }) {
 const [search, setSearch] = useState(""), [filter, setFilter] = useState("");
 const filtered = rows.filter(row => searchable(row).toLowerCase().includes(search.toLowerCase()) && (!filter || !category || category(row) === filter));
 return <Card><div className="mb-5 flex flex-wrap items-end gap-4"><div className="w-full max-w-xs"><Field label={`Search ${label}`}><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Subscription, invoice, or customer…"/></Field></div>{category && <div className="w-44"><Field label="Filter"><Select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All</option>{categories?.map(c => <option key={c}>{c}</option>)}</Select></Field></div>}<p aria-live="polite" className="ml-auto text-xs text-muted">{filtered.length} of {rows.length} shown</p></div><Table rows={filtered} rowKey={rowKey} columns={columns}/></Card>;
}
export function PermissionDenied() { return <Card><h1 className="text-lg font-semibold">Intelligence access restricted</h1><p className="mt-2 text-sm text-muted">Revenue simulation, subscription health, and recovery are available to Admin and Staff. Your own subscriptions and invoices remain available in navigation.</p><Link href="/customer" className="mt-5 inline-block text-xs font-semibold underline underline-offset-4">Return to your workspace</Link></Card>; }
