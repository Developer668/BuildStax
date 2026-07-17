"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { activePipelineStages, stageMeta } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input, SelectInput } from "@/components/ui/input";

export function PipelineFilters({ campaigns }: { campaigns: Array<{ id: string; name: string }> }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [optimisticStage, setOptimisticStage] = useState(searchParams.get("stage") ?? "all");
  const [optimisticCampaign, setOptimisticCampaign] = useState(searchParams.get("campaign") ?? "all");
  const [isPending, startTransition] = useTransition();

  const activeStage = isPending ? optimisticStage : searchParams.get("stage") ?? "all";
  const activeCampaign = isPending ? optimisticCampaign : searchParams.get("campaign") ?? "all";

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search.trim()) params.set("search", search.trim());
      else params.delete("search");
      const query = params.toString();
      if (query === searchParams.toString()) return;
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [pathname, router, search, searchParams]);

  function setParam(key: string, value: string) {
    if (key === "stage") setOptimisticStage(value);
    if (key === "campaign") setOptimisticCampaign(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  const hasFilters = Boolean(search || searchParams.get("stage") || searchParams.get("campaign"));
  return (
    <div className="border-b border-border bg-[#f8f9fb] p-3" aria-busy={isPending}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 xl:pb-0" aria-label="Stage filter">
          <button onClick={() => setParam("stage", "all")} className={`h-8 shrink-0 rounded-[7px] px-2.5 text-[10px] font-bold transition-colors duration-100 ${activeStage === "all" ? "bg-[#171c2b] text-white" : "text-muted-foreground hover:bg-muted"}`}>All</button>
          {activePipelineStages.slice(0, 7).map((stage) => (
            <button key={stage} onClick={() => setParam("stage", stage)} className={`h-8 shrink-0 rounded-[7px] px-2.5 text-[10px] font-bold transition-colors duration-100 ${activeStage === stage ? "bg-[#171c2b] text-white" : "text-muted-foreground hover:bg-muted"}`}>{stageMeta[stage].shortLabel}</button>
          ))}
          <button onClick={() => setParam("stage", "won")} className={`h-8 shrink-0 rounded-[7px] px-2.5 text-[10px] font-bold transition-colors duration-100 ${activeStage === "won" ? "bg-[#171c2b] text-white" : "text-muted-foreground hover:bg-muted"}`}>Won</button>
          <button onClick={() => setParam("stage", "dnc")} className={`h-8 shrink-0 rounded-[7px] px-2.5 text-[10px] font-bold transition-colors duration-100 ${activeStage === "dnc" ? "bg-[#171c2b] text-white" : "text-muted-foreground hover:bg-muted"}`}>DNC</button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 sm:w-64"><Search className="absolute left-3 top-3 size-3.5 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search businesses" aria-label="Search businesses" className="h-9 pl-9" /></div>
          <SelectInput value={activeCampaign} onChange={(event) => setParam("campaign", event.target.value)} aria-label="Filter by campaign" className="h-9 sm:w-52"><option value="all">All campaigns</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</SelectInput>
          {hasFilters ? <Button variant="ghost" size="icon" onClick={() => { setSearch(""); setOptimisticStage("all"); setOptimisticCampaign("all"); startTransition(() => router.replace(pathname)); }} aria-label="Clear filters"><X /></Button> : null}
        </div>
      </div>
    </div>
  );
}
