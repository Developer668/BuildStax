import { Activity, Bot, ChevronDown, Clock3, MessageSquareText, PhoneCall, RefreshCw, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import { listArchivedCallTranscripts, type ArchivedCallTranscript } from "@/lib/integrations/transcript-archive";

export const metadata: Metadata = { title: "Call transcripts" };
export const dynamic = "force-dynamic";

function durationLabel(seconds: number) {
  if (!seconds) return "Duration not reported";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function statusTone(status: ArchivedCallTranscript["status"]): "neutral" | "warning" | "success" | "danger" {
  if (status === "completed") return "success";
  if (status === "failed" || status === "cancelled") return "danger";
  if (status === "ringing" || status === "in_progress") return "warning";
  return "neutral";
}

export default async function CallTranscriptsPage() {
  const calls = await listArchivedCallTranscripts();
  const callerTurns = calls.reduce((total, call) => total + call.turns.filter((turn) => turn.role === "caller").length, 0);
  const agentTurns = calls.reduce((total, call) => total + call.turns.filter((turn) => turn.role === "agent").length, 0);
  const completed = calls.filter((call) => call.status === "completed").length;

  return (
    <>
      <PageHeader
        eyebrow="Voice observability"
        title="Call transcripts"
        description="A read-only archive of caller input and BuildStax AI output. Live phone handling remains isolated from this viewer."
        icon={MessageSquareText}
        action={<Link href="/runs/call-transcripts" className={buttonVariants({ variant: "secondary" })}><RefreshCw /> Refresh</Link>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={PhoneCall} label="Archived calls" value={calls.length} />
        <StatCard icon={Activity} label="Completed" value={completed} />
        <StatCard icon={UserRound} label="Caller turns" value={callerTurns} />
        <StatCard icon={Bot} label="AI turns" value={agentTurns} />
      </div>

      <section className="panel overflow-hidden">
        <div className="panel-header">
          <div><h2 className="section-title">Voice conversations</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Newest calls first. Transcripts are written when the voice session closes.</p></div>
          <Badge tone="neutral">Read only</Badge>
        </div>
        {calls.length ? <div className="divide-y divide-border">{calls.map((call, index) => (
          <details key={call.id} className="group" open={index === 0}>
            <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-4 transition-colors hover:bg-[#fafbfa] sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-[8px] border border-border bg-surface-subtle"><PhoneCall className="size-4 text-muted-foreground" /></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-[12px] font-extrabold capitalize">{call.direction} call</span><Badge tone={statusTone(call.status)}>{call.status.replaceAll("_", " ")}</Badge></div>
                  <div className="mono mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground"><span>{formatDateTime(call.updatedAt)}</span><span>{durationLabel(call.durationSeconds)}</span><span>{call.turns.length} turns</span>{call.callId ? <span>Call {call.callId.slice(0, 8)}</span> : null}</div>
                </div>
              </div>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-border bg-[#fafbfc] px-4 py-5 sm:px-6">
              {call.turns.length ? <div className="mx-auto max-w-4xl space-y-3">{call.turns.map((turn, turnIndex) => (
                <article key={`${call.id}-${turnIndex}`} className={`flex gap-3 ${turn.role === "caller" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[88%] rounded-[10px] border px-4 py-3 sm:max-w-[78%] ${turn.role === "caller" ? "border-border bg-white" : "border-[#d8dcf4] bg-[#f4f5fb]"}`}>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{turn.role === "caller" ? <UserRound className="size-3" /> : <Bot className="size-3" />}{turn.role === "caller" ? "Caller" : "BuildStax AI"}</div>
                    <p className="whitespace-pre-wrap text-[12px] leading-5 text-[#333a46]">{turn.text}</p>
                  </div>
                </article>
              ))}</div> : <div className="flex min-h-28 flex-col items-center justify-center text-center"><Clock3 className="size-4 text-muted-foreground" /><p className="mt-2 text-[11px] font-bold">No completed transcript</p><p className="mt-1 text-[10px] text-muted-foreground">This call ended before any caller or AI speech was stored.</p></div>}
            </div>
          </details>
        ))}</div> : <EmptyState icon={MessageSquareText} title="No call transcripts yet" description="Complete a local phone call, then refresh this page to view caller and AI turns." />}
      </section>
    </>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof PhoneCall; label: string; value: number }) {
  return <div className="panel flex items-center gap-3 p-4"><div className="grid size-9 place-items-center rounded-[8px] border border-border bg-surface-subtle"><Icon className="size-4 text-muted-foreground" /></div><div><div className="text-[20px] font-extrabold tracking-[-0.02em]">{value}</div><div className="text-[10px] font-semibold text-muted-foreground">{label}</div></div></div>;
}
