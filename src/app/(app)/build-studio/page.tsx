import { MonitorUp } from "lucide-react";
import type { Metadata } from "next";
import { BuildStudio } from "@/components/build/build-studio";
import { PageHeader } from "@/components/shell/page-header";
import { isBuildArtifactCurrent, readBuildArtifactSummary } from "@/lib/builds/artifact";
import { listDeliveryProjects } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Build studio" };
export const dynamic = "force-dynamic";

export default async function BuildStudioPage() {
  const projects = await listDeliveryProjects();
  const projectsWithEvidence = await Promise.all(
    projects.map(async (delivery) => {
      const artifact = await readBuildArtifactSummary(delivery.project.id);
      return {
        ...delivery,
        artifact,
        artifactCurrent: isBuildArtifactCurrent(artifact, delivery.project, delivery.business),
      };
    }),
  );
  return <>
    <PageHeader eyebrow="Website delivery" title="Build studio" description="Review persisted customer projects, verified artifacts, release checks, and the next handoff." icon={MonitorUp} />
    <BuildStudio projects={projectsWithEvidence} />
  </>;
}
