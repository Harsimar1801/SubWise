"use client";
import { WorkspaceError } from "@/components/ui/workspace-state";
export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <WorkspaceError reset={reset}/>; }
