"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Code2, ExternalLink, FileCode2, Globe2, LoaderCircle, Monitor, Play, RotateCcw, TerminalSquare } from "lucide-react";
import Link from "next/link";
import type { Business, Project } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

type DeliveryProject = { project: Project; business: Business };

const buildSteps = ["Read approved brief", "Plan page structure", "Assemble content", "Render local preview", "Run responsive checks", "Ready for customer review"];

export function BuildStudio({ projects }: { projects: DeliveryProject[] }) {
  const [selectedId, setSelectedId] = useState(projects[0]?.project.id ?? "");
  const selected = useMemo(() => projects.find(({ project }) => project.id === selectedId) ?? projects[0], [projects, selectedId]);
  const initialProgress = selected?.project.status === "complete" ? 100 : selected?.project.status === "review" ? 84 : 42;
  const [progress, setProgress] = useState(initialProgress);
  const [running, setRunning] = useState(selected?.project.status !== "complete");

  const selectProject = (project: Project) => {
    setSelectedId(project.id);
    setProgress(project.status === "complete" ? 100 : project.status === "review" ? 84 : 42);
    setRunning(project.status !== "complete");
  };

  useEffect(() => {
    if (!running || progress >= 100) return;
    const timer = window.setInterval(() => setProgress((value) => Math.min(100, value + 2)), 900);
    return () => window.clearInterval(timer);
  }, [running, progress]);

  if (!selected) return <div className="panel p-8 text-center text-[11px] text-muted-foreground">No delivery projects have started yet.</div>;
  const activeStep = Math.min(buildSteps.length - 1, Math.floor(progress / (100 / buildSteps.length)));
  const previewUrl = `/preview/${selected.project.previewToken}`;

  return <div className="grid min-w-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
    <aside className="space-y-4">
      <section className="panel overflow-hidden">
        <div className="panel-header"><div><h2 className="section-title">Build queue</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Paid customer projects</p></div><Badge tone="info">{projects.length}</Badge></div>
        <div className="divide-y divide-border">{projects.map(({ project, business }) => <button key={project.id} onClick={() => selectProject(project)} className={`w-full px-4 py-3 text-left transition-colors duration-100 ${selectedId === project.id ? "bg-[#eef0ff]" : "hover:bg-[#f8f9fb]"}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold">{business.name}</span><span className={`size-2 shrink-0 rounded-full ${project.status === "complete" ? "bg-success" : "bg-[#5266ed]"}`} /></div><div className="mono mt-1 text-[9px] capitalize text-muted-foreground">{project.status} · rev {project.revisionCount}</div></button>)}</div>
      </section>
      <section className="panel p-4">
        <div className="eyebrow">Agent progress</div>
        <div className="mt-3 flex items-end justify-between"><span className="mono text-[24px] font-semibold">{progress}%</span><span className="text-[9px] font-bold text-muted-foreground">LOCAL BUILD</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e5e7ed]"><div className="h-full rounded-full bg-[#5266ed] transition-[width] duration-300" style={{ width: `${progress}%` }} /></div>
        <div className="mt-5 space-y-3">{buildSteps.map((label, index) => <div key={label} className="flex items-center gap-2.5"><span className={`grid size-5 shrink-0 place-items-center rounded-[6px] ${index < activeStep || progress === 100 ? "bg-[#dfe3ff] text-[#4454bd]" : index === activeStep ? "bg-[#5266ed] text-white" : "border border-border bg-white text-muted-foreground"}`}>{index < activeStep || progress === 100 ? <Check className="size-3" /> : index === activeStep && running ? <LoaderCircle className="size-3 animate-spin" /> : index + 1}</span><span className={`text-[9px] font-semibold ${index > activeStep && progress < 100 ? "text-muted-foreground" : ""}`}>{label}</span></div>)}</div>
        <Button className="mt-5 w-full" size="sm" onClick={() => progress >= 100 ? setProgress(initialProgress) : setRunning((value) => !value)}>{progress >= 100 ? <RotateCcw /> : <Play />}{progress >= 100 ? "Replay build" : running ? "Building now" : "Resume build"}</Button>
      </section>
    </aside>

    <section className="min-w-0 overflow-hidden rounded-[10px] border border-[#30384b] bg-[#151a29] shadow-[0_14px_38px_rgba(18,24,40,0.12)]">
      <div className="flex flex-col gap-3 border-b border-[#343c4f] bg-[#1b2132] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-white"><Monitor className="size-4 text-[#9ca7ff]" /><div className="min-w-0"><div className="truncate text-[11px] font-bold">{selected.business.name}</div><div className="mono truncate text-[8px] text-[#929bad]">project/{selected.project.id}</div></div></div>
        <div className="flex flex-wrap gap-2"><Link href={previewUrl} target="_blank" className={buttonVariants({ variant: "secondary", size: "sm" })}><ExternalLink /> Open preview</Link><Link href={`/businesses/${selected.business.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Customer record</Link></div>
      </div>
      <div className="grid min-h-[660px] lg:grid-rows-[minmax(390px,1fr)_230px]">
        <div className="min-h-0 bg-[#e6e8ed] p-2 sm:p-3">
          <div className="flex h-full min-h-[390px] flex-col overflow-hidden rounded-[8px] border border-[#b9bec9] bg-white shadow-lg">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-[#f4f5f7] px-3"><div className="flex gap-1" aria-hidden="true"><span className="size-2 rounded-full bg-[#a9afbb]" /><span className="size-2 rounded-full bg-[#9da4b2]" /><span className="size-2 rounded-full bg-[#8d96a6]" /></div><div className="mono ml-2 flex-1 truncate rounded-[5px] border border-border bg-white px-2 py-1 text-[8px] text-muted-foreground">localhost:3100{previewUrl}</div><Globe2 className="size-3 text-muted-foreground" /></div>
            <iframe key={selected.project.id} src={previewUrl} title={`${selected.business.name} local website preview`} className="min-h-0 flex-1 bg-white" />
          </div>
        </div>
        <div className="grid border-t border-[#343c4f] lg:grid-cols-[230px_minmax(0,1fr)]">
          <div className="border-b border-[#343c4f] bg-[#181e2d] p-3 lg:border-b-0 lg:border-r"><div className="flex items-center gap-2 text-[9px] font-bold text-[#d9dce5]"><FileCode2 className="size-3.5" /> FILES</div><div className="mono mt-3 space-y-2 text-[8px] text-[#929bad]"><div className="text-[#dce0e8]">▾ site</div><div className="pl-3">page.tsx</div><div className="pl-3">content.ts</div><div className="pl-3 text-[#9ca7ff]">styles.css</div><div>▾ public</div><div className="pl-3">project-01.webp</div><div className="pl-3">project-02.webp</div></div></div>
          <div className="min-w-0 bg-[#121625] p-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[9px] font-bold text-[#d9dce5]"><TerminalSquare className="size-3.5" /> AGENT LOG</div><Badge tone={running && progress < 100 ? "info" : "success"}>{running && progress < 100 ? "Working" : "Preview ready"}</Badge></div><div className="mono mt-3 space-y-1.5 text-[8px] leading-4 text-[#929bad]"><p><span className="text-[#9ca7ff]">agent</span> read approved brief and customer constraints</p><p><span className="text-[#90a5e8]">browser</span> rendering {previewUrl}</p><p><span className="text-[#9ca7ff]">agent</span> preserved service area and consultation conversion path</p><p><span className="text-[#c9a56c]">check</span> mobile viewport · navigation · image loading</p><p className="flex items-center gap-1 text-[#d9dce5]"><Code2 className="size-3" /> {progress < 100 ? `assembling revision ${selected.project.revisionCount + 1}…` : "local preview is ready for operator review"}</p></div></div>
        </div>
      </div>
    </section>
  </div>;
}
