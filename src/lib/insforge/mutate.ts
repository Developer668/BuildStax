import "server-only";

import type { InsForgeClient } from "@insforge/sdk";
import { randomUUID } from "node:crypto";
import { emitNexlaEvent, type NexlaAgentEvent } from "@/lib/integrations/nexla";
import type { InsForgeRow } from "./map";

export function mutationId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export async function findWorkspaceRow(client: InsForgeClient, workspaceId: string, table: string, id: string) {
  const { data, error } = await client.database.from(table).select().eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as InsForgeRow | null) ?? null;
}

export function assertMutation(result: { error: unknown }, fallback: string) {
  if (result.error) throw Object.assign(new Error(fallback), { cause: result.error });
}

export async function recordInsForgeAudit(
  client: InsForgeClient,
  workspaceId: string,
  input: { actorId: string; action: string; entityType: string; entityId: string; detail: string },
) {
  const result = await client.database.rpc("record_buildstax_audit_v2", {
    p_workspace_id: workspaceId,
    p_audit_id: mutationId("aud"),
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_detail: input.detail,
  });
  assertMutation(result, "InsForge could not record the audit event.");
  await flushNexlaOutbox(client, workspaceId, 10);
}

export async function flushNexlaOutbox(client: InsForgeClient, workspaceId: string, limit = 20) {
  const pending = await client.database.rpc("get_buildstax_pending_outbox", {
    p_workspace_id: workspaceId,
    p_limit: limit,
  });
  if (pending.error || !Array.isArray(pending.data)) return { delivered: 0, pending: 0 };

  let delivered = 0;
  for (const row of pending.data as Array<{ outbox_id?: unknown; payload?: unknown }>) {
    const outboxId = typeof row.outbox_id === "string" ? row.outbox_id : "";
    const payload = row.payload;
    if (!outboxId || !payload || typeof payload !== "object") continue;
    const result = await emitNexlaEvent(payload as NexlaAgentEvent);
    const attempt = await client.database.rpc("record_buildstax_outbox_attempt", {
      p_workspace_id: workspaceId,
      p_outbox_id: outboxId,
      p_delivered: result.delivered,
      p_error: result.delivered ? "" : result.reason,
    });
    if (!attempt.error && result.delivered) delivered += 1;
  }
  return { delivered, pending: Math.max(0, pending.data.length - delivered) };
}
