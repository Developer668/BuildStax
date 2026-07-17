"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { auditIntegrationsAction } from "@/lib/actions/settings";
import { initialActionState } from "@/lib/actions/types";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

export function IntegrationAuditButton() {
  const [state, action] = useActionState(auditIntegrationsAction, initialActionState);
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.refresh();
    }
  }, [router, state]);
  return <div><form action={action}><SubmitButton variant="secondary" pendingLabel="Checking…"><RefreshCw /> Check readiness</SubmitButton></form>{state.status === "error" ? <div className="mt-2"><FormMessage state={state} /></div> : null}</div>;
}
