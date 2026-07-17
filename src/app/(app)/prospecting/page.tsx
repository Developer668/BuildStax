import { Bot } from "lucide-react";
import type { Metadata } from "next";
import { ProspectingBrowser } from "@/components/prospecting/prospecting-browser";
import { PageHeader } from "@/components/shell/page-header";
import { listBusinesses } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Prospecting" };
export const dynamic = "force-dynamic";

export default async function ProspectingPage() {
  const rows = await listBusinesses();
  return <>
    <PageHeader eyebrow="Autonomous acquisition" title="Prospecting" description="Watch the local content engine find and qualify businesses. Outreach stays in the system workflow after qualification." icon={Bot} />
    <ProspectingBrowser businesses={rows.map((row) => row.business)} />
  </>;
}
