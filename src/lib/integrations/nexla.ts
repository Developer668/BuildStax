import "server-only";

import { z } from "zod";

const eventSchema = z.object({
  workspaceId: z.string().min(1).max(100),
  actorId: z.string().min(1).max(160),
  action: z.string().min(2).max(160),
  entityType: z.string().min(2).max(80),
  entityId: z.string().min(1).max(200),
  detail: z.string().min(2).max(4000),
  createdAt: z.string().datetime(),
});

export type NexlaAgentEvent = z.infer<typeof eventSchema>;

export async function emitNexlaEvent(input: NexlaAgentEvent) {
  const webhook = process.env.NEXLA_INGEST_URL;
  if (!webhook) return { delivered: false, reason: "not_configured" as const };
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { delivered: false, reason: "invalid_event" as const };
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event_id: `${parsed.data.action}:${parsed.data.entityId}:${parsed.data.createdAt}`,
        workspace_id: parsed.data.workspaceId,
        actor_id: parsed.data.actorId,
        event_type: parsed.data.action,
        entity_type: parsed.data.entityType,
        entity_id: parsed.data.entityId,
        summary: parsed.data.detail,
        occurred_at: parsed.data.createdAt,
        source: "buildstax",
      }),
      signal: AbortSignal.timeout(4_000),
    });
    return response.ok ? { delivered: true as const } : { delivered: false, reason: "upstream_error" as const };
  } catch {
    return { delivered: false, reason: "network_error" as const };
  }
}

export async function getNexlaReadiness() {
  if (!process.env.NEXLA_API_URL || !process.env.NEXLA_TOKEN || !process.env.NEXLA_INGEST_URL) {
    return { status: "partial" as const, detail: "Nexla runtime configuration is incomplete." };
  }
  try {
    const response = await fetch(`${process.env.NEXLA_API_URL.replace(/\/$/, "")}/nexla/context`, {
      headers: { authorization: `Bearer ${process.env.NEXLA_TOKEN}` },
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok
      ? { status: "ready" as const, detail: "Authenticated context and the BuildStax event-ingestion boundary are configured." }
      : { status: "partial" as const, detail: "The webhook is configured, but the Nexla context check failed." };
  } catch {
    return { status: "partial" as const, detail: "The Nexla context endpoint was not reachable." };
  }
}
