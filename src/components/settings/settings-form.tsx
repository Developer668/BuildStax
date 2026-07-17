"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { updateWorkspaceSettingsAction } from "@/lib/actions/settings";
import { initialActionState } from "@/lib/actions/types";
import { FieldError, FormMessage, fieldErrorProps } from "@/components/ui/form-message";
import { Input, SelectInput } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function SettingsForm({ settings }: { settings: Record<string, string> }) {
  const [state, action] = useActionState(updateWorkspaceSettingsAction, initialActionState);
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.refresh();
    }
  }, [router, state]);
  return (
    <form action={action} className="space-y-6" noValidate>
      <section className="panel overflow-hidden">
        <div className="panel-header"><div><h2 className="section-title">Workspace</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Identity, currency, and operating timezone</p></div></div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <div className="sm:col-span-2"><label className="field-label" htmlFor="workspace-name">Workspace name</label><Input id="workspace-name" name="workspaceName" defaultValue={settings.workspace_name} {...fieldErrorProps(state, "workspaceName")} /><FieldError state={state} name="workspaceName" /></div>
          <div><label className="field-label" htmlFor="currency">Currency</label><SelectInput id="currency" name="currency" defaultValue="USD"><option value="USD">USD</option></SelectInput><p className="field-hint">Checkout and fulfillment are currently USD-only.</p></div>
          <div><label className="field-label" htmlFor="timezone">Timezone</label><Input id="timezone" name="timezone" defaultValue={settings.timezone ?? "America/Los_Angeles"} {...fieldErrorProps(state, "timezone")} /><FieldError state={state} name="timezone" /></div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="panel-header"><div><h2 className="section-title">Commercial guardrails</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Defaults that protected mutations enforce</p></div></div>
        <div className="p-4 sm:p-5"><div className="max-w-sm"><label className="field-label" htmlFor="pricing-floor">Default customer pricing floor</label><Input id="pricing-floor" name="pricingFloor" type="number" min="1" step="50" defaultValue={Number(settings.default_pricing_floor_cents ?? 150000) / 100} {...fieldErrorProps(state, "pricingFloor", { describedBy: "pricing-floor-hint" })} /><p id="pricing-floor-hint" className="field-hint">Each quote uses the higher of this floor or twice the estimated delivery cost.</p><FieldError state={state} name="pricingFloor" /></div></div>
      </section>

      <section className="panel overflow-hidden">
        <div className="panel-header"><div><h2 className="section-title">Workflow policy</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Binary controls are evaluated on the server</p></div></div>
        <div className="divide-y divide-border">
          <PolicyToggle name="requireCallBeforeEmail" defaultChecked={settings.require_call_before_email !== "false"} title="Require a phone call before outbound email" description="Preserves the approved first-contact sequence." />
          <EnforcedPolicy title="Block outreach to do-not-call records" description="Permanent database policy; DNC records cannot be reopened or contacted." />
          <EnforcedPolicy title="Require verified payment before build" description="Permanent database policy; a matching paid quote is required before any build starts." />
        </div>
      </section>
      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton variant="dark" size="lg" pendingLabel="Saving…">Save settings</SubmitButton></div>
    </form>
  );
}

function PolicyToggle({ name, defaultChecked, title, description }: { name: string; defaultChecked: boolean; title: string; description: string }) {
  return <label className="flex cursor-pointer items-start gap-3 px-4 py-4 hover:bg-[#fafbfa] sm:px-5"><input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-[#151815]" /><span><span className="block text-[11px] font-bold">{title}</span><span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{description}</span></span></label>;
}

function EnforcedPolicy({ title, description }: { title: string; description: string }) {
  return <div className="flex items-start gap-3 px-4 py-4 sm:px-5"><span aria-hidden="true" className="mt-0.5 grid size-4 place-items-center rounded-[3px] bg-[#151815] text-white"><Check className="size-3" /></span><span><span className="block text-[11px] font-bold">{title}</span><span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{description}</span></span></div>;
}
