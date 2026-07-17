"use client";

import { ArrowUpRight, Banknote, CreditCard, FileText, MailPlus, PhoneCall, PhoneOutgoing, Play, Rocket, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addMessageAction,
  advanceProjectAction,
  createQuoteAction,
  createStripeCheckoutAction,
  logCallAction,
  recordPaymentAction,
  saveRequirementsAction,
  startBuildAction,
  updateBusinessStageAction,
} from "@/lib/actions/business";
import { initialActionState, type ActionState } from "@/lib/actions/types";
import { startPlivoCallAction } from "@/lib/actions/telephony";
import type { Business, Project, Quote } from "@/lib/db/schema";
import { getAllowedManualStageTransitions, stageMeta, type BusinessStage } from "@/lib/domain";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, FormMessage, fieldErrorProps } from "@/components/ui/form-message";
import { Input, SelectInput, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

function useResult(state: ActionState, setOpen?: (open: boolean) => void) {
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      if (state.redirectTo) {
        if (state.redirectTo.startsWith("/")) {
          router.push(state.redirectTo);
          return;
        } else {
          try {
            const destination = new URL(state.redirectTo);
            if (destination.protocol === "https:" && (destination.hostname === "stripe.com" || destination.hostname.endsWith(".stripe.com"))) {
              window.location.assign(destination.toString());
              return;
            }
          } catch {
            toast.error("The destination returned by the provider was invalid.");
          }
        }
      }
      const closeTimer = setOpen ? window.setTimeout(() => setOpen(false), 0) : undefined;
      router.refresh();
      return () => {
        if (closeTimer) window.clearTimeout(closeTimer);
      };
    }
  }, [router, setOpen, state]);
}

export function StageControl({ business }: { business: Business }) {
  const [state, action] = useActionState(updateBusinessStageAction, initialActionState);
  useResult(state);
  const transitions = getAllowedManualStageTransitions(business.stage as BusinessStage);
  if (!transitions.length) return null;
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="businessId" value={business.id} />
      <SelectInput name="stage" defaultValue={business.stage} className="h-9 w-40" aria-label="Change pipeline stage">
        <option value={business.stage}>{stageMeta[business.stage as BusinessStage]?.label ?? business.stage}</option>
        {transitions.map((stage) => <option key={stage} value={stage}>{stageMeta[stage].label}</option>)}
      </SelectInput>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">Move</SubmitButton>
    </form>
  );
}

