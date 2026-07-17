"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { Banknote, CheckCircle2, FileText, Mail, MessageSquareText, PhoneCall, Rocket } from "lucide-react";
import Link from "next/link";
import type { Call, Message, Payment, Project, Quote } from "@/lib/db/schema";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

type TimelineItem = { id: string; type: "call" | "message" | "quote" | "payment" | "project"; title: string; body: string; date: string; meta?: string };

export function BusinessTabs({ calls, messages, quotes, payments, project }: { calls: Call[]; messages: Message[]; quotes: Quote[]; payments: Payment[]; project: Project | null }) {
  const timeline: TimelineItem[] = [
    ...calls.map((call) => ({ id: call.id, type: "call" as const, title: `Call · ${call.outcome.replaceAll("_", " ")}`, body: call.summary, date: call.createdAt, meta: `${Math.round(call.durationSeconds / 60)} min · ${call.provider}` })),
    ...messages.map((message) => ({ id: message.id, type: "message" as const, title: `${message.direction} ${message.channel}`, body: message.body, date: message.createdAt, meta: message.subject || message.provider })),
    ...quotes.map((quote) => ({ id: quote.id, type: "quote" as const, title: `Quote ${quote.status}`, body: quote.scope, date: quote.createdAt, meta: `${formatCurrency(quote.proposedPriceCents)} · floor ${formatCurrency(quote.enforcedFloorCents)}` })),
    ...payments.map((payment) => ({ id: payment.id, type: "payment" as const, title: `Payment ${payment.status}`, body: `Reference ${payment.reference}`, date: payment.createdAt, meta: `${formatCurrency(payment.amountCents)} · ${payment.provider}` })),
    ...(project ? [{ id: project.id, type: "project" as const, title: `Project ${project.status}`, body: project.brief, date: project.updatedAt, meta: `${project.revisionCount} revision${project.revisionCount === 1 ? "" : "s"}` }] : []),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const icons = { call: PhoneCall, message: Mail, quote: FileText, payment: Banknote, project: Rocket };
  return (
    <Tabs.Root defaultValue="activity" className="panel overflow-hidden">
      <Tabs.List aria-label="Business workspace views" className="flex overflow-x-auto border-b border-border bg-[#fafbfa] px-2">
        {[['activity', 'Activity'], ['thread', `Thread ${messages.length}`], ['calls', `Calls ${calls.length}`], ['commercial', 'Commercial'], ['project', 'Project']].map(([value, label]) => (
          <Tabs.Trigger key={value} value={value} className="h-11 shrink-0 border-b-2 border-transparent px-3 text-[10px] font-bold text-muted-foreground transition-colors duration-100 data-[state=active]:border-[#5266ed] data-[state=active]:text-foreground">{label}</Tabs.Trigger>
        ))}
      </Tabs.List>

      <Tabs.Content value="activity">
        {timeline.length ? <div className="divide-y divide-border">{timeline.slice(0, 16).map((item) => {
          const Icon = icons[item.type];
          return <div key={`${item.type}-${item.id}`} className="flex gap-3 p-4 sm:gap-4"><div className="grid size-8 shrink-0 place-items-center rounded-[5px] border border-border bg-surface-subtle text-muted-foreground"><Icon className="size-3.5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[11px] font-bold capitalize">{item.title}</h3><time className="mono text-[9px] text-muted-foreground">{formatDateTime(item.date)}</time></div><p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-[#444c45]">{item.body}</p>{item.meta ? <div className="mono mt-2 text-[9px] text-muted-foreground">{item.meta}</div> : null}</div></div>;
        })}</div> : <EmptyState icon={MessageSquareText} title="No activity yet" description="Calls, quotes, payments, messages, and project events will appear here." />}
      </Tabs.Content>

      <Tabs.Content value="thread">
        {messages.length ? <div className="space-y-0 divide-y divide-border">{messages.map((message) => (
          <article key={message.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><Badge tone={message.direction === "inbound" ? "info" : message.direction === "outbound" ? "success" : "neutral"}>{message.direction}</Badge><span className="text-[10px] font-bold">{message.subject || (message.channel === "note" ? "Internal note" : "No subject")}</span><time className="mono ml-auto text-[9px] text-muted-foreground">{formatDateTime(message.createdAt)}</time></div><p className="mt-3 whitespace-pre-wrap text-[11px] leading-5 text-[#3f4740]">{message.body}</p><div className="mono mt-3 text-[9px] text-muted-foreground">{message.channel} · {message.provider} · {message.status}</div></article>
        ))}</div> : <EmptyState icon={Mail} title="No customer messages" description="Record the post-call follow-up or an inbound reply to start the thread." />}
      </Tabs.Content>

      <Tabs.Content value="calls">
        {calls.length ? <div className="divide-y divide-border">{calls.map((call) => (
          <article key={call.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><Badge tone={call.outcome === "interested" ? "success" : call.outcome === "do_not_call" ? "danger" : "neutral"}>{call.outcome.replaceAll("_", " ")}</Badge><span className="mono text-[9px] text-muted-foreground">{Math.round(call.durationSeconds / 60)} min · {formatDateTime(call.createdAt)}</span></div><h3 className="mt-3 text-[11px] font-bold">Call summary</h3><p className="mt-1 text-[11px] leading-5 text-[#3f4740]">{call.summary}</p>{call.transcript ? <details className="mt-3 rounded-[5px] border border-border bg-[#fafbfa] p-3"><summary className="cursor-pointer text-[10px] font-bold">Transcript and notes</summary><p className="mt-3 whitespace-pre-wrap text-[10px] leading-5 text-muted-foreground">{call.transcript}</p></details> : null}</article>
        ))}</div> : <EmptyState icon={PhoneCall} title="No calls recorded" description="Log the first phone call before adding an outbound email follow-up." />}
      </Tabs.Content>

      <Tabs.Content value="commercial">
        {!quotes.length && !payments.length ? <EmptyState icon={Banknote} title="No commercial record" description="Create a quote after capturing requirements. Server-side rules enforce the pricing floor." /> : (
          <div className="divide-y divide-border">
            {quotes.map((quote) => <article key={quote.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">Quote</div><div className="mono mt-1 text-[19px] font-semibold">{formatCurrency(quote.proposedPriceCents)}</div></div><Badge tone={quote.status === "accepted" ? "success" : quote.status === "sent" ? "info" : "neutral"}>{quote.status}</Badge></div><p className="mt-3 text-[11px] leading-5 text-[#3f4740]">{quote.scope}</p><div className="mt-4 grid gap-2 sm:grid-cols-3"><CommercialFact label="Estimated cost" value={formatCurrency(quote.estimatedCostCents)} /><CommercialFact label="Enforced floor" value={formatCurrency(quote.enforcedFloorCents)} /><CommercialFact label="Expires" value={formatDate(quote.expiresAt)} /></div></article>)}
            {payments.map((payment) => <article key={payment.id} className="flex gap-3 p-4 sm:p-5"><div className="grid size-8 place-items-center rounded-full bg-[#edf8f1] text-success"><CheckCircle2 className="size-4" /></div><div><div className="text-[11px] font-bold">Payment recorded · {formatCurrency(payment.amountCents)}</div><div className="mono mt-1 text-[9px] text-muted-foreground">{payment.reference} · {payment.provider} · {formatDateTime(payment.paidAt)}</div></div></article>)}
          </div>
        )}
      </Tabs.Content>

      <Tabs.Content value="project">
        {project ? <div className="p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">Customer site</div><h2 className="mt-1 text-[15px] font-extrabold capitalize">{project.status}</h2></div><Badge tone={project.status === "complete" ? "success" : project.status === "review" ? "warning" : "info"}>{project.status}</Badge></div><p className="mt-4 max-w-3xl text-[11px] leading-5 text-[#3f4740]">{project.brief}</p><div className="mt-5 grid gap-2 sm:grid-cols-3"><CommercialFact label="Revisions" value={project.revisionCount.toString()} /><CommercialFact label="Created" value={formatDate(project.createdAt)} /><CommercialFact label="Delivered" value={formatDate(project.deliveredAt)} /></div><div className="mt-5"><Link href={`/preview/${project.previewToken}`} target="_blank" className="text-[11px] font-bold text-brand-blue hover:underline">Open secure customer preview</Link></div></div> : <EmptyState icon={Rocket} title="Build not started" description="A paid project with approved requirements can start the isolated local build flow." />}
      </Tabs.Content>
    </Tabs.Root>
  );
}

function CommercialFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[5px] border border-border bg-[#fafbfa] p-3"><div className="eyebrow">{label}</div><div className="mono mt-1 text-[11px] font-semibold">{value}</div></div>;
}
