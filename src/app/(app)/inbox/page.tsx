import { ArrowRight, Inbox as InboxIcon, Reply, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, SelectInput } from "@/components/ui/input";
import { listInboxThreads } from "@/lib/db/queries";
import type { InboxView } from "@/lib/inbox";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const views: Array<{ value: InboxView; label: string }> = [
  { value: "all", label: "All threads" },
  { value: "needs_response", label: "Needs response" },
  { value: "waiting", label: "Waiting on customer" },
];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ search?: string; view?: string }> }) {
  const params = await searchParams;
  const view = views.some((option) => option.value === params.view) ? params.view as InboxView : "all";
  const threads = await listInboxThreads({ search: params.search, view });
  const needsResponse = threads.filter((thread) => thread.needsResponse).length;
  const messageCount = threads.reduce((total, thread) => total + thread.messages.length, 0);

  return (
    <>
      <PageHeader
        eyebrow="Customer follow-up"
        title="Inbox"
        description="One operator view for persisted email and preview messages across customer threads."
        icon={InboxIcon}
        action={<Link href="/pipeline" className={buttonVariants({ variant: "secondary" })}>Open pipeline <ArrowRight /></Link>}
      />

      <section aria-label="Inbox summary" className="mb-4 grid gap-px overflow-hidden rounded-[6px] border border-border bg-border sm:grid-cols-3">
        <SummaryCell label="Threads shown" value={threads.length.toString()} detail="Customer records with messages" />
        <SummaryCell label="Needs response" value={needsResponse.toString()} detail="Latest recorded message is inbound" />
        <SummaryCell label="Messages shown" value={messageCount.toString()} detail="Email and preview replies" />
      </section>

      <section className="panel overflow-hidden">
        <form method="get" className="flex flex-col gap-2 border-b border-border bg-[#fafbfa] p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-3.5 text-muted-foreground" /><label className="sr-only" htmlFor="inbox-search">Search inbox</label><Input id="inbox-search" name="search" defaultValue={params.search ?? ""} placeholder="Search customers, subjects, or message text" className="h-9 pl-9" /></div>
          <label className="sr-only" htmlFor="inbox-view">Filter inbox</label>
          <SelectInput id="inbox-view" name="view" defaultValue={view} className="h-9 sm:w-48"><option value="all">All threads</option><option value="needs_response">Needs response</option><option value="waiting">Waiting on customer</option></SelectInput>
          <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>Apply view</button>
        </form>

        {threads.length ? (
          <div className="divide-y divide-border">
            {threads.map((thread) => {
              const latest = thread.lastMessage;
              return (
                <article key={thread.business.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><Badge tone={thread.needsResponse ? "warning" : "neutral"}>{thread.needsResponse ? "Needs response" : "Waiting on customer"}</Badge><span className="mono text-[9px] text-muted-foreground">{thread.messages.length} message{thread.messages.length === 1 ? "" : "s"} · {latest.channel}</span></div>
                    <h2 className="mt-2 text-[13px] font-extrabold"><Link href={`/businesses/${thread.business.id}?tab=thread`} className="hover:text-brand-blue hover:underline">{thread.business.name}</Link></h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground"><span className="font-semibold">{latest.subject || "No subject"}</span><span aria-hidden="true">·</span><span>{latest.direction === "inbound" ? "Inbound" : "Outbound"}</span><span aria-hidden="true">·</span><time>{formatDateTime(latest.createdAt)}</time></div>
                    <p className="mt-3 line-clamp-2 max-w-3xl whitespace-pre-wrap text-[11px] leading-5 text-[#3f4740]">{latest.body}</p>
                    <div className="mono mt-3 text-[9px] text-muted-foreground">{latest.provider}</div>
                  </div>
                  <Link href={`/businesses/${thread.business.id}?tab=thread`} aria-label={`Open thread for ${thread.business.name}`} className={buttonVariants({ variant: thread.needsResponse ? "primary" : "secondary", size: "sm" })}>{thread.needsResponse ? <Reply /> : <ArrowRight />} {thread.needsResponse ? "Reply" : "Open thread"}</Link>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={InboxIcon} title="No recorded threads" description="Email and preview messages will appear here after they are recorded on a customer business." action={<Link href="/pipeline" className={buttonVariants({ variant: "secondary" })}>Open pipeline <ArrowRight /></Link>} />
        )}
      </section>
    </>
  );
}

function SummaryCell({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="min-h-24 bg-white p-4"><div className="eyebrow">{label}</div><div className="mono mt-2 text-[23px] font-semibold leading-none">{value}</div><div className="mt-2 text-[10px] text-muted-foreground">{detail}</div></div>;
}
