"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Bot, Check, ChevronLeft, ChevronRight, CirclePause, Globe2, MapPin, Play, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Business } from "@/lib/db/schema";
import { runSandboxDiscoveryAction } from "@/lib/actions/campaign";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions/types";

const steps = [
  { title: "Search local listings", detail: "East Bay service businesses without a first-party website" },
  { title: "Inspect business footprint", detail: "Listing completeness, category, location, and website status" },
  { title: "Draft useful context", detail: "Summarize the likely website opportunity for qualification" },
  { title: "Apply outreach rules", detail: "Exclude DNC records and hold all contact until policy gates pass" },
];

export function ProspectingBrowser({
  businesses,
  campaign,
  sandbox,
  liveDiscoveryReady,
}: {
  businesses: Business[];
  campaign: { id: string; name: string; vertical: string; region: string } | null;
  sandbox: boolean;
  liveDiscoveryReady: boolean;
}) {
  const effectiveLiveDiscoveryReady = !sandbox && liveDiscoveryReady;
  const eligible = useMemo(() => businesses.filter((business) => !business.doNotCall).slice(0, 5), [businesses]);
  const [running, setRunning] = useState(true);
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setStep((current) => (current + 1) % steps.length), 2400);
    return () => window.clearInterval(timer);
  }, [running]);

  const focus = eligible[step % Math.max(eligible.length, 1)];
  const sourceLabel = focus?.source === "zero" ? "ZERO DISCOVERY RESULT" : focus?.source === "sandbox" ? "SANDBOX DATA" : "PIPELINE RECORD";

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_360px]">
      <section className="overflow-hidden rounded-[6px] border border-[#2c332d] bg-[#111512] shadow-[0_18px_50px_rgba(17,21,18,0.12)]" aria-label="Prospecting discovery">
        <div className="flex h-12 items-center gap-2 border-b border-[#343a35] bg-[#1b201c] px-3 text-[#aeb6ae]">
          <div className="mr-1 flex gap-1.5" aria-hidden="true"><span className="size-2.5 rounded-full bg-[#ff6b5f]" /><span className="size-2.5 rounded-full bg-[#eebd45]" /><span className="size-2.5 rounded-full bg-[#72c66c]" /></div>
          <button className="grid size-7 place-items-center rounded-[4px] hover:bg-[#2a302b]" aria-label="Back"><ChevronLeft className="size-3.5" /></button>
          <button className="grid size-7 place-items-center rounded-[4px] text-[#667067]" aria-label="Forward"><ChevronRight className="size-3.5" /></button>
          <button className="grid size-7 place-items-center rounded-[4px] hover:bg-[#2a302b]" aria-label="Refresh discovery evidence"><RefreshCw className="size-3.5" /></button>
          <div className="mono flex min-w-0 flex-1 items-center gap-2 rounded-[4px] border border-[#3a423b] bg-[#101411] px-3 py-1.5 text-[9px] text-[#b8c1b9]"><ShieldCheck className="size-3 shrink-0 text-[#b8ef4a]" /><span className="truncate">buildstax://prospecting/{campaign?.id ?? "no-active-campaign"}</span></div>
          <Badge tone={effectiveLiveDiscoveryReady ? "success" : "neutral"}>{effectiveLiveDiscoveryReady ? "Live ready" : sandbox ? "Sandbox" : "Needs Zero"}</Badge>
        </div>
        <div className="grid min-h-[520px] bg-[#f7f8f5] lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
            <div className="border-b border-border bg-white px-5 py-4">
              <div className="flex items-center gap-2"><Globe2 className="size-4 text-[#285df5]" /><span className="text-[13px] font-extrabold">{campaign ? campaign.name : "Discovery evidence"}</span></div>
              <div className="mt-3 flex h-10 items-center gap-2 rounded-[5px] border border-[#cbd2cb] bg-white px-3 shadow-sm"><Search className="size-4 text-muted-foreground" /><span className="min-w-0 truncate text-[11px]">{campaign ? `${campaign.vertical} in ${campaign.region}` : "Activate a campaign to begin discovery"}</span></div>
            </div>
            <div className="space-y-2 p-4">
              <div className="mb-3 flex items-center justify-between"><span className="mono text-[9px] text-muted-foreground">PERSISTED PIPELINE RESULTS</span><span className="text-[9px] font-bold text-success">{eligible.length} eligible</span></div>
              {eligible.map((business, index) => {
                const active = focus?.id === business.id;
                return <article key={business.id} className={`rounded-[5px] border bg-white p-3 transition-all ${active ? "border-[#285df5] shadow-[0_0_0_2px_rgba(40,93,245,0.12)]" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-[11px] font-extrabold">{business.name}</span>{active ? <span className="size-1.5 animate-pulse rounded-full bg-[#285df5]" /> : null}</div><div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground"><MapPin className="size-3" />{business.category} · {business.location}</div></div><span className="mono text-[9px] font-semibold">{business.score}/100</span></div>
                  <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={business.websiteStatus === "none" ? "warning" : "neutral"}>{business.websiteStatus === "none" ? "No website" : `${business.websiteStatus} site`}</Badge><Badge tone="info">Candidate {index + 1}</Badge></div>
                </article>;
              })}
            </div>
          </div>
          <aside className="bg-[#eef1ed] p-4">
            <div className="flex items-center gap-2"><Bot className="size-4" /><span className="text-[11px] font-extrabold">Content engine</span></div>
            <div className="mt-4 space-y-4">
              {steps.map((item, index) => <div key={item.title} className="flex gap-2.5"><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[9px] ${index < step ? "border-[#7dac30] bg-[#b8ef4a] text-[#172007]" : index === step ? "border-[#285df5] bg-[#eaf0ff] text-[#285df5]" : "border-[#c8cec8] bg-white text-[#8b938c]"}`}>{index < step ? <Check className="size-3" /> : index + 1}</span><div><div className="text-[9px] font-bold leading-4">{item.title}</div><div className="mt-0.5 text-[8px] leading-3.5 text-muted-foreground">{item.detail}</div></div></div>)}
            </div>
          </aside>
        </div>
        <div className="flex flex-col gap-3 border-t border-[#343a35] bg-[#1b201c] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-[9px] text-[#aab3ab]"><span className={`size-2 shrink-0 rounded-full ${running ? "animate-pulse bg-[#b8ef4a]" : "bg-[#eebd45]"}`} /><span className="truncate">{running ? `Reviewing ${focus?.name ?? "persisted results"}` : "Evidence review paused by operator"}</span></div>
          <Button variant="secondary" size="sm" onClick={() => setRunning((value) => !value)}>{running ? <CirclePause /> : <Play />}{running ? "Pause session" : "Resume session"}</Button>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="panel">
          <div className="panel-header"><div><h2 className="section-title">Autonomy queue</h2><p className="mt-0.5 text-[10px] text-muted-foreground">System-owned work, policy gated</p></div><Sparkles className="size-4 text-[#285df5]" /></div>
          <div className="divide-y divide-border">
            <QueueRow label="Search and enrich" value={effectiveLiveDiscoveryReady ? "Live ready" : sandbox ? "Sandbox data" : "Blocked"} tone={effectiveLiveDiscoveryReady ? "success" : sandbox ? "info" : "warning"} detail={effectiveLiveDiscoveryReady ? "Bounded Zero discovery with recorded run evidence" : sandbox ? "Fixture data remains isolated from paid provider calls" : "Authenticate and enable the capped Zero discovery policy"} />
            <QueueRow label="Qualification" value="Automatic" tone="info" detail="Website gap, fit, and contact quality" />
            <QueueRow label="First contact" value="Held" tone="warning" detail="Phone-first workflow; no browser outreach" />
            <QueueRow label="Follow-up" value="Policy gated" tone="neutral" detail="Email only after recorded call outcome" />
          </div>
        </section>
        <section className="panel p-4">
          <div className="eyebrow">Current finding</div>
          <div className="mt-3 text-[13px] font-extrabold">{focus?.name ?? "No qualified prospects yet"}</div>
          <p className="mt-2 text-[10px] leading-5 text-muted-foreground">{focus ? `${focus.name} has a ${focus.websiteStatus === "none" ? "missing" : focus.websiteStatus} website status and was retained under ${sourceLabel.toLowerCase()}. Outreach remains blocked until the phone-first workflow permits it.` : "Run discovery from an active campaign to create governed prospect records."}</p>
          <div className="mono mt-4 rounded-[5px] bg-[#111512] px-3 py-2.5 text-[9px] leading-5 text-[#b8c1b9]">source: {focus?.source ?? "none"}<br />network actions: {effectiveLiveDiscoveryReady ? "policy capped" : "not enabled"}<br />customer contact: held</div>
        </section>
        {campaign ? <DiscoveryRunControl campaignId={campaign.id} sandbox={sandbox} /> : null}
      </aside>
    </div>
  );
}

function DiscoveryRunControl({ campaignId, sandbox }: { campaignId: string; sandbox: boolean }) {
  const [state, action] = useActionState(runSandboxDiscoveryAction, initialActionState);
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);
  return <form action={action} className="panel p-4"><input type="hidden" name="campaignId" value={campaignId} /><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-bold">{sandbox ? "Sandbox discovery" : "Guarded Zero discovery"}</div><p className="mt-1 text-[9px] leading-4 text-muted-foreground">{sandbox ? "Adds isolated evaluation records only." : "Search, schema inspection, spend cap, and provider review run as one audited action."}</p></div><SubmitButton variant="secondary" size="sm" pendingLabel="Discovering…"><Search /> {sandbox ? "Add data" : "Run discovery"}</SubmitButton></div>{state.status === "error" ? <div className="mt-3"><FormMessage state={state} /></div> : null}</form>;
}

function QueueRow({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "success" | "info" | "warning" | "neutral" }) {
  return <div className="px-4 py-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold">{label}</span><Badge tone={tone}>{value}</Badge></div><div className="mt-1 text-[9px] text-muted-foreground">{detail}</div></div>;
}
