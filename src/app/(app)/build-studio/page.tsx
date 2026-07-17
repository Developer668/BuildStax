import { MonitorUp } from "lucide-react";
import type { Metadata } from "next";
import { BuildStudio } from "@/components/build/build-studio";
import { PageHeader } from "@/components/shell/page-header";
import { listDeliveryProjects } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Build studio" };
export const dynamic = "force-dynamic";

export default async function BuildStudioPage() {
  const projects = await listDeliveryProjects();
  return <>
    <PageHeader eyebrow="Website delivery" title="Build studio" description="Watch the platform agent assemble, render, check, and launch each paid customer website in the local build environment." icon={MonitorUp} />
    <BuildStudio projects={projects} />
  </>;
}
