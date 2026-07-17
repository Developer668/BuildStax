"use client";

import { FlaskConical, Plus, Radar, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { type Dispatch, type SetStateAction, useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { createCampaignAction, createPitchVersionAction, generateAkashPitchAction, runSandboxDiscoveryAction, updateCampaignAction } from "@/lib/actions/campaign";
import { initialActionState, type ActionState } from "@/lib/actions/types";
import type { Campaign } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, FormMessage, fieldErrorProps } from "@/components/ui/form-message";
import { Input, SelectInput, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

function useResult(state: ActionState, setOpen?: Dispatch<SetStateAction<boolean>>) {
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      const closeTimer = setOpen ? window.setTimeout(() => setOpen(false), 0) : undefined;
      router.refresh();
      return () => {
        if (closeTimer) window.clearTimeout(closeTimer);
      };
    }
  }, [router, setOpen, state]);
}

export function CreateCampaignDialog() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createCampaignAction, initialActionState);
  useResult(state, setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="primary"><Plus /> New campaign</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create campaign</DialogTitle><DialogDescription>Define the market, spend guardrail, pricing floor, and first-call pitch.</DialogDescription></DialogHeader>
        <form action={action} className="space-y-4 p-5" noValidate>
          <CampaignFields state={state} />
          <FormMessage state={state} />
          <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton variant="dark" pendingLabel="Creating…">Create campaign</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CampaignSettingsForm({ campaign }: { campaign: Campaign }) {
  const [state, action] = useActionState(updateCampaignAction, initialActionState);
  useResult(state);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="campaignId" value={campaign.id} />
      <CampaignFields campaign={campaign} state={state} />
      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton variant="secondary" pendingLabel="Saving…">Save campaign</SubmitButton></div>
    </form>
  );
}

