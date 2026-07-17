import { ArrowRight, Building2, MapPin, Phone, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BusinessAvatar } from "@/components/domain/business-avatar";
import { StageBadge } from "@/components/domain/status-badges";
import { AddBusinessDialog } from "@/components/forms/add-business-dialog";
import { PipelineFilters } from "@/components/pipeline/pipeline-filters";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { listBusinesses, listCampaignOptions } from "@/lib/db/queries";
import { formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ search?: string; stage?: string; campaign?: string }> }) {
  const filters = await searchParams;
  const [rows, campaigns] = await Promise.all([
    listBusinesses({ search: filters.search, stage: filters.stage, campaignId: filters.campaign }),
    listCampaignOptions(),
  ]);
  return (
    <>
      <PageHeader eyebrow="Sales workspace" title="Pipeline" description={`${rows.length} businesses match the current view.`} icon={Building2} action={<AddBusinessDialog campaigns={campaigns} />} />
      <section className="panel overflow-hidden">
        <PipelineFilters campaigns={campaigns} />
        {rows.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="data-table min-w-[900px]">
                <thead><tr><th>Business</th><th>Stage</th><th>Score</th><th>Contact</th><th>Next action</th><th>Updated</th><th aria-label="Open" /></tr></thead>
                <tbody>
                  {rows.map(({ business, campaignName }) => (
                    <tr key={business.id}>
                      <td><Link href={`/businesses/${business.id}`} className="flex items-center gap-3"><BusinessAvatar name={business.name} /><span><span className="block text-[11px] font-bold">{business.name}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{business.category} · {business.location}</span><span className="mt-0.5 block text-[9px] text-[#889088]">{campaignName ?? "No campaign"}</span></span></Link></td>
                      <td><StageBadge stage={business.stage} /></td>
                      <td><div className="flex items-center gap-2"><span className="mono text-[10px] font-semibold">{business.score}</span><span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-[#6878e8]" style={{ width: `${business.score}%` }} /></span></div></td>
                      <td><div className="text-[10px] font-semibold">{business.contactName || "Unknown contact"}</div><div className="mono mt-0.5 text-[9px] text-muted-foreground">{business.phone}</div></td>
                      <td><div className="max-w-48 text-[10px] font-semibold">{business.nextAction}</div><div className="mono mt-0.5 text-[9px] text-muted-foreground">{business.nextActionAt ? formatRelativeTime(business.nextActionAt) : "No due date"}</div></td>
                      <td className="mono text-[9px] text-muted-foreground">{formatRelativeTime(business.updatedAt)}</td>
                      <td><Link href={`/businesses/${business.id}`} className="grid size-8 place-items-center rounded-[4px] hover:bg-muted" aria-label={`Open ${business.name}`}><ArrowRight className="size-3.5" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {rows.map(({ business }) => (
                <Link key={business.id} href={`/businesses/${business.id}`} className="block p-4 hover:bg-[#fafbfa]">
                  <div className="flex items-start gap-3"><BusinessAvatar name={business.name} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="truncate text-[12px] font-bold">{business.name}</h2><StageBadge stage={business.stage} /></div><div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><MapPin className="size-3" />{business.location}</div><div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground"><Phone className="size-3" />{business.phone}</div><div className="mt-3 rounded-[4px] bg-surface-subtle px-2.5 py-2 text-[10px] font-semibold">{business.nextAction}</div></div></div>
                </Link>
              ))}
            </div>
          </>
        ) : <EmptyState icon={filters.search || filters.stage || filters.campaign ? SearchX : Building2} title={filters.search || filters.stage || filters.campaign ? "No matching businesses" : "Pipeline is empty"} description={filters.search || filters.stage || filters.campaign ? "Clear a filter or try a broader search." : "Add a business manually or run the labeled sandbox discovery flow from Campaigns."} action={<AddBusinessDialog campaigns={campaigns} />} />}
      </section>
    </>
  );
}
