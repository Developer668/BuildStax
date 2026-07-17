import { Activity, ArrowRight, Banknote, CheckCircle2, Clock3, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { AddBusinessDialog } from "@/components/forms/add-business-dialog";
import { BusinessAvatar } from "@/components/domain/business-avatar";
import { RunStatusBadge, StageBadge } from "@/components/domain/status-badges";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { activePipelineStages, stageMeta } from "@/lib/domain";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { getDashboardData, listCampaignOptions } from "@/lib/db/queries";
import { isSandbox } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [data, campaigns] = await Promise.all([getDashboardData(), listCampaignOptions()]);
  const metrics = [
    { label: "Active pipeline", value: data.activeBusinesses.length.toString(), detail: `${data.dueToday.length} actions due`, icon: Activity, tone: "text-[#4d5ed2] bg-[#eef0ff]" },
    { label: "Quoted value", value: formatCurrency(data.pipelineValueCents), detail: "Open + accepted quotes", icon: Banknote, tone: "text-[#346c72] bg-[#edf5f5]" },
    { label: "Positive outcomes", value: `${data.conversionRate}%`, detail: "Of contacted businesses", icon: PhoneCall, tone: "text-[#8a5e25] bg-[#faf4e9]" },
    { label: "Collected", value: formatCurrency(data.collectedCents), detail: "Recorded full payments", icon: CheckCircle2, tone: "text-[#675981] bg-[#f3f0f7]" },
  ];

  return (
    <>
      <PageHeader eyebrow="Today" title="Command center" description="Prioritize the next accountable action across sales and delivery." action={<AddBusinessDialog campaigns={campaigns} />} />

      {isSandbox() ? (
        <div className="mb-4 flex flex-col gap-3 rounded-[10px] border border-[#e5d5b7] bg-[#fbf6eb] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#9b5b0f]" /><div><div className="text-[11px] font-bold text-[#704713]">Sandbox dataset</div><div className="mt-0.5 text-[10px] leading-4 text-[#8a672f]">All people and contact details use evaluation fixtures. Calls and emails stay local, Stripe uses test mode, and Zero paid actions remain disabled.</div></div></div>
          <Link href="/integrations" className={buttonVariants({ variant: "secondary", size: "sm" })}>Review boundaries <ArrowRight /></Link>
        </div>
      ) : null}

      <section aria-label="Workspace metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="panel flex min-h-32 items-start justify-between p-4">
            <div><div className="text-[10px] font-bold text-muted-foreground">{metric.label}</div><div className="mono mt-3 text-[26px] font-semibold leading-none tracking-[-0.03em]">{metric.value}</div><div className="mt-3 text-[10px] text-muted-foreground">{metric.detail}</div></div>
            <div className={`grid size-9 place-items-center rounded-[8px] ${metric.tone}`}><metric.icon className="size-4" /></div>
          </div>
        ))}
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(310px,0.7fr)]">
        <section className="panel min-w-0">
          <div className="panel-header"><div><h2 className="section-title">Pipeline movement</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Live count by active stage</p></div><Link href="/pipeline" className={buttonVariants({ variant: "ghost", size: "sm" })}>Open pipeline <ArrowRight /></Link></div>
          <div className="overflow-x-auto p-4">
            <div className="grid min-w-[720px] grid-cols-11 gap-1.5" aria-label="Pipeline stage counts">
              {activePipelineStages.map((stage) => {
                const count = data.stageCounts[stage] ?? 0;
                const max = Math.max(...Object.values(data.stageCounts), 1);
                return (
                  <div key={stage} className="flex min-h-40 flex-col justify-end">
                    <div className="mono mb-2 text-center text-[10px] font-semibold">{count}</div>
                    <div className="mx-auto w-full rounded-t-[4px] bg-[#e8eaf0]" style={{ height: `${Math.max(8, (count / max) * 88)}px` }}><div className="h-1.5 w-full rounded-t-[4px] bg-[#6878e8]" /></div>
                    <div className="mt-2 min-h-8 text-center text-[9px] leading-3 text-muted-foreground">{stageMeta[stage].shortLabel}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="panel min-w-0">
          <div className="panel-header"><div><h2 className="section-title">Automation posture</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Latest execution evidence</p></div><Sparkles className="size-4 text-muted-foreground" /></div>
          <div className="divide-y divide-border">
            {data.recentRuns.slice(0, 4).map((run) => (
              <div key={run.id} className="min-w-0 px-4 py-3"><div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0 break-words text-[11px] font-bold capitalize [overflow-wrap:anywhere]">{run.type.replaceAll("_", " ")}</div><RunStatusBadge status={run.status} /></div><div className="mt-1 line-clamp-2 break-words text-[10px] leading-4 text-muted-foreground [overflow-wrap:anywhere]">{run.summary}</div><div className="mono mt-2 text-[9px] text-muted-foreground">{run.provider} · {formatRelativeTime(run.startedAt)}</div></div>
            ))}
          </div>
          <div className="border-t border-border p-3"><Link href="/runs" className={buttonVariants({ variant: "secondary", size: "sm", className: "w-full" })}>View audit runs</Link></div>
        </section>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <section className="panel min-w-0">
          <div className="panel-header"><div><h2 className="section-title">Work queue</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Due and overdue next actions</p></div><Badge tone={data.dueToday.length ? "warning" : "success"}>{data.dueToday.length} due</Badge></div>
          {data.dueToday.length ? (
            <div className="overflow-x-auto"><table className="data-table min-w-[620px]"><thead><tr><th>Business</th><th>Stage</th><th>Next action</th><th>Due</th><th aria-label="Open" /></tr></thead><tbody>{data.dueToday.slice(0, 7).map((business) => (
              <tr key={business.id}><td><Link href={`/businesses/${business.id}`} className="flex items-center gap-3"><BusinessAvatar name={business.name} /><span><span className="block text-[11px] font-bold">{business.name}</span><span className="block text-[10px] text-muted-foreground">{business.location}</span></span></Link></td><td><StageBadge stage={business.stage} /></td><td className="text-[11px]">{business.nextAction}</td><td className="mono text-[9px] text-muted-foreground">{business.nextActionAt ? formatRelativeTime(business.nextActionAt) : "—"}</td><td><Link href={`/businesses/${business.id}`} className="grid size-8 place-items-center rounded-[4px] hover:bg-muted" aria-label={`Open ${business.name}`}><ArrowRight className="size-3.5" /></Link></td></tr>
            ))}</tbody></table></div>
          ) : <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center"><CheckCircle2 className="size-6 text-success" /><div className="mt-3 text-[12px] font-bold">Queue is clear</div><div className="mt-1 text-[10px] text-muted-foreground">No active next action is due today.</div></div>}
        </section>

        <section className="panel min-w-0">
          <div className="panel-header"><div><h2 className="section-title">Recent activity</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Human and system audit trail</p></div><Clock3 className="size-4 text-muted-foreground" /></div>
          <div className="divide-y divide-border">
            {data.recentActivity.map((event) => (
              <div key={event.id} className="flex min-w-0 gap-3 px-4 py-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#7481d8]" /><div className="min-w-0"><div className="break-words text-[10px] font-bold [overflow-wrap:anywhere]">{event.action.replaceAll(".", " · ")}</div><p className="mt-0.5 break-words text-[10px] leading-4 text-muted-foreground [overflow-wrap:anywhere]">{event.detail}</p><div className="mono mt-1 text-[9px] text-muted-foreground">{formatRelativeTime(event.createdAt)}</div></div></div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
