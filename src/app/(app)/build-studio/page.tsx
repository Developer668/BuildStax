import { MonitorUp } from "lucide-react";
import type { Metadata } from "next";
import { BuildStudio } from "@/components/build/build-studio";
import { PageHeader } from "@/components/shell/page-header";
import { listDeliveryProjects } from "@/lib/db/queries";
import { readBuildArtifact } from "@/lib/builds/artifact";

export const metadata: Metadata = { title: "Build studio" };
export const dynamic = "force-dynamic";

export default async function BuildStudioPage() {
  const projects = await listDeliveryProjects();
  const withArtifacts = await Promise.all(projects.map(async (item) => {
    const artifact = await readBuildArtifact(item.project.id);
    return artifact ? { ...item, artifact: { artifactId: artifact.artifactId, sha256: artifact.sha256, createdAt: artifact.createdAt, files: artifact.files, qa: artifact.qa } } : { ...item, artifact: null };
  }));
  return <>
    <PageHeader eyebrow="Website delivery" title="Build studio" description="Inspect generated static artifacts, token-scoped previews, checksums, and release checks for each paid customer website." icon={MonitorUp} />
    <BuildStudio projects={withArtifacts} />
  </>;
}
