import { Settings } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { getWorkspaceSettings } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getWorkspaceSettings();
  return <><PageHeader eyebrow="Workspace controls" title="Settings" description="Defaults and guardrails for every protected operation." icon={Settings} /><div className="max-w-4xl"><SettingsForm settings={settings} /></div></>;
}
