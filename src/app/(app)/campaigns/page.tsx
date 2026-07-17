import { BarChart3, MapPin, Target } from "lucide-react";
import type { Metadata } from "next";
import { AkashPitchButton, CampaignSettingsForm, CreateCampaignDialog, DiscoveryButton, PitchVersionDialog } from "@/components/campaigns/campaign-controls";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listCampaigns } from "@/lib/db/queries";
import { formatCurrency, formatDate } from "@/lib/format";
import { isSandbox } from "@/lib/utils";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaignData = await listCampaigns();
  const sandbox = isSandbox();
  return (
    <>
      <PageHeader eyebrow="Acquisition system" title="Campaigns & pitch" description="Set the market, cost ceiling, immutable price floor, and measured first-call language." icon={BarChart3} action={<CreateCampaignDialog />} />
      {!campaignData.length ? <section className="panel"><EmptyState icon={Target} title="No campaigns" description="Create a campaign to group prospects, pitch variants, spend controls, and pricing rules." action={<CreateCampaignDialog />} /></section> : (
        <div className="space-y-4">
          {campaignData.map(({ campaign, versions, leadCount, activeCount, wonCount }) => (
            <section key={campaign.id} className="panel overflow-hidden">
              <div className="panel-header flex-wrap gap-3"><div><div className="flex items-center gap-2"><h2 className="text-[15px] font-extrabold">{campaign.name}</h2><Badge tone={campaign.status === "active" ? "success" : campaign.status === "paused" ? "warning" : "neutral"}>{campaign.status}</Badge></div><div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground"><MapPin className="size-3" />{campaign.region} · {campaign.vertical}</div></div><div className="flex flex-wrap gap-2"><DiscoveryButton campaignId={campaign.id} sandbox={sandbox} /><AkashPitchButton campaignId={campaign.id} /><PitchVersionDialog campaignId={campaign.id} /></div></div>
              <div className="grid border-b border-border sm:grid-cols-2 lg:grid-cols-5">
                <Metric label="Prospects" value={leadCount.toString()} />
                <Metric label="Active pipeline" value={activeCount.toString()} />
                <Metric label="Won" value={wonCount.toString()} />
                <Metric label="Daily spend cap" value={formatCurrency(campaign.dailySpendCapCents)} />
                <Metric label="Pricing floor" value={formatCurrency(campaign.pricingFloorCents)} />
              </div>
              <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:p-5">
                <div><div className="eyebrow mb-3">Campaign controls</div><CampaignSettingsForm campaign={campaign} /></div>
                <div><div className="mb-3 flex items-center justify-between"><div className="eyebrow">Pitch versions</div><div className="mono text-[9px] text-muted-foreground">Updated {formatDate(campaign.updatedAt)}</div></div><div className="divide-y divide-border rounded-[5px] border border-border">{versions.map((version) => {
                  const rate = version.calls ? Math.round((version.positiveOutcomes / version.calls) * 100) : 0;
                  return <article key={version.id} className="p-3.5"><div className="flex items-center justify-between gap-3"><div className="text-[11px] font-bold">{version.label}</div><Badge tone={version.status === "active" ? "success" : "info"}>{version.status}</Badge></div><p className="mt-2 line-clamp-3 text-[10px] leading-4 text-muted-foreground">{version.script}</p><div className="mono mt-3 text-[9px] text-[#7f877f]">{version.calls} calls · {version.positiveOutcomes} positive · {rate}%</div></article>;
                })}</div></div>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-border bg-[#fafbfa] px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><div className="eyebrow">{label}</div><div className="mono mt-1 text-[15px] font-semibold">{value}</div></div>;
}
