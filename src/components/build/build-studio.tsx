"use client";

import * as React from "react";
import { Check, CircleDashed, Code2, ExternalLink, FileCode2, Globe2, RefreshCw, TerminalSquare } from "lucide-react";
import Link from "next/link";
import type { Business, Project } from "@/lib/db/schema";
import type { BuildArtifactSummary } from "@/lib/builds/artifact";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";

type DeliveryProject = { project: Project; business: Business; artifact: BuildArtifactSummary | null; artifactCurrent: boolean };

const buildSteps = [
  "Paid project linked",
  "Approved brief recorded",
  "Artifact manifest found",
  "Release checks passed",
  "Customer review state",
  "Delivery recorded",
];

function evidenceFor({ project, artifact }: DeliveryProject) {
  const currentArtifact = artifact?.revisionCount === project.revisionCount ? artifact : null;
  const reviewReady = Boolean(currentArtifact?.qa.passed) && ["review", "delivered", "complete"].includes(project.status);
  const delivered = ["delivered", "complete"].includes(project.status);
  return [
    project.status !== "queued",
    Boolean(project.brief.trim()),
    Boolean(currentArtifact),
    Boolean(currentArtifact?.qa.passed),
    reviewReady,
    delivered,
  ];
}

function statusLabel({ project, artifact, artifactCurrent }: DeliveryProject) {
  if (artifact && !artifactCurrent) return "Revision changed · regenerate artifact";
  if (project.status === "complete") return artifact ? "Delivered" : "Delivery recorded · artifact missing";
  if (project.status === "delivered") return artifact ? "Delivered" : "Delivered · artifact missing";
  if (project.status === "review") return artifact ? "Ready for customer review" : "Review state · artifact missing";
  if (project.status === "building") return "Build in progress";
  return "Queued";
}

