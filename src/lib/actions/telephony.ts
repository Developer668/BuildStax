"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isInsForgeBackend } from "@/lib/backend";
import { requireMutationUser } from "@/lib/auth/session";
import { mapBusiness, type InsForgeRow } from "@/lib/insforge/map";
import { requireInsForgeContext } from "@/lib/insforge/context";
import { findWorkspaceRow, recordInsForgeAudit } from "@/lib/insforge/mutate";
import { plivoConfig, safePlivoMessage, startPlivoCall } from "@/lib/integrations/plivo";
import { normalizeE164 } from "@/lib/integrations/plivo-protocol";
import { createTelephonySession, updateTelephonySession } from "@/lib/integrations/telephony-store";
import { isSandbox } from "@/lib/utils";
import { actionError, actionSuccess } from "./helpers";
import type { ActionState } from "./types";

const schema = z.object({ businessId: z.string().trim().min(1).max(120) });
const callableStages = new Set(["call_ready", "contacted", "interested", "quoted", "payment_pending"]);

async function consumeCallLimit(admin: Awaited<ReturnType<typeof requireInsForgeContext>>["admin"], key: string, limit: number) {
  const result = await admin.database.rpc("consume_buildstax_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: 60 * 60,
  });
  if (result.error) throw result.error;
  return (result.data as { allowed?: boolean } | null)?.allowed === true;
}

export async function startPlivoCallAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isInsForgeBackend()) return actionError("Live Plivo calls require the InsForge backend.");
  const user = await requireMutationUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("The business record is invalid.");
  const { client, admin, workspaceId } = await requireInsForgeContext();
  const row = await findWorkspaceRow(client, workspaceId, "businesses", parsed.data.businessId);
  if (!row) return actionError("Business not found.");
  const business = mapBusiness(row);
  if (business.doNotCall || business.stage === "dnc") return actionError("Outreach is permanently blocked for this business.");
  if (!callableStages.has(business.stage)) return actionError("This business is not in a callable pipeline stage.");

  const recentResult = await admin.database.from("telephony_sessions")
    .select("id, status, created_at")
    .eq("workspace_id", workspaceId)
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (recentResult.error) return actionError("InsForge could not verify the call queue.");
  const recent = ((recentResult.data ?? []) as InsForgeRow[])[0];
  if (recent && ["requested", "ringing", "in_progress"].includes(String(recent.status))) {
    return actionError("A Plivo call is already active for this business.");
  }

  const mode = isSandbox() ? "sandbox" as const : "live" as const;
  const sessionId = `tel_${randomUUID()}`;
  try {
    const config = plivoConfig();
    const destination = normalizeE164(business.phone);
    const [businessAllowed, workspaceAllowed] = await Promise.all([
      consumeCallLimit(admin, `voice:business:${workspaceId}:${business.id}`, 5),
      consumeCallLimit(admin, `voice:workspace:${workspaceId}:${user.id}`, 20),
    ]);
    if (!businessAllowed || !workspaceAllowed) return actionError("The outbound call limit has been reached. Try again later.");
    const from = mode === "sandbox" ? config.testNumber : config.primaryNumber;
    await createTelephonySession({
      id: sessionId,
      workspaceId,
      businessId: business.id,
      direction: "outbound",
      status: "requested",
      mode,
      fromNumber: from,
      toNumber: destination,
    });
    const call = await startPlivoCall({ sessionId, to: destination, mode });
    await updateTelephonySession(sessionId, { provider_request_id: call.requestId });
    await recordInsForgeAudit(client, workspaceId, {
      actorId: user.id,
      action: "telephony.call_requested",
      entityType: "business",
      entityId: business.id,
      detail: `Requested a ${mode} Plivo call from the approved caller ID.`,
    });
    revalidatePath(`/businesses/${business.id}`);
    revalidatePath("/runs");
    return actionSuccess("Plivo accepted the call request and is dialing.");
  } catch (error) {
    await updateTelephonySession(sessionId, { status: "failed", error: safePlivoMessage(error), ended_at: new Date().toISOString() }).catch(() => undefined);
    return actionError(safePlivoMessage(error));
  }
}