export function PitchVersionDialog({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createPitchVersionAction, initialActionState);
  useResult(state, setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary" size="sm"><FlaskConical /> Add challenger</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add challenger pitch</DialogTitle><DialogDescription>New language starts as a challenger. Performance data must earn promotion.</DialogDescription></DialogHeader>
        <form action={action} className="space-y-4 p-5" noValidate>
          <input type="hidden" name="campaignId" value={campaignId} />
          <div><label className="field-label" htmlFor="pitch-label">Version name</label><Input id="pitch-label" name="label" {...fieldErrorProps(state, "label", { id: "pitch-label-error" })} /><FieldError state={state} name="label" id="pitch-label-error" /></div>
          <div><label className="field-label" htmlFor="pitch-script">Pitch</label><Textarea id="pitch-script" name="script" className="min-h-48" {...fieldErrorProps(state, "script", { id: "pitch-script-error" })} /><FieldError state={state} name="script" id="pitch-script-error" /></div>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton variant="dark">Add challenger</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DiscoveryButton({ campaignId, sandbox }: { campaignId: string; sandbox: boolean }) {
  const [state, action] = useActionState(runSandboxDiscoveryAction, initialActionState);
  useResult(state);
  return (
    <div><form action={action}><input type="hidden" name="campaignId" value={campaignId} /><SubmitButton variant="secondary" size="sm" pendingLabel={sandbox ? "Adding…" : "Discovering…"}><Radar /> {sandbox ? "Add sandbox prospects" : "Discover with Zero"}</SubmitButton></form>{state.status === "error" ? <div className="mt-2"><FormMessage state={state} /></div> : null}</div>
  );
}

export function AkashPitchButton({ campaignId }: { campaignId: string }) {
  const [state, action] = useActionState(generateAkashPitchAction, initialActionState);
  useResult(state);
  return (
    <div><form action={action}><input type="hidden" name="campaignId" value={campaignId} /><SubmitButton variant="secondary" size="sm" pendingLabel="Drafting…"><Sparkles /> Draft with AkashML</SubmitButton></form>{state.status === "error" ? <div className="mt-2"><FormMessage state={state} /></div> : null}</div>
  );
}

function CampaignFields({ campaign, state }: { campaign?: Campaign; state: ActionState }) {
  const suffix = campaign?.id ?? "new";
  const ids = {
    name: `campaign-name-${suffix}`,
    vertical: `vertical-${suffix}`,
    region: `region-${suffix}`,
    dailyLeadLimit: `lead-limit-${suffix}`,
    dailySpendCap: `spend-cap-${suffix}`,
    pricingFloor: `pricing-floor-${suffix}`,
    pitchScript: `pitch-${suffix}`,
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><label className="field-label" htmlFor={ids.name}>Campaign name</label><Input id={ids.name} name="name" defaultValue={campaign?.name} {...fieldErrorProps(state, "name", { id: `${ids.name}-error` })} /><FieldError state={state} name="name" id={`${ids.name}-error`} /></div>
      <div><label className="field-label" htmlFor={ids.vertical}>Target vertical</label><Input id={ids.vertical} name="vertical" defaultValue={campaign?.vertical} {...fieldErrorProps(state, "vertical", { id: `${ids.vertical}-error` })} /><FieldError state={state} name="vertical" id={`${ids.vertical}-error`} /></div>
      <div><label className="field-label" htmlFor={ids.region}>Region</label><Input id={ids.region} name="region" defaultValue={campaign?.region} {...fieldErrorProps(state, "region", { id: `${ids.region}-error` })} /><FieldError state={state} name="region" id={`${ids.region}-error`} /></div>
      {campaign ? <div><label className="field-label" htmlFor={`status-${campaign.id}`}>Status</label><SelectInput id={`status-${campaign.id}`} name="status" defaultValue={campaign.status}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></SelectInput></div> : <input type="hidden" name="status" value="draft" />}
      <div><label className="field-label" htmlFor={ids.dailyLeadLimit}>Daily lead limit</label><Input id={ids.dailyLeadLimit} name="dailyLeadLimit" type="number" min="1" max="500" defaultValue={campaign?.dailyLeadLimit ?? 20} {...fieldErrorProps(state, "dailyLeadLimit", { id: `${ids.dailyLeadLimit}-error` })} /><FieldError state={state} name="dailyLeadLimit" id={`${ids.dailyLeadLimit}-error`} /></div>
      <div><label className="field-label" htmlFor={ids.dailySpendCap}>Daily provider spend cap</label><Input id={ids.dailySpendCap} name="dailySpendCap" type="number" min="0" step="1" defaultValue={(campaign?.dailySpendCapCents ?? 2500) / 100} {...fieldErrorProps(state, "dailySpendCap", { id: `${ids.dailySpendCap}-error` })} /><FieldError state={state} name="dailySpendCap" id={`${ids.dailySpendCap}-error`} /></div>
      <div><label className="field-label" htmlFor={ids.pricingFloor}>Customer pricing floor</label><Input id={ids.pricingFloor} name="pricingFloor" type="number" min="1" step="50" defaultValue={(campaign?.pricingFloorCents ?? 150000) / 100} {...fieldErrorProps(state, "pricingFloor", { id: `${ids.pricingFloor}-error` })} /><FieldError state={state} name="pricingFloor" id={`${ids.pricingFloor}-error`} /></div>
      <div className="sm:col-span-2"><label className="field-label" htmlFor={ids.pitchScript}>Active first-call pitch</label><Textarea id={ids.pitchScript} name="pitchScript" className="min-h-40" defaultValue={campaign?.pitchScript ?? "Hi, this is Maya with BuildStax. I noticed customers do not have a clear first-party website to confirm your services and hours. We build focused sites for independent businesses. Could I ask two quick questions to see whether that would be useful?"} {...fieldErrorProps(state, "pitchScript", { id: `${ids.pitchScript}-error` })} /><FieldError state={state} name="pitchScript" id={`${ids.pitchScript}-error`} /></div>
    </div>
  );
}
