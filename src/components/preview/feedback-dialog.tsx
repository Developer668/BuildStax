"use client";

import { MessageSquarePlus } from "lucide-react";
import { useActionState, useState } from "react";
import { submitPreviewFeedbackAction } from "@/lib/actions/business";
import { initialActionState } from "@/lib/actions/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, FormMessage, fieldErrorProps } from "@/components/ui/form-message";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function FeedbackDialog({ token, businessName }: { token: string; businessName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(submitPreviewFeedbackAction, initialActionState);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="primary" size="sm"><MessageSquarePlus /> Request a change</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Preview feedback</DialogTitle><DialogDescription>Send one clear revision request for {businessName}. It will be attached to this project.</DialogDescription></DialogHeader>
        {state.status === "success" ? <div className="p-5"><FormMessage state={state} /><div className="mt-4 flex justify-end"><Button variant="dark" onClick={() => setOpen(false)}>Done</Button></div></div> : (
          <form action={action} className="space-y-4 p-5" noValidate>
            <input type="hidden" name="token" value={token} />
            <div className="absolute -left-[9999px]" aria-hidden="true"><label htmlFor="company">Company</label><input id="company" name="company" tabIndex={-1} autoComplete="off" /></div>
            <div><label className="field-label" htmlFor="feedback-email">Your email <span className="font-normal text-muted-foreground">optional</span></label><Input id="feedback-email" name="email" type="email" autoComplete="email" {...fieldErrorProps(state, "email")} /><FieldError state={state} name="email" /></div>
            <div><label className="field-label" htmlFor="feedback-body">What should change?</label><Textarea id="feedback-body" name="feedback" className="min-h-44" placeholder="Describe the content or layout change and where it should appear." {...fieldErrorProps(state, "feedback")} /><FieldError state={state} name="feedback" /></div>
            <FormMessage state={state} />
            <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton variant="dark" pendingLabel="Sending…">Send feedback</SubmitButton></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