export function LogCallDialog({ business }: { business: Business }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(logCallAction, initialActionState);
  useResult(state, setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary" disabled={business.doNotCall}><PhoneCall /> Log call</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log call outcome</DialogTitle><DialogDescription>Record the conversation as plain text. This never initiates a phone call.</DialogDescription></DialogHeader>
        <form action={action} className="space-y-4 p-5" noValidate>
          <input type="hidden" name="businessId" value={business.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="field-label" htmlFor="call-outcome">Outcome</label><SelectInput id="call-outcome" name="outcome" defaultValue="interested"><option value="interested">Interested</option><option value="follow_up">Follow up later</option><option value="no_answer">No answer</option><option value="not_interested">Not interested</option><option value="do_not_call">Do not call</option></SelectInput></div>
            <div><label className="field-label" htmlFor="call-duration">Duration in minutes</label><Input id="call-duration" name="durationMinutes" type="number" min="0" max="120" step="0.5" defaultValue="5" {...fieldErrorProps(state, "durationMinutes")} /><FieldError state={state} name="durationMinutes" /></div>
            <div className="sm:col-span-2"><label className="field-label" htmlFor="call-summary">Summary</label><Textarea id="call-summary" name="summary" placeholder="Decision, objections, requirements, and the agreed next step." {...fieldErrorProps(state, "summary")} /><FieldError state={state} name="summary" /></div>
            <div className="sm:col-span-2"><label className="field-label" htmlFor="call-transcript">Transcript or notes <span className="font-normal text-muted-foreground">optional</span></label><Textarea id="call-transcript" name="transcript" className="min-h-36" /></div>
          </div>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton variant="dark" pendingLabel="Recording…">Record outcome</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlivoCallDialog({ business, mode }: { business: Business; mode: "sandbox" | "live" }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(startPlivoCallAction, initialActionState);
  useResult(state, setOpen);
  const callable = !business.doNotCall && ["call_ready", "contacted", "interested", "quoted", "payment_pending"].includes(business.stage);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="primary" disabled={!callable} title={callable ? "Start a Plivo call" : "This business is not in a callable stage"}><PhoneOutgoing /> Call now</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Plivo call</DialogTitle>
          <DialogDescription>BuildStax will dial {business.phone} and connect the signed bidirectional stream to the configured voice agent.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4 p-5">
          <input type="hidden" name="businessId" value={business.id} />
          <div className="rounded-[5px] border border-border bg-surface-subtle p-3 text-[10px] leading-5 text-muted-foreground">
            <div><span className="font-bold text-foreground">Mode:</span> {mode === "sandbox" ? "Restricted test destination" : "Live outbound call"}</div>
            <div><span className="font-bold text-foreground">Contact:</span> {business.name}</div>
            <div><span className="font-bold text-foreground">Number:</span> {business.phone}</div>
          </div>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton variant="dark" pendingLabel="Dialing…">Place call</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RequirementsDialog({ business }: { business: Business }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(saveRequirementsAction, initialActionState);
  useResult(state, setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><Settings2 /> Requirements</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Customer requirements</DialogTitle><DialogDescription>Keep the approved scope separate from untrusted source material.</DialogDescription></DialogHeader>
        <form action={action} className="space-y-4 p-5" noValidate>
          <input type="hidden" name="businessId" value={business.id} />
          <div><label className="field-label" htmlFor="requirements">Approved requirements</label><Textarea id="requirements" name="requirements" defaultValue={business.requirements} className="min-h-44" {...fieldErrorProps(state, "requirements")} /><FieldError state={state} name="requirements" /></div>
          <div><label className="field-label" htmlFor="preferred-style">Visual direction</label><Textarea id="preferred-style" name="preferredStyle" defaultValue={business.preferredStyle} placeholder="Tone, palette, photography, and explicit avoidances." {...fieldErrorProps(state, "preferredStyle")} /><FieldError state={state} name="preferredStyle" /></div>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton variant="dark">Save requirements</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function QuoteDialog({ business, configuredFloorCents }: { business: Business; configuredFloorCents: number }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createQuoteAction, initialActionState);
  const [cost, setCost] = useState(business.estimatedSiteCostCents / 100);
  useResult(state, setOpen);
  const enforcedFloor = useMemo(() => Math.max(cost * 2, configuredFloorCents / 100), [configuredFloorCents, cost]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="primary"><FileText /> Create quote</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create a floor-safe quote</DialogTitle><DialogDescription>The customer price is enforced server-side against both cost and the campaign floor.</DialogDescription></DialogHeader>
        <form action={action} className="space-y-4 p-5" noValidate>
          <input type="hidden" name="businessId" value={business.id} />
          <div className="rounded-[5px] border border-[#c8d6ff] bg-[#f1f5ff] p-3"><div className="eyebrow !text-[#4561a4]">Current enforced floor</div><div className="mono mt-1 text-[20px] font-semibold text-[#22489e]">{formatCurrency(Math.round(enforcedFloor * 100))}</div><div className="mt-1 text-[10px] text-[#5b6f9d]">Higher of 2 × estimated cost ({formatCurrency(Math.round(cost * 200))}) or configured floor ({formatCurrency(configuredFloorCents)}).</div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="field-label" htmlFor="estimated-cost">Estimated delivery cost</label><Input id="estimated-cost" name="estimatedCost" type="number" min="1" step="1" value={cost} onChange={(event) => setCost(Number(event.target.value))} {...fieldErrorProps(state, "estimatedCost")} /><FieldError state={state} name="estimatedCost" /></div>
            <div><label className="field-label" htmlFor="proposed-price">Customer price</label><Input id="proposed-price" name="proposedPrice" type="number" min={enforcedFloor} step="1" defaultValue={Math.ceil(enforcedFloor * 1.25)} {...fieldErrorProps(state, "proposedPrice")} /><FieldError state={state} name="proposedPrice" /></div>
            <div className="sm:col-span-2"><label className="field-label" htmlFor="quote-scope">Scope</label><Textarea id="quote-scope" name="scope" className="min-h-36" defaultValue={business.requirements} {...fieldErrorProps(state, "scope")} /><FieldError state={state} name="scope" /></div>
            <div><label className="field-label" htmlFor="quote-expiry">Valid for</label><SelectInput id="quote-expiry" name="expiresInDays" defaultValue="14"><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></SelectInput></div>
          </div>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton variant="dark" pendingLabel="Creating…">Record quote</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentDialog({ business, quote }: { business: Business; quote: Quote }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(recordPaymentAction, initialActionState);
  useResult(state, setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="primary"><Banknote /> Record payment</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record full payment</DialogTitle><DialogDescription>This local fallback records external payment evidence. It does not charge the customer.</DialogDescription></DialogHeader>
        <form action={action} className="space-y-4 p-5" noValidate>
          <input type="hidden" name="businessId" value={business.id} /><input type="hidden" name="quoteId" value={quote.id} />
          <div><label className="field-label" htmlFor="payment-amount">Amount</label><Input id="payment-amount" name="amount" type="number" readOnly value={quote.proposedPriceCents / 100} /><p className="field-hint">Must match the accepted quote total.</p></div>
          <div><label className="field-label" htmlFor="payment-reference">External reference</label><Input id="payment-reference" name="reference" placeholder="Invoice or processor reference" {...fieldErrorProps(state, "reference")} /><FieldError state={state} name="reference" /></div>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton variant="dark" pendingLabel="Recording…">Record payment</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StripeCheckoutButton({ business, quote }: { business: Business; quote: Quote }) {
  const [state, action] = useActionState(createStripeCheckoutAction, initialActionState);
  useResult(state);
  return (
    <form action={action}>
      <input type="hidden" name="businessId" value={business.id} />
      <input type="hidden" name="quoteId" value={quote.id} />
      <SubmitButton variant="primary" pendingLabel="Opening Stripe…"><CreditCard /> Collect with Stripe</SubmitButton>
      {state.status === "error" ? <div className="mt-2 max-w-72"><FormMessage state={state} /></div> : null}
    </form>
  );
}

export function MessageDialog({ business }: { business: Business }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(addMessageAction, initialActionState);
  useResult(state, setOpen);
  const outreachBlocked = business.doNotCall;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><MailPlus /> {outreachBlocked ? "Log inbound or note" : "Add message"}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{outreachBlocked ? "Log inbound message or note" : "Add to customer thread"}</DialogTitle>
          <DialogDescription>{outreachBlocked ? "Outbound follow-up is permanently disabled for this do-not-call record. You can still record an inbound email or internal note." : "In sandbox mode, outbound messages are saved as records and are not delivered."}</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4 p-5" noValidate>
          <input type="hidden" name="businessId" value={business.id} />
          <div><label className="field-label" htmlFor="message-direction">Type</label><SelectInput id="message-direction" name="direction" defaultValue={outreachBlocked ? "inbound" : "outbound"}>{outreachBlocked ? null : <option value="outbound">Outbound follow-up</option>}<option value="inbound">Inbound email</option><option value="internal">Internal note</option></SelectInput></div>
          <div><label className="field-label" htmlFor="message-subject">Subject <span className="font-normal text-muted-foreground">optional for notes</span></label><Input id="message-subject" name="subject" /></div>
          <div><label className="field-label" htmlFor="message-body">Message</label><Textarea id="message-body" name="body" className="min-h-40" {...fieldErrorProps(state, "body")} /><FieldError state={state} name="body" /></div>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton variant="dark" pendingLabel="Recording…">Save to thread</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StartBuildButton({ business }: { business: Business }) {
  const [state, action] = useActionState(startBuildAction, initialActionState);
  useResult(state);
  return (
    <form action={action}><input type="hidden" name="businessId" value={business.id} /><SubmitButton variant="primary" pendingLabel="Starting…"><Play /> Start build</SubmitButton>{state.status === "error" ? <div className="mt-2"><FormMessage state={state} /></div> : null}</form>
  );
}

export function ProjectAction({ business, project }: { business: Business; project: Project }) {
  const [state, action] = useActionState(advanceProjectAction, initialActionState);
  useResult(state);
  const labels: Record<string, string> = { building: "Send to review", review: "Mark delivered", delivered: "Mark complete" };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/preview/${project.previewToken}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-[5px] border border-border bg-white px-3 text-[12px] font-bold hover:bg-muted">Open preview <ArrowUpRight className="size-4" /></Link>
      {labels[project.status] ? <form action={action}><input type="hidden" name="businessId" value={business.id} /><input type="hidden" name="projectId" value={project.id} /><SubmitButton variant="primary" pendingLabel="Updating…"><Rocket /> {labels[project.status]}</SubmitButton></form> : null}
      {state.status === "error" ? <FormMessage state={state} /> : null}
    </div>
  );
}
