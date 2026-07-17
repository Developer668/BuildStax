import { Badge } from "@/components/ui/badge";
import { stageMeta, type BusinessStage } from "@/lib/domain";

export function StageBadge({ stage }: { stage: string }) {
  const meta = stageMeta[stage as BusinessStage] ?? { label: stage.replaceAll("_", " "), tone: "neutral" as const };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function RunStatusBadge({ status }: { status: string }) {
  const tone = status === "succeeded" ? "success" : status === "failed" ? "danger" : status === "blocked" ? "warning" : status === "running" ? "info" : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}

export function ModeBadge({ mode }: { mode: string }) {
  return <Badge tone={mode === "live" ? "success" : mode === "sandbox" ? "warning" : "neutral"}>{mode}</Badge>;
}
