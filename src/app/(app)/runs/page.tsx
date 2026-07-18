import { Activity, ChevronDown, MessageSquareText, RotateCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ModeBadge, RunStatusBadge } from "@/components/domain/status-badges";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectInput } from "@/components/ui/input";
import { listAutomationRuns } from "@/lib/db/queries";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Automation runs" };
export const dynamic = "force-dynamic";

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string }> }) {
  const filters = await searchParams;
  const runs = await listAutomationRuns(filters);
  return (
    <>
      <PageHeader eyebrow="Observability" title="Automation runs" description="A non-sensitive execution record for discovery, delivery, and integration checks." icon={Activity} action={<><Link href="/runs/call-transcripts" className={buttonVariants({ variant: "secondary" })}><MessageSquareText /> Call transcripts</Link><Link href="/runs" className={buttonVariants({ variant: "secondary" })}><RotateCw /> Refresh</Link></>} />
      <section className="panel overflow-hidden">
        <form method="get" className="flex flex-col gap-2 border-b border-border bg-[#fafbfa] p-3 sm:flex-row sm:items-center">
          <SelectInput name="status" defaultValue={filters.status ?? "all"} className="h-9 sm:w-44" aria-label="Filter by status"><option value="all">All statuses</option><option value="succeeded">Succeeded</option><option value="blocked">Blocked</option><option value="failed">Failed</option><option value="running">Running</option></SelectInput>
          <SelectInput name="type" defaultValue={filters.type ?? "all"} className="h-9 sm:w-52" aria-label="Filter by run type"><option value="all">All run types</option><option value="discovery">Discovery</option><option value="site_build">Site build</option><option value="email_delivery">Email delivery</option><option value="integration_audit">Integration audit</option></SelectInput>
          <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>Apply filters</button>
        </form>
        {runs.length ? <div className="divide-y divide-border">{runs.map((run) => (
          <details key={run.id} className="group"><summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-4 hover:bg-[#fafbfa] sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-start gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-[5px] bg-surface-subtle"><Activity className="size-3.5 text-muted-foreground" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-bold capitalize">{run.type.replaceAll("_", " ")}</span><RunStatusBadge status={run.status} /><ModeBadge mode={run.mode} /></div><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{run.summary}</p></div></div><div className="flex items-center justify-between gap-5 sm:justify-end"><div className="text-right"><div className="mono text-[9px] text-muted-foreground">{formatDateTime(run.startedAt)}</div><div className="mono mt-1 text-[9px]">{formatCurrency(run.spendCents)} · {run.provider}</div></div><ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" /></div></summary><div className="border-t border-border bg-[#fafbfa] px-4 py-4 sm:pl-16"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><RunFact label="Run ID" value={run.id} /><RunFact label="Started" value={formatDateTime(run.startedAt)} /><RunFact label="Finished" value={formatDateTime(run.finishedAt)} /><RunFact label="Spend" value={formatCurrency(run.spendCents)} /></dl>{run.error ? <div className="mt-4 rounded-[5px] border border-[#efc4bd] bg-[#fff1ef] px-3 py-2 text-[10px] text-[#8f392f]">{run.error}</div> : null}<div className="mono mt-4 break-all text-[9px] leading-4 text-muted-foreground">Metadata: {run.metadata}</div></div></details>
        ))}</div> : <EmptyState icon={Activity} title="No matching runs" description="No execution records match the selected status and type." />}
      </section>
    </>
  );
}

function RunFact({ label, value }: { label: string; value: string }) { return <div><dt className="eyebrow">{label}</dt><dd className="mono mt-1 break-all text-[9px]">{value}</dd></div>; }
