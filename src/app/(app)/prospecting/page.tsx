import { Bot } from "lucide-react";
import type { Metadata } from "next";
import { ProspectingBrowser } from "@/components/prospecting/prospecting-browser";
import { PageHeader } from "@/components/shell/page-header";
import { listBusinesses, listCampaigns } from "@/lib/db/queries";
import { getZeroReadiness } from "@/lib/providers/zero";
import { isSandbox } from "@/lib/utils";

export const metadata: Metadata = { title: "Prospecting" };
export const dynamic = "force-dynamic";

export default async function ProspectingPage() {
  const [rows, campaigns, zero] = await Promise.all([listBusinesses(), listCampaigns(), getZeroReadiness()]);
  const campaign = campaigns.find((item) => item.campaign.status === "active")?.campaign ?? null;
  return <>
    <PageHeader eyebrow="Autonomous acquisition" title="Prospecting" description="Inspect persisted discovery evidence and run one policy-capped provider action from an active campaign. Outreach remains phone-first." icon={Bot} />
    <ProspectingBrowser businesses={rows.map((row) => row.business)} campaign={campaign} sandbox={isSandbox()} liveDiscoveryReady={zero.authenticated && zero.liveActionsEnabled} />
  </>;
}
