"use client";

import { useMemo, useState } from "react";
import { Check, ExternalLink, FileCode2, Globe2, Monitor, ShieldCheck, TerminalSquare } from "lucide-react";
import Link from "next/link";
import type { Business, Project } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

type DeliveryArtifact = {
  artifactId: string;
  sha256: string;
  createdAt: string;
  files: string[];
  qa: { passed: boolean; checks: Array<{ name: string; passed: boolean; detail: string }> };
};

type DeliveryProject = { project: Project; business: Business; artifact: DeliveryArtifact | null };

export function BuildStudio({ projects }: { projects: DeliveryProject[] }) {
  const [selectedId, setSelectedId] = useState(projects[0]?.project.id ?? "");
  const selected = useMemo(() => projects.find(({ project }) => project.id === selectedId) ?? projects[0], [projects, selectedId]);

  if (!selected) return <div className="panel p-8 text-center text-[11px] text-muted-foreground">No delivery projects have started yet.</div>;
  const { project, business, artifact } = selected;
  const previewUrl = artifact ? `/api/preview/${project.previewToken}/site` : `/preview/${project.previewToken}`;
  const releaseStatus = artifact?.qa.passed ? "Verified" : "Artifact pending";

  return <div className="grid min-w-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
    <aside className="space-y-4">
      <section className="panel overflow-hidden">
        <div className="panel-header"><div><h2 className="section-title">Build queue</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Paid customer projects</p></div><Badge tone="info">{projects.length}</Badge></div>
        <div className="divide-y divide-border">{projects.map((item) => <button key={item.project.id} onClick={() => setSelectedId(item.project.id)} className={`w-full px-4 py-3 text-left transition-colors ${selectedId === item.project.id ? "bg-[#eef2ff]" : "hover:bg-[#fafbfa]"}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold">{item.business.name}</span><span className={`size-2 shrink-0 rounded-full ${item.artifact?.qa.passed ? "bg-success" : "bg-[#eebd45]"}`} /></div><div className="mono mt-1 text-[9px] capitalize text-muted-foreground">{item.project.status} · rev {item.project.revisionCount}</div></button>)}</div>
      </section>
      <section className="panel p-4">
        <div className="eyebrow">Release evidence</div>
        <div className="mt-3 flex items-end justify-between"><span className="text-[16px] font-bold">{releaseStatus}</span><Badge tone={artifact?.qa.passed ? "success" : "warning"}>{artifact?.qa.passed ? "Passed" : "Pending"}</Badge></div>
        {artifact ? <><div className="mono mt-3 break-all text-[8px] leading-4 text-muted-foreground">sha256:{artifact.sha256}</div><div className="mt-4 space-y-2">{artifact.qa.checks.map((check) => <div key={check.name} className="flex gap-2"><span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${check.passed ? "bg-[#b8ef4a] text-[#172007]" : "bg-[#f7dfdf] text-danger"}`}>{check.passed ? <Check className="size-2.5" /> : "!"}</span><div><div className="text-[9px] font-bold">{check.name}</div><div className="text-[8px] leading-3 text-muted-foreground">{check.detail}</div></div></div>)}</div></> : <p className="mt-3 text-[10px] leading-4 text-muted-foreground">This project predates artifact delivery. Start a fresh paid build to generate a verified release.</p>}
      </section>
    </aside>

    <section className="min-w-0 overflow-hidden rounded-[6px] border border-[#2c332d] bg-[#111512] shadow-[0_18px_50px_rgba(17,21,18,0.12)]">
      <div className="flex flex-col gap-3 border-b border-[#343a35] bg-[#1b201c] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-white"><Monitor className="size-4 text-[#b8ef4a]" /><div className="min-w-0"><div className="truncate text-[11px] font-bold">{business.name}</div><div className="mono truncate text-[8px] text-[#929b92]">project/{project.id}</div></div></div>
        <div className="flex flex-wrap gap-2"><Link href={`/preview/${project.previewToken}`} target="_blank" className={buttonVariants({ variant: "secondary", size: "sm" })}><ExternalLink /> Customer review</Link><Link href={`/businesses/${business.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Customer record</Link></div>
      </div>
      <div className="grid min-h-[660px] lg:grid-rows-[minmax(390px,1fr)_230px]">
        <div className="min-h-0 bg-[#dfe3df] p-2 sm:p-3">
          <div className="flex h-full min-h-[390px] flex-col overflow-hidden rounded-[5px] border border-[#aeb6ae] bg-white shadow-lg">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-[#f4f5f2] px-3"><div className="flex gap-1" aria-hidden="true"><span className="size-2 rounded-full bg-[#ff6b5f]" /><span className="size-2 rounded-full bg-[#eebd45]" /><span className="size-2 rounded-full bg-[#72c66c]" /></div><div className="mono ml-2 flex-1 truncate rounded-[3px] border border-border bg-white px-2 py-1 text-[8px] text-muted-foreground">{previewUrl}</div><Globe2 className="size-3 text-muted-foreground" /></div>
            <iframe key={`${project.id}:${artifact?.sha256 ?? "fallback"}`} src={previewUrl} title={`${business.name} ${artifact ? "verified website build" : "customer preview"}`} className="min-h-0 flex-1 bg-white" />
          </div>
        </div>
        <div className="grid border-t border-[#343a35] lg:grid-cols-[230px_minmax(0,1fr)]">
          <div className="border-b border-[#343a35] bg-[#171b18] p-3 lg:border-b-0 lg:border-r"><div className="flex items-center gap-2 text-[9px] font-bold text-[#d8ded8]"><FileCode2 className="size-3.5" /> ARTIFACT FILES</div><div className="mono mt-3 space-y-2 text-[8px] text-[#929b92]">{artifact?.files.map((file) => <div key={file} className={file === "qa.json" ? "text-[#b8ef4a]" : ""}>{file}</div>) ?? <div>No generated artifact</div>}</div></div>
          <div className="min-w-0 bg-[#0f1210] p-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[9px] font-bold text-[#d8ded8]"><TerminalSquare className="size-3.5" /> BUILD RECORD</div><Badge tone={artifact?.qa.passed ? "success" : "warning"}>{releaseStatus}</Badge></div><div className="mono mt-3 space-y-1.5 text-[8px] leading-4 text-[#8f9a90]">{artifact ? <><p><span className="text-[#b8ef4a]">worker</span> generated static artifact {artifact.artifactId}</p><p><span className="text-[#6e9bff]">preview</span> serving token-scoped artifact route</p><p><span className="text-[#b8ef4a]">guard</span> escaped customer content before rendering</p><p><span className="text-[#eebd45]">qa</span> {artifact.qa.checks.filter((check) => check.passed).length}/{artifact.qa.checks.length} deterministic release checks passed</p><p className="flex items-center gap-1 text-[#d8ded8]"><ShieldCheck className="size-3" /> ready for customer review</p></> : <><p><span className="text-[#eebd45]">artifact</span> no verified build exists for this legacy project</p><p><span className="text-[#8f9a90]">action</span> use a new paid build to create a source artifact and release record</p></>}</div></div>
        </div>
      </div>
    </section>
  </div>;
}
