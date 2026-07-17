"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Check, ChevronLeft, ChevronRight, CirclePause, Globe2, MapPin, Play, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { Business } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const steps = [
  { title: "Search local listings", detail: "East Bay service businesses without a first-party website" },
  { title: "Inspect business footprint", detail: "Listing completeness, category, location, and website status" },
  { title: "Draft useful context", detail: "Summarize the likely website opportunity for qualification" },
  { title: "Apply outreach rules", detail: "Exclude DNC records and hold all contact until policy gates pass" },
];

export function ProspectingBrowser({ businesses }: { businesses: Business[] }) {
  const eligible = useMemo(() => businesses.filter((business) => !business.doNotCall).slice(0, 5), [businesses]);
  const [running, setRunning] = useState(true);
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setStep((current) => (current + 1) % steps.length), 2400);
    return () => window.clearInterval(timer);
  }, [running]);

  const focus = eligible[step % Math.max(eligible.length, 1)];

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_360px]">
      <section className="overflow-hidden rounded-[10px] border border-[#30384b] bg-[#151a29] shadow-[0_14px_38px_rgba(18,24,40,0.12)]" aria-label="Local browser session">
        <div className="flex h-12 items-center gap-2 border-b border-[#343c4f] bg-[#1b2132] px-3 text-[#adb4c2]">
          <div className="mr-1 flex gap-1.5" aria-hidden="true"><span className="size-2.5 rounded-full bg-[#a9afbb]" /><span className="size-2.5 rounded-full bg-[#9da4b2]" /><span className="size-2.5 rounded-full bg-[#8d96a6]" /></div>
          <button className="grid size-7 place-items-center rounded-[6px] hover:bg-white/[0.06]" aria-label="Back"><ChevronLeft className="size-3.5" /></button>
          <button className="grid size-7 place-items-center rounded-[4px] text-[#667067]" aria-label="Forward"><ChevronRight className="size-3.5" /></button>
          <button className="grid size-7 place-items-center rounded-[6px] hover:bg-white/[0.06]" aria-label="Reload local search"><RefreshCw className="size-3.5" /></button>
          <div className="mono flex min-w-0 flex-1 items-center gap-2 rounded-[7px] border border-[#3a4357] bg-[#121625] px-3 py-1.5 text-[9px] text-[#bac0cc]"><ShieldCheck className="size-3 shrink-0 text-[#9ca7ff]" /><span className="truncate">local://prospecting/east-bay/service-businesses</span></div>
          <Badge tone="success">Local only</Badge>
        </div>
        <div className="grid min-h-[520px] bg-[#f7f8fa] lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
            <div className="border-b border-border bg-white px-5 py-4">
              <div className="flex items-center gap-2"><Globe2 className="size-4 text-[#5266ed]" /><span className="text-[13px] font-extrabold">Local business search</span></div>
              <div className="mt-3 flex h-10 items-center gap-2 rounded-[8px] border border-border bg-white px-3 shadow-sm"><Search className="size-4 text-muted-foreground" /><span className="min-w-0 truncate text-[11px]">service businesses near Oakland without a website</span></div>
            </div>
            <div className="space-y-2 p-4">
              <div className="mb-3 flex items-center justify-between"><span className="mono text-[9px] text-muted-foreground">LOCAL FIXTURE RESULTS</span><span className="text-[9px] font-bold text-success">{eligible.length} eligible</span></div>
              {eligible.map((business, index) => {
                const active = focus?.id === business.id;
                return <article key={business.id} className={`rounded-[8px] border bg-white p-3 transition-[border-color,box-shadow] duration-100 ${active ? "border-[#7180e8] shadow-[0_0_0_2px_rgba(82,102,237,0.1)]" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-[11px] font-extrabold">{business.name}</span>{active ? <span className="size-1.5 animate-pulse rounded-full bg-[#5266ed]" /> : null}</div><div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground"><MapPin className="size-3" />{business.category} · {business.location}</div></div><span className="mono text-[9px] font-semibold">{business.score}/100</span></div>
                  <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={business.websiteStatus === "none" ? "warning" : "neutral"}>{business.websiteStatus === "none" ? "No website" : `${business.websiteStatus} site`}</Badge><Badge tone="info">Candidate {index + 1}</Badge></div>
                </article>;
              })}
            </div>
          </div>
          <aside className="bg-[#eff1f5] p-4">
            <div className="flex items-center gap-2"><Bot className="size-4" /><span className="text-[11px] font-extrabold">Content engine</span></div>
            <div className="mt-4 space-y-4">
              {steps.map((item, index) => <div key={item.title} className="flex gap-2.5"><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border text-[9px] ${index < step ? "border-[#cbd2fb] bg-[#dfe3ff] text-[#4454bd]" : index === step ? "border-[#7180e8] bg-[#eef0ff] text-[#5266ed]" : "border-[#cfd3dc] bg-white text-[#858c99]"}`}>{index < step ? <Check className="size-3" /> : index + 1}</span><div><div className="text-[9px] font-bold leading-4">{item.title}</div><div className="mt-0.5 text-[8px] leading-3.5 text-muted-foreground">{item.detail}</div></div></div>)}
            </div>
          </aside>
        </div>
        <div className="flex flex-col gap-3 border-t border-[#343c4f] bg-[#1b2132] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-[9px] text-[#adb4c2]"><span className={`size-2 shrink-0 rounded-full ${running ? "animate-pulse bg-[#8794f3]" : "bg-[#c9a56c]"}`} /><span className="truncate">{running ? `Inspecting ${focus?.name ?? "local fixtures"}` : "Session paused by operator"}</span></div>
          <Button variant="secondary" size="sm" onClick={() => setRunning((value) => !value)}>{running ? <CirclePause /> : <Play />}{running ? "Pause session" : "Resume session"}</Button>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="panel">
          <div className="panel-header"><div><h2 className="section-title">Autonomy queue</h2><p className="mt-0.5 text-[10px] text-muted-foreground">System-owned work, policy gated</p></div><Sparkles className="size-4 text-[#5266ed]" /></div>
          <div className="divide-y divide-border">
            <QueueRow label="Search and enrich" value="Running" tone="success" detail="Local browser session · 5 candidates" />
            <QueueRow label="Qualification" value="Automatic" tone="info" detail="Website gap, fit, and contact quality" />
            <QueueRow label="First contact" value="Held" tone="warning" detail="Phone-first workflow; no browser outreach" />
            <QueueRow label="Follow-up" value="Policy gated" tone="neutral" detail="Email only after recorded call outcome" />
          </div>
        </section>
        <section className="panel p-4">
          <div className="eyebrow">Current finding</div>
          <div className="mt-3 text-[13px] font-extrabold">{focus?.name ?? "Scanning local fixtures"}</div>
          <p className="mt-2 text-[10px] leading-5 text-muted-foreground">{focus ? `${focus.name} appears to have a ${focus.websiteStatus === "none" ? "missing" : focus.websiteStatus} first-party site. The engine is assembling category and location context before deciding whether it belongs in the call-ready queue.` : "The local engine is waiting for candidates."}</p>
          <div className="mono mt-4 rounded-[8px] bg-[#171c2b] px-3 py-2.5 text-[9px] leading-5 text-[#bac0cc]">runtime: localhost<br />network actions: disabled<br />customer contact: none</div>
        </section>
      </aside>
    </div>
  );
}

function QueueRow({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "success" | "info" | "warning" | "neutral" }) {
  return <div className="px-4 py-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold">{label}</span><Badge tone={tone}>{value}</Badge></div><div className="mt-1 text-[9px] text-muted-foreground">{detail}</div></div>;
}
