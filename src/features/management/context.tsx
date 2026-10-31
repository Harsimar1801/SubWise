"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { managementAdapter } from "@/lib/frontend/adapters";
import type { CurrentUser } from "@/lib/frontend/contracts/auth";
import type { ManagementSnapshot } from "@/lib/frontend/contracts/management";
import { Button, Card } from "@/components/ui/primitives";
interface ManagementContext { data: ManagementSnapshot; actor: CurrentUser; act: (work: () => Promise<void>) => Promise<void> }
const Context = createContext<ManagementContext | null>(null);
export function ManagementProvider({ actor, children }: { actor: CurrentUser; children: ReactNode }) {
 const [data, setData] = useState<ManagementSnapshot | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
 useEffect(() => { let active = true; managementAdapter.load(actor).then(value => { if (active) { setData(value); setError(""); } }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Unable to load workspace."); }); return () => { active = false; }; }, [actor, attempt]);
 async function act(work: () => Promise<void>) { await work(); setData(await managementAdapter.load(actor)); }
 if (error) return <Card><p role="alert">{error}</p><Button onClick={() => setAttempt(attempt + 1)} className="mt-4">Retry</Button></Card>;
 if (!data) return <Card><p role="status">Loading workspace…</p></Card>;
 return <Context.Provider value={{ data, actor, act }}>{children}</Context.Provider>;
}
export function useManagement() { const context = useContext(Context); if (!context) throw new Error("ManagementProvider is required."); return context; }