export function BuildStudio({ projects }: { projects: DeliveryProject[] }) {
  const [selectedId, setSelectedId] = React.useState(projects[0]?.project.id ?? "");
  const selected = projects.find(({ project }) => project.id === selectedId) ?? projects[0];

  if (!selected) {
    return (
      <section className="panel">
        <EmptyState
          icon={FileCode2}
          title="No paid projects yet"
          description="A verified payment and approved customer requirements will create the first delivery record here."
          action={<Link href="/pipeline" className={buttonVariants({ variant: "secondary" })}>Open pipeline <ExternalLink /></Link>}
        />
      </section>
    );
  }

  const evidence = evidenceFor(selected);
  const passedEvidence = evidence.filter(Boolean).length;
  const previewUrl = `/preview/${selected.project.previewToken}`;
  const hasVerifiedArtifact = selected.artifactCurrent && Boolean(selected.artifact?.qa.passed);
  const artifactChecks = hasVerifiedArtifact ? selected.artifact?.qa.checks ?? [] : [];

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="panel overflow-hidden">
          <div className="panel-header">
            <div><h2 className="section-title">Build queue</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Paid customer projects</p></div>
            <Badge tone="info">{projects.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {projects.map(({ project, business }) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelectedId(project.id)}
                aria-pressed={selected.project.id === project.id}
                className={`w-full px-4 py-3 text-left transition-colors ${selected.project.id === project.id ? "bg-[#eef2ff]" : "hover:bg-[#fafbfa]"}`}
              >
                <div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold">{business.name}</span><span className={`size-2 shrink-0 rounded-full ${project.status === "complete" ? "bg-success" : "bg-[#285df5]"}`} /></div>
                <div className="mono mt-1 truncate text-[9px] capitalize text-muted-foreground">{project.status} · rev {project.revisionCount}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel p-4">
          <div className="eyebrow">Release evidence</div>
          <div className="mt-3 flex items-end justify-between gap-3"><span className="mono text-[24px] font-semibold">{passedEvidence}/{buildSteps.length}</span><span className="text-right text-[9px] font-bold text-muted-foreground">{statusLabel(selected)}</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e3e7e2]" aria-label={`${passedEvidence} of ${buildSteps.length} release evidence items passed`} role="progressbar" aria-valuemin={0} aria-valuemax={buildSteps.length} aria-valuenow={passedEvidence}><div className="h-full rounded-full bg-[#285df5] transition-[width] duration-300" style={{ width: `${(passedEvidence / buildSteps.length) * 100}%` }} /></div>
          <div className="mt-5 space-y-3">
            {buildSteps.map((label, index) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className={`grid size-5 shrink-0 place-items-center rounded-full ${evidence[index] ? "bg-[#b8ef4a] text-[#172007]" : "border border-border bg-white text-muted-foreground"}`}>
                  {evidence[index] ? <Check className="size-3" /> : <CircleDashed className="size-3" />}
                </span>
                <span className={`text-[9px] font-semibold ${evidence[index] ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
              </div>
            ))}
          </div>
          <Link href="/build-studio" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-5 w-full" })}><RefreshCw /> Refresh evidence</Link>
        </section>
      </aside>

      <section className="min-w-0 overflow-hidden rounded-[6px] border border-[#2c332d] bg-[#111512] shadow-[0_18px_50px_rgba(17,21,18,0.12)]">
        <div className="flex flex-col gap-3 border-b border-[#343a35] bg-[#1b201c] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-white"><FileCode2 className="size-4 text-[#b8ef4a]" /><div className="min-w-0"><div className="truncate text-[11px] font-bold">{selected.business.name}</div><div className="mono truncate text-[8px] text-[#929b92]">project/{selected.project.id}</div></div></div>
          <div className="flex flex-wrap gap-2">
            <Link href={previewUrl} target="_blank" className={buttonVariants({ variant: "secondary", size: "sm" })}><ExternalLink /> {hasVerifiedArtifact ? "Open verified preview" : "Open fallback preview"}</Link>
            <Link href={`/businesses/${selected.business.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Customer record</Link>
          </div>
        </div>
        <div className="grid min-h-[660px] lg:grid-rows-[minmax(390px,1fr)_230px]">
          <div className="min-h-0 bg-[#dfe3df] p-2 sm:p-3">
            <div className="flex h-full min-h-[390px] flex-col overflow-hidden rounded-[5px] border border-[#aeb6ae] bg-white shadow-lg">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-[#f4f5f2] px-3"><div className="flex gap-1" aria-hidden="true"><span className="size-2 rounded-full bg-[#ff6b5f]" /><span className="size-2 rounded-full bg-[#eebd45]" /><span className="size-2 rounded-full bg-[#72c66c]" /></div><div className="mono ml-2 flex-1 truncate rounded-[3px] border border-border bg-white px-2 py-1 text-[8px] text-muted-foreground">{previewUrl}</div><Globe2 className="size-3 text-muted-foreground" /></div>
              <iframe key={selected.project.id} src={previewUrl} title={`${selected.business.name} customer preview`} className="min-h-0 flex-1 bg-white" />
            </div>
          </div>
          <div className="grid border-t border-[#343a35] lg:grid-cols-[230px_minmax(0,1fr)]">
            <div className="border-b border-[#343a35] bg-[#171b18] p-3 lg:border-b-0 lg:border-r"><div className="flex items-center gap-2 text-[9px] font-bold text-[#d8ded8]"><FileCode2 className="size-3.5" /> ARTIFACT FILES</div><div className="mono mt-3 space-y-2 text-[8px] text-[#929b92]"><div className="text-[#dce4dc]">v artifact</div><div className="pl-3">index.html</div><div className="pl-3">qa.json</div><div className="pl-3 text-[#b8ef4a]">manifest.json</div></div></div>
            <div className="min-w-0 bg-[#0f1210] p-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[9px] font-bold text-[#d8ded8]"><TerminalSquare className="size-3.5" /> BUILD EVIDENCE</div><Badge tone={hasVerifiedArtifact ? "success" : "warning"}>{hasVerifiedArtifact ? "Verified" : selected.artifact ? "Regeneration required" : "Awaiting artifact"}</Badge></div><div className="mono mt-3 space-y-1.5 text-[8px] leading-4 text-[#8f9a90]"><p><span className="text-[#b8ef4a]">record</span> {selected.project.status} project with approved brief</p><p><span className="text-[#6e9bff]">preview</span> {hasVerifiedArtifact ? "serving persisted artifact" : "serving clearly labeled fallback content"}</p><p><span className="text-[#b8ef4a]">artifact</span> {selected.artifact ? `${selected.artifact.artifactId} - ${selected.artifact.sha256.slice(0, 12)}...` : "manifest not found on this host"}</p><p><span className="text-[#eebd45]">qa</span> {artifactChecks.length ? `${artifactChecks.filter((check) => check.passed).length}/${artifactChecks.length} deterministic checks passed` : selected.artifact ? "current revision has no release checks" : "no release checks available"}</p><p className="flex items-center gap-1 text-[#d8ded8]"><Code2 className="size-3" /> {statusLabel(selected)}</p></div></div>
          </div>
        </div>
      </section>
    </div>
  );
}
