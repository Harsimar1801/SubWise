"use client";
import Link from "next/link";
import { Button, Card } from "./primitives";
export function WorkspaceLoading() { return <Card><div role="status" aria-live="polite"><span aria-hidden="true" className="mb-4 block h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink"/><p className="font-medium">Opening your workspace…</p><p className="mt-2 text-xs text-muted">Loading server records and controls.</p></div></Card>; }
export function WorkspaceError({ reset }: { reset: () => void }) { return <Card><h1 className="text-lg font-semibold">This workspace could not be displayed</h1><p role="alert" className="mt-2 text-sm leading-6 text-muted">Try loading the screen again. Saved server records are preserved when you reload.</p><div className="mt-5 flex flex-wrap items-center gap-4"><Button onClick={reset}>Try again</Button><Link className="text-xs underline underline-offset-4" href="/">Return to sign in</Link></div></Card>; }
