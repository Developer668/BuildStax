"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("BuildStax workspace error", error.digest ?? error.name);
  }, [error]);
  return (
    <div className="panel mx-auto mt-20 max-w-lg p-8 text-center">
      <AlertTriangle className="mx-auto size-8 text-danger" />
      <h1 className="mt-4 text-[20px] font-extrabold">Workspace could not load</h1>
      <p className="mt-2 text-[12px] leading-5 text-muted-foreground">The operation failed without exposing provider or customer details. Retry once; the persisted record is unchanged.</p>
      <Button variant="dark" className="mt-5" onClick={reset}><RotateCcw /> Retry</Button>
    </div>
  );
}
