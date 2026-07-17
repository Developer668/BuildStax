"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { createBusinessAction } from "@/lib/actions/business";
import { initialActionState } from "@/lib/actions/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, FormMessage, fieldErrorProps } from "@/components/ui/form-message";
import { Input, SelectInput } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function AddBusinessDialog({ campaigns }: { campaigns: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createBusinessAction, initialActionState);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      const closeTimer = window.setTimeout(() => setOpen(false), 0);
      if (state.redirectTo) router.push(state.redirectTo);
      router.refresh();
      return () => window.clearTimeout(closeTimer);
    }
  }, [router, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="primary"><Plus /> Add business</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a business</DialogTitle>
          <DialogDescription>Create a call-ready record. First outreach remains phone-only.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4 p-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="field-label" htmlFor="business-name">Business name</label><Input id="business-name" name="name" autoFocus {...fieldErrorProps(state, "name")} /><FieldError state={state} name="name" /></div>
            <div><label className="field-label" htmlFor="business-category">Category</label><Input id="business-category" name="category" placeholder="Landscape design" {...fieldErrorProps(state, "category")} /><FieldError state={state} name="category" /></div>
            <div><label className="field-label" htmlFor="business-location">Location</label><Input id="business-location" name="location" placeholder="Oakland, CA" {...fieldErrorProps(state, "location")} /><FieldError state={state} name="location" /></div>
            <div className="sm:col-span-2"><label className="field-label" htmlFor="business-address">Street address <span className="font-normal text-muted-foreground">optional</span></label><Input id="business-address" name="address" /></div>
            <div><label className="field-label" htmlFor="business-contact">Contact name <span className="font-normal text-muted-foreground">optional</span></label><Input id="business-contact" name="contactName" /></div>
            <div><label className="field-label" htmlFor="business-phone">Phone</label><Input id="business-phone" name="phone" type="tel" placeholder="+1 510 555 0123" {...fieldErrorProps(state, "phone")} /><FieldError state={state} name="phone" /></div>
            <div><label className="field-label" htmlFor="business-email">Email <span className="font-normal text-muted-foreground">optional</span></label><Input id="business-email" name="email" type="email" {...fieldErrorProps(state, "email")} /><FieldError state={state} name="email" /></div>
            <div><label className="field-label" htmlFor="website-status">Website status</label><SelectInput id="website-status" name="websiteStatus" defaultValue="none"><option value="none">No website</option><option value="stale">Stale or unusable</option><option value="unknown">Unknown</option><option value="active">Active website</option></SelectInput></div>
            <div className="sm:col-span-2"><label className="field-label" htmlFor="campaign-id">Campaign</label><SelectInput id="campaign-id" name="campaignId" defaultValue={campaigns[0]?.id ?? ""}><option value="">No campaign</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</SelectInput></div>
          </div>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton variant="dark" pendingLabel="Adding…">Add to pipeline</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
